/**
 * Snapshot live, keyless stablecoin feeds that sit outside the Allium pipeline.
 *
 * Three lenses, each read from public endpoints that need no API key:
 *   1. Local-currency stablecoins: supply by peg currency (DefiLlama), mapped to
 *      the issuing country so non-USD rails (EUR, JPY, BRL, MXN, SGD...) show up.
 *   2. USD stablecoin net issuance: 1d / 7d / 30d supply change by token and the
 *      chain split (DefiLlama), cross-checked against Tether and Circle.
 *   3. On/off-ramp pulse: USDT price and 24h volume against local fiat on venues
 *      operating in that country (Upbit, BtcTurk, Bitso, Mercado Bitcoin, VALR,
 *      Indodax, Bitkub, Coins.ph, CriptoYa, Binance P2P...), and the premium over
 *      a reference FX rate (central bank where keyless, else ExchangeRate-API).
 *
 * Writes JSON to stdout, or to --out=<path>. Nothing is written to MongoDB. A
 * feed that fails is listed under `failures`; the rest of the snapshot still
 * completes.
 *
 * Usage:
 *   npm run live-sources:snapshot
 *   npm run live-sources:snapshot -- --out=live-sources.json
 */

import { writeFileSync } from 'node:fs';
import { resolveCountryId } from '../shared/iso3166';

const UA = 'stable-tracker/1.0 (https://stabletracker.org; live-sources-snapshot)';
const TIMEOUT_MS = 20_000;
const DAY_SECONDS = 86_400;
const EU_AGGREGATE_ID = '999';

const LLAMA_URL = 'https://stablecoins.llama.fi/stablecoins?includePrices=true';
const TETHER_URL = 'https://app.tether.to/transparency.json';
const CIRCLE_URL = 'https://api.circle.com/v1/stablecoins';
const ER_API_URL = 'https://open.er-api.com/v6/latest/USD';
const BCRA_URL = 'https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/5?limit=1';
const BCB_URL = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.1/dados/ultimos/1?formato=json';
const TRM_URL =
    'https://www.datos.gov.co/resource/32sa-8pi3.json?$limit=1&$order=vigenciadesde%20DESC';
const ECB_URL =
    'https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?lastNObservations=1&format=jsondata';
const BINANCE_P2P_URL = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';

/** DefiLlama peg type → ISO 4217 code, for pegs that are one country's currency. */
const PEG_CURRENCY: Record<string, string> = {
    peggedEUR: 'EUR',
    peggedJPY: 'JPY',
    peggedGBP: 'GBP',
    peggedCHF: 'CHF',
    peggedCAD: 'CAD',
    peggedAUD: 'AUD',
    peggedREAL: 'BRL',
    peggedMXN: 'MXN',
    peggedARS: 'ARS',
    peggedCOP: 'COP',
    peggedCLP: 'CLP',
    peggedPEN: 'PEN',
    peggedSGD: 'SGD',
    peggedHKD: 'HKD',
    peggedKRW: 'KRW',
    peggedCNY: 'CNY',
    peggedPHP: 'PHP',
    peggedMYR: 'MYR',
    peggedTRY: 'TRY',
    peggedRUB: 'RUB',
    peggedUAH: 'UAH',
    peggedKES: 'KES',
    peggedNGN: 'NGN',
    peggedGHS: 'GHS',
    peggedZAR: 'ZAR',
    peggedXOF: 'XOF',
};

/**
 * Peg currency → the country whose money it is (alpha-2), or the EU aggregate.
 * XOF is shared by the eight WAEMU states, so it maps to no single country.
 */
const CURRENCY_COUNTRY: Record<string, string> = {
    EUR: 'EU',
    JPY: 'JP',
    GBP: 'GB',
    CHF: 'CH',
    CAD: 'CA',
    AUD: 'AU',
    BRL: 'BR',
    MXN: 'MX',
    ARS: 'AR',
    COP: 'CO',
    CLP: 'CL',
    PEN: 'PE',
    SGD: 'SG',
    HKD: 'HK',
    KRW: 'KR',
    CNY: 'CN',
    PHP: 'PH',
    MYR: 'MY',
    TRY: 'TR',
    RUB: 'RU',
    UAH: 'UA',
    KES: 'KE',
    NGN: 'NG',
    GHS: 'GH',
    ZAR: 'ZA',
};

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function request(url: string, init: RequestInit = {}): Promise<Response> {
    const response = await fetch(url, {
        ...init,
        headers: { 'User-Agent': UA, Accept: 'application/json', ...init.headers },
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return response;
}

async function getJson<T>(url: string, init: RequestInit = {}): Promise<T> {
    return (await (await request(url, init)).json()) as T;
}

function num(value: unknown): number | null {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string' && value.trim() !== '') {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

function median(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function pctChange(current: number, previous: number | undefined): number | null {
    if (!previous) return null;
    return ((current - previous) / previous) * 100;
}

function round(value: number | null, digits = 2): number | null {
    if (value === null) return null;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function countryIdFor(alpha2: string): string | null {
    return alpha2 === 'EU' ? EU_AGGREGATE_ID : resolveCountryId(alpha2);
}

const failures: Array<{ feed: string; error: string }> = [];

async function attempt<T>(feed: string, run: () => Promise<T>): Promise<T | null> {
    try {
        return await run();
    } catch (error) {
        failures.push({ feed, error: error instanceof Error ? error.message : String(error) });
        return null;
    }
}

// ---------------------------------------------------------------------------
// 1 + 2. DefiLlama supply: local-currency pegs and USD net issuance
// ---------------------------------------------------------------------------

type PegAmounts = Record<string, number | undefined>;

interface LlamaChainBalance {
    current?: PegAmounts;
    circulatingPrevWeek?: PegAmounts;
}

interface LlamaAsset {
    id: string;
    name: string;
    symbol: string;
    pegType: string;
    pegMechanism?: string;
    circulating?: PegAmounts;
    circulatingPrevDay?: PegAmounts;
    circulatingPrevWeek?: PegAmounts;
    circulatingPrevMonth?: PegAmounts;
    chainCirculating?: Record<string, LlamaChainBalance>;
}

interface TokenSupply {
    symbol: string;
    name: string;
    mechanism: string | null;
    /** DefiLlama reports every peg's circulating supply in US dollars. */
    supplyUsd: number;
    change1dUsd: number | null;
    change7dUsd: number | null;
    change30dUsd: number | null;
    change30dPct: number | null;
}

function tokenSupply(asset: LlamaAsset): TokenSupply {
    const peg = asset.pegType;
    const current = asset.circulating?.[peg] ?? 0;
    const prevDay = asset.circulatingPrevDay?.[peg];
    const prevWeek = asset.circulatingPrevWeek?.[peg];
    const prevMonth = asset.circulatingPrevMonth?.[peg];
    return {
        symbol: asset.symbol,
        name: asset.name,
        mechanism: asset.pegMechanism ?? null,
        supplyUsd: Math.round(current),
        change1dUsd: prevDay === undefined ? null : Math.round(current - prevDay),
        change7dUsd: prevWeek === undefined ? null : Math.round(current - prevWeek),
        change30dUsd: prevMonth === undefined ? null : Math.round(current - prevMonth),
        change30dPct: round(pctChange(current, prevMonth)),
    };
}

function sumField(tokens: TokenSupply[], key: 'change1dUsd' | 'change7dUsd' | 'change30dUsd') {
    return tokens.reduce((total, token) => total + (token[key] ?? 0), 0);
}

function summariseLocalCurrencies(assets: LlamaAsset[], fx: Record<string, number>) {
    const byCurrency = new Map<string, TokenSupply[]>();
    for (const asset of assets) {
        const currency = PEG_CURRENCY[asset.pegType];
        if (!currency) continue;
        const tokens = byCurrency.get(currency) ?? [];
        tokens.push(tokenSupply(asset));
        byCurrency.set(currency, tokens);
    }

    return [...byCurrency.entries()]
        .map(([currency, tokens]) => {
            tokens.sort((a, b) => b.supplyUsd - a.supplyUsd);
            const supplyUsd = tokens.reduce((total, token) => total + token.supplyUsd, 0);
            const change30dUsd = sumField(tokens, 'change30dUsd');
            const rate = fx[currency];
            const alpha2 = CURRENCY_COUNTRY[currency];
            return {
                currency,
                countryId: alpha2 ? countryIdFor(alpha2) : null,
                supplyUsd,
                supplyLocal: rate ? Math.round(supplyUsd * rate) : null,
                change7dUsd: sumField(tokens, 'change7dUsd'),
                change30dUsd,
                change30dPct: round(pctChange(supplyUsd, supplyUsd - change30dUsd)),
                tokens: tokens.filter((token) => token.supplyUsd >= 50_000).slice(0, 8),
            };
        })
        .sort((a, b) => b.supplyUsd - a.supplyUsd);
}

function summariseUsd(assets: LlamaAsset[]) {
    const usd = assets.filter((asset) => asset.pegType === 'peggedUSD');
    const tokens = usd.map(tokenSupply).sort((a, b) => b.supplyUsd - a.supplyUsd);

    const chains = new Map<string, { current: number; prevWeek: number }>();
    for (const asset of usd) {
        for (const [chain, balance] of Object.entries(asset.chainCirculating ?? {})) {
            const entry = chains.get(chain) ?? { current: 0, prevWeek: 0 };
            entry.current += balance.current?.peggedUSD ?? 0;
            entry.prevWeek += balance.circulatingPrevWeek?.peggedUSD ?? 0;
            chains.set(chain, entry);
        }
    }
    const totalUsd = tokens.reduce((total, token) => total + token.supplyUsd, 0);

    return {
        totalUsd,
        change1dUsd: sumField(tokens, 'change1dUsd'),
        change7dUsd: sumField(tokens, 'change7dUsd'),
        change30dUsd: sumField(tokens, 'change30dUsd'),
        tokenCount: tokens.length,
        top: tokens.slice(0, 12),
        chains: [...chains.entries()]
            .map(([chain, { current, prevWeek }]) => ({
                chain,
                supplyUsd: Math.round(current),
                sharePct: round((current / totalUsd) * 100),
                change7dUsd: Math.round(current - prevWeek),
            }))
            .sort((a, b) => b.supplyUsd - a.supplyUsd)
            .slice(0, 10),
    };
}

interface TetherTransparency {
    data: { usdt: Record<string, unknown> };
}

interface CircleSupply {
    data: Array<{ symbol: string; totalAmount: string }>;
}

async function issuerCrossCheck() {
    const tether = await attempt('tether', () => getJson<TetherTransparency>(TETHER_URL));
    const circle = await attempt('circle', () => getJson<CircleSupply>(CIRCLE_URL));

    // Tether's per-chain `totaltokens_*` include `reserve_balance_*`: authorised but
    // not yet issued. Circulating = total minus that treasury balance.
    let usdtCirculating: number | null = null;
    if (tether) {
        usdtCirculating = 0;
        for (const [key, value] of Object.entries(tether.data.usdt)) {
            if (key.startsWith('totaltokens_')) usdtCirculating += num(value) ?? 0;
            if (key.startsWith('reserve_balance_')) usdtCirculating -= num(value) ?? 0;
        }
    }
    const circleTotals = Object.fromEntries(
        (circle?.data ?? []).map((coin) => [coin.symbol, num(coin.totalAmount)]),
    );
    return {
        usdtCirculatingTokens: usdtCirculating === null ? null : Math.round(usdtCirculating),
        usdcCirculatingTokens:
            circleTotals.USDC === undefined ? null : Math.round(circleTotals.USDC ?? 0),
        eurcCirculatingTokens:
            circleTotals.EURC === undefined ? null : Math.round(circleTotals.EURC ?? 0),
    };
}

// ---------------------------------------------------------------------------
// 3. On/off-ramp pulse
// ---------------------------------------------------------------------------

interface Reference {
    rate: number;
    source: string;
}

interface EcbSdmxJson {
    dataSets: Array<{ series: Record<string, { observations: Record<string, unknown[]> }> }>;
}

async function referenceRates(): Promise<{
    base: Record<string, number>;
    overrides: Record<string, Reference>;
}> {
    const erApi = await getJson<{ rates: Record<string, number> }>(ER_API_URL);
    const overrides: Record<string, Reference> = {};

    const bcra = await attempt('bcra', () =>
        getJson<{ results: Array<{ detalle: Array<{ valor: number }> }> }>(BCRA_URL),
    );
    const ars = bcra?.results[0]?.detalle[0]?.valor;
    if (ars) overrides.ARS = { rate: ars, source: 'BCRA A3500 wholesale' };

    const bcb = await attempt('bcb', () => getJson<Array<{ valor: string }>>(BCB_URL));
    const brl = num(bcb?.[0]?.valor);
    if (brl) overrides.BRL = { rate: brl, source: 'BCB PTAX' };

    const trm = await attempt('banrep-trm', () => getJson<Array<{ valor: string }>>(TRM_URL));
    const cop = num(trm?.[0]?.valor);
    if (cop) overrides.COP = { rate: cop, source: 'BanRep TRM' };

    const ecb = await attempt('ecb', () => getJson<EcbSdmxJson>(ECB_URL));
    const usdPerEur = num(ecb?.dataSets[0]?.series['0:0:0:0:0']?.observations['0']?.[0]);
    if (usdPerEur) overrides.EUR = { rate: 1 / usdPerEur, source: 'ECB reference rate' };

    return { base: erApi.rates, overrides };
}

interface VenueReading {
    price: number;
    /** 24h traded amount in stablecoin units (≈ USD); null when the venue does not say. */
    volumeStable: number | null;
}

interface Venue {
    country: string;
    currency: string;
    venue: string;
    venueHq: string;
    kind: 'exchange' | 'p2p' | 'aggregator';
    pair: string;
    endpoint: string;
    read: () => Promise<VenueReading | null>;
}

const reading = (price: unknown, volume: unknown): VenueReading | null => {
    const p = num(price);
    return p === null ? null : { price: p, volumeStable: num(volume) };
};

function memo<T>(load: () => Promise<T>): () => Promise<T> {
    let cached: Promise<T> | null = null;
    return () => (cached ??= load());
}

interface BitsoTicker {
    book: string;
    last: string;
    volume: string;
}

interface LunoTicker {
    pair: string;
    last_trade: string;
    rolling_24_hour_volume: string;
}

const bitsoTickers = memo(
    async () =>
        (await getJson<{ payload: BitsoTicker[] }>('https://api.bitso.com/v3/ticker/')).payload,
);

const lunoTickers = memo(
    async () =>
        (await getJson<{ tickers: LunoTicker[] }>('https://api.luno.com/api/1/tickers')).tickers,
);

function bitsoBook(book: string) {
    return async () => {
        const row = (await bitsoTickers()).find((entry) => entry.book === book);
        return row ? reading(row.last, row.volume) : null;
    };
}

function lunoPair(pair: string) {
    return async () => {
        const row = (await lunoTickers()).find((entry) => entry.pair === pair);
        return row ? reading(row.last_trade, row.rolling_24_hour_volume) : null;
    };
}

/** Median USDT ask across venues CriptoYa saw quote in the last 24 hours. */
function criptoYa(currency: string) {
    return async () => {
        const quotes = await getJson<Record<string, { ask?: number; time?: number }>>(
            `https://criptoya.com/api/usdt/${currency.toLowerCase()}/1`,
        );
        const cutoff = Date.now() / 1000 - DAY_SECONDS;
        const asks = Object.values(quotes)
            .filter((quote) => (quote.time ?? 0) >= cutoff)
            .map((quote) => num(quote.ask))
            .filter((ask): ask is number => ask !== null && ask > 0);
        const price = median(asks);
        return price === null ? null : { price, volumeStable: null };
    };
}

/** Median of the ten best USDT sell offers a buyer sees on Binance P2P. */
function binanceP2p(fiat: string) {
    return async () => {
        const body = await getJson<{ data?: Array<{ adv: { price: string } }> }>(BINANCE_P2P_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                asset: 'USDT',
                fiat,
                tradeType: 'BUY',
                page: 1,
                rows: 10,
                payTypes: [],
                publisherType: null,
            }),
        });
        const prices = (body.data ?? [])
            .map((ad) => num(ad.adv.price))
            .filter((price): price is number => price !== null);
        const price = median(prices);
        return price === null ? null : { price, volumeStable: null };
    };
}

const p2p = (country: string, currency: string): Venue => ({
    country,
    currency,
    venue: 'Binance P2P',
    venueHq: 'Global',
    kind: 'p2p',
    pair: `USDT/${currency}`,
    endpoint: BINANCE_P2P_URL,
    read: binanceP2p(currency),
});

const yaVenue = (country: string, currency: string): Venue => ({
    country,
    currency,
    venue: 'CriptoYa (median of local venues)',
    venueHq: 'AR',
    kind: 'aggregator',
    pair: `USDT/${currency}`,
    endpoint: `https://criptoya.com/api/usdt/${currency.toLowerCase()}/1`,
    read: criptoYa(currency),
});

const VENUES: Venue[] = [
    // Latin America
    yaVenue('AR', 'ARS'),
    {
        country: 'BR',
        currency: 'BRL',
        venue: 'Mercado Bitcoin',
        venueHq: 'BR',
        kind: 'exchange',
        pair: 'USDT/BRL',
        endpoint: 'https://api.mercadobitcoin.net/api/v4/tickers?symbols=USDT-BRL',
        read: async () => {
            const [row] = await getJson<Array<{ last: string; vol: string }>>(
                'https://api.mercadobitcoin.net/api/v4/tickers?symbols=USDT-BRL',
            );
            return row ? reading(row.last, row.vol) : null;
        },
    },
    {
        country: 'MX',
        currency: 'MXN',
        venue: 'Bitso',
        venueHq: 'MX',
        kind: 'exchange',
        pair: 'USDT/MXN',
        endpoint: 'https://api.bitso.com/v3/ticker/?book=usdt_mxn',
        read: bitsoBook('usdt_mxn'),
    },
    {
        country: 'CO',
        currency: 'COP',
        venue: 'Bitso',
        venueHq: 'MX',
        kind: 'exchange',
        pair: 'USDT/COP',
        endpoint: 'https://api.bitso.com/v3/ticker/?book=usdt_cop',
        read: bitsoBook('usdt_cop'),
    },
    yaVenue('PE', 'PEN'),
    yaVenue('CL', 'CLP'),
    yaVenue('BO', 'BOB'),
    yaVenue('VE', 'VES'),
    // Europe
    {
        country: 'EU',
        currency: 'EUR',
        venue: 'Bitstamp',
        venueHq: 'LU',
        kind: 'exchange',
        pair: 'USDT/EUR',
        endpoint: 'https://www.bitstamp.net/api/v2/ticker/usdteur/',
        read: async () => {
            const body = await getJson<{ last: string; volume: string }>(
                'https://www.bitstamp.net/api/v2/ticker/usdteur/',
            );
            return reading(body.last, body.volume);
        },
    },
    {
        country: 'EU',
        currency: 'EUR',
        venue: 'Bitvavo',
        venueHq: 'NL',
        kind: 'exchange',
        pair: 'USDC/EUR',
        endpoint: 'https://api.bitvavo.com/v2/ticker/24h?market=USDC-EUR',
        read: async () => {
            const body = await getJson<{ last: string; volume: string }>(
                'https://api.bitvavo.com/v2/ticker/24h?market=USDC-EUR',
            );
            return reading(body.last, body.volume);
        },
    },
    {
        country: 'TR',
        currency: 'TRY',
        venue: 'BtcTurk',
        venueHq: 'TR',
        kind: 'exchange',
        pair: 'USDT/TRY',
        endpoint: 'https://api.btcturk.com/api/v2/ticker?pairSymbol=USDTTRY',
        read: async () => {
            const body = await getJson<{ data: Array<{ last: number; volume: number }> }>(
                'https://api.btcturk.com/api/v2/ticker?pairSymbol=USDTTRY',
            );
            return body.data[0] ? reading(body.data[0].last, body.data[0].volume) : null;
        },
    },
    p2p('UA', 'UAH'),
    // Africa and the Middle East
    {
        country: 'ZA',
        currency: 'ZAR',
        venue: 'VALR',
        venueHq: 'ZA',
        kind: 'exchange',
        pair: 'USDT/ZAR',
        endpoint: 'https://api.valr.com/v1/public/USDTZAR/marketsummary',
        read: async () => {
            const body = await getJson<{ lastTradedPrice: string; baseVolume: string }>(
                'https://api.valr.com/v1/public/USDTZAR/marketsummary',
            );
            return reading(body.lastTradedPrice, body.baseVolume);
        },
    },
    {
        country: 'NG',
        currency: 'NGN',
        venue: 'Luno',
        venueHq: 'GB',
        kind: 'exchange',
        pair: 'USDT/NGN',
        endpoint: 'https://api.luno.com/api/1/ticker?pair=USDTNGN',
        read: lunoPair('USDTNGN'),
    },
    p2p('KE', 'KES'),
    p2p('EG', 'EGP'),
    p2p('MA', 'MAD'),
    p2p('DZ', 'DZD'),
    p2p('UG', 'UGX'),
    p2p('TZ', 'TZS'),
    p2p('CM', 'XAF'),
    p2p('LB', 'LBP'),
    // Asia-Pacific
    {
        country: 'KR',
        currency: 'KRW',
        venue: 'Upbit',
        venueHq: 'KR',
        kind: 'exchange',
        pair: 'USDT/KRW',
        endpoint: 'https://api.upbit.com/v1/ticker?markets=KRW-USDT',
        read: async () => {
            const [row] = await getJson<
                Array<{ trade_price: number; acc_trade_volume_24h: number }>
            >('https://api.upbit.com/v1/ticker?markets=KRW-USDT');
            return row ? reading(row.trade_price, row.acc_trade_volume_24h) : null;
        },
    },
    {
        country: 'IN',
        currency: 'INR',
        venue: 'CoinDCX',
        venueHq: 'IN',
        kind: 'exchange',
        pair: 'USDT/INR',
        endpoint: 'https://api.coindcx.com/exchange/ticker',
        read: async () => {
            const rows = await getJson<Array<{ market: string; last_price: string }>>(
                'https://api.coindcx.com/exchange/ticker',
            );
            const row = rows.find((entry) => entry.market === 'USDTINR');
            // CoinDCX does not say which leg `volume` is denominated in, so it is left out.
            return row ? reading(row.last_price, null) : null;
        },
    },
    {
        country: 'ID',
        currency: 'IDR',
        venue: 'Indodax',
        venueHq: 'ID',
        kind: 'exchange',
        pair: 'USDT/IDR',
        endpoint: 'https://indodax.com/api/ticker/usdtidr',
        read: async () => {
            const body = await getJson<{ ticker: { last: string; vol_usdt: string } }>(
                'https://indodax.com/api/ticker/usdtidr',
            );
            return reading(body.ticker.last, body.ticker.vol_usdt);
        },
    },
    {
        country: 'TH',
        currency: 'THB',
        venue: 'Bitkub',
        venueHq: 'TH',
        kind: 'exchange',
        pair: 'USDT/THB',
        endpoint: 'https://api.bitkub.com/api/v3/market/ticker?sym=USDT_THB',
        read: async () => {
            const [row] = await getJson<Array<{ last: string; base_volume: string }>>(
                'https://api.bitkub.com/api/v3/market/ticker?sym=USDT_THB',
            );
            return row ? reading(row.last, row.base_volume) : null;
        },
    },
    {
        country: 'PH',
        currency: 'PHP',
        venue: 'Coins.ph',
        venueHq: 'PH',
        kind: 'exchange',
        pair: 'USDT/PHP',
        endpoint: 'https://api.pro.coins.ph/openapi/quote/v1/ticker/24hr?symbol=USDTPHP',
        read: async () => {
            const body = await getJson<{ lastPrice: string; volume: string }>(
                'https://api.pro.coins.ph/openapi/quote/v1/ticker/24hr?symbol=USDTPHP',
            );
            return reading(body.lastPrice, body.volume);
        },
    },
    {
        country: 'AU',
        currency: 'AUD',
        venue: 'Independent Reserve',
        venueHq: 'AU',
        kind: 'exchange',
        pair: 'USDT/AUD',
        endpoint:
            'https://api.independentreserve.com/Public/GetMarketSummary?primaryCurrencyCode=usdt&secondaryCurrencyCode=aud',
        read: async () => {
            const body = await getJson<{ LastPrice: number; DayVolumeXbt: number }>(
                'https://api.independentreserve.com/Public/GetMarketSummary?primaryCurrencyCode=usdt&secondaryCurrencyCode=aud',
            );
            return reading(body.LastPrice, body.DayVolumeXbt);
        },
    },
    p2p('PK', 'PKR'),
    p2p('BD', 'BDT'),
    p2p('VN', 'VND'),
    p2p('NP', 'NPR'),
    p2p('LK', 'LKR'),
];

async function rampPulse(fx: {
    base: Record<string, number>;
    overrides: Record<string, Reference>;
}) {
    const results = await Promise.all(
        VENUES.map(async (venue) => {
            const value = await attempt(`${venue.venue} ${venue.pair}`, venue.read);
            if (!value) return null;
            const reference =
                fx.overrides[venue.currency] ??
                (fx.base[venue.currency]
                    ? { rate: fx.base[venue.currency], source: 'ExchangeRate-API' }
                    : null);
            if (!reference) return null;
            return {
                countryId: countryIdFor(venue.country),
                country: venue.country,
                currency: venue.currency,
                venue: venue.venue,
                venueHq: venue.venueHq,
                kind: venue.kind,
                pair: venue.pair,
                price: value.price,
                referenceRate: round(reference.rate, 6),
                referenceSource: reference.source,
                premiumPct: round((value.price / reference.rate - 1) * 100),
                volume24hUsd: value.volumeStable === null ? null : Math.round(value.volumeStable),
                endpoint: venue.endpoint,
            };
        }),
    );
    return results.filter((row) => row !== null);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function parseOut(): string | null {
    const arg = process.argv.slice(2).find((value) => value.startsWith('--out='));
    return arg ? arg.slice('--out='.length) : null;
}

async function main(): Promise<void> {
    const takenAt = new Date().toISOString();
    const [llama, fx, issuers] = await Promise.all([
        getJson<{ peggedAssets: LlamaAsset[] }>(LLAMA_URL),
        referenceRates(),
        issuerCrossCheck(),
    ]);
    const fxForPegs = {
        ...fx.base,
        ...Object.fromEntries(Object.entries(fx.overrides).map(([code, ref]) => [code, ref.rate])),
    };

    const snapshot = {
        takenAt,
        localCurrencies: summariseLocalCurrencies(llama.peggedAssets, fxForPegs),
        usd: summariseUsd(llama.peggedAssets),
        issuers,
        ramps: await rampPulse(fx),
        failures,
    };

    const json = JSON.stringify(snapshot, null, 2);
    const out = parseOut();
    if (out) {
        writeFileSync(out, json);
        console.error(
            `Wrote ${out}: ${snapshot.localCurrencies.length} pegs, ${snapshot.ramps.length} ramps, ${failures.length} failures.`,
        );
    } else {
        console.log(json);
    }
}

main().catch((error: unknown) => {
    console.error('Live sources snapshot failed:', error);
    process.exit(1);
});
