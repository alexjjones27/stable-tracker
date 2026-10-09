# International stablecoin flow sources

Candidate sources from outside the current pipeline (Allium, Stride, World Bank) for tracking stablecoin flows country by country. Each entry says where the source is based, what it measures, how often it updates, how to access it, and which tracker lens it would feed.

Checked on 9 October 2026. **Live** in the last column means the endpoint answered during the snapshot taken at 2026-10-09T09:15:44.339Z.

## Lenses

| Lens | What it adds | Sources |
| --- | --- | --- |
| Ramp | What a dollar stablecoin costs in local money on in-country venues, the premium over a reference rate, and venue volume. New. | 25 |
| Local pegs | Non-USD stablecoins mapped to the country whose money they track. New. | 17 |
| Supply | Net minting and redemption by token and chain. New. | 10 |
| Official | Monthly remittances, balance of payments and reference rates from central banks. | 18 |
| Rules | Official registers to cross-check the Stride stage. | 17 |
| Corridor | Independent views on cross-border flows to test Allium's attribution. | 12 |
| Risk | Screening for sanctioned rails such as A7A5. New. | 2 |

## Live snapshot script

`script/general/snapshot-live-sources.ts` reads the keyless feeds in one pass and prints JSON (or writes it with `--out`). It needs no API keys and writes nothing to MongoDB.

```bash
npm run live-sources:snapshot
npm run live-sources:snapshot -- --out=live-sources.json
```

It returns three blocks:

- `localCurrencies`: supply by peg currency from DefiLlama (valued in US dollars), with the tracker country id.
- `usd`: USD stablecoin supply, 1/7/30-day net change by token, and the chain split; `issuers` cross-checks USDT against Tether and USDC/EURC against Circle.
- `ramps`: USDT price on in-country venues, the reference rate (BCRA, BCB, BanRep or ECB where keyless, otherwise ExchangeRate-API), the premium, and 24h venue volume where the venue reports it.

Any feed that fails is listed under `failures`; the rest of the snapshot still completes.

## Catalogue

### Global

| Source | Based in | Kind | Measures | Cadence | Access | Lenses | Endpoint |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DefiLlama Stablecoins API | Open source | On-chain analytics | Circulating supply for 340+ USD and 70+ non-USD stablecoins by token, chain and peg currency, with prior day, week and month values. | Live | Open | Local pegs, Supply | [Live](https://stablecoins.llama.fi/stablecoins?includePrices=true) |
| Tether transparency feed | El Salvador | Issuer disclosure | Authorised, reserve and quarantined USDT per chain, plus CNHT and MXNT. Circulating = total minus reserve balance. | Live | Open | Supply | [Live](https://app.tether.to/transparency.json) |
| Circle stablecoin supply | United States (EURC via Circle Mint France) | Issuer disclosure | USDC and EURC supply per chain, straight from the issuer. | Live | Open | Supply, Local pegs | [Live](https://api.circle.com/v1/stablecoins) |
| Binance P2P ad book | Global | P2P market | Live USDT buy and sell offers in 100+ fiat currencies. The median of the ten best offers is a street rate where exchanges are thin or banned. *Unofficial POST endpoint; keep request rates low. The NGN and GHS books were empty at snapshot time.* | Live | Open | Ramp | [Live](https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search) |
| DIA | Switzerland | On-chain analytics | Stablecoin prices and prior-day volume per token and chain; publishes a global map of local-currency stablecoins. | Live | Open | Local pegs, Ramp | [Live](https://api.diadata.org/v1/assetQuotation/Ethereum/0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c) |
| Kaiko | France | Market data vendor | Tick-level trades and order books for stablecoin/fiat pairs across 100+ venues, giving exchange-level ramp volume by currency. | Live | Paid | Ramp, Corridor | [Link](https://www.kaiko.com) |
| CryptoQuant | South Korea | On-chain analytics | Stablecoin exchange inflows, outflows and reserves per exchange, including KRW venues. | Live | Free tier / paid | Corridor, Supply | [Link](https://cryptoquant.com) |
| Nansen | Singapore | On-chain analytics | Labelled-wallet stablecoin flows between exchanges, funds, payment firms and protocols. | Live | Paid | Corridor | [Link](https://www.nansen.ai) |
| Glassnode | Switzerland | On-chain analytics | Stablecoin supply, exchange balances and transfer volume. | Daily | Free tier / paid | Supply, Corridor | [Link](https://glassnode.com) |
| Token Terminal | Finland | On-chain analytics | Standardised supply, transfer volume and active addresses per stablecoin and chain. | Daily | Paid | Supply | [Link](https://tokenterminal.com) |
| Dune | Norway | On-chain analytics | SQL over decoded transfers on 30+ chains, community stablecoin dashboards and a query API. | Live | Free key | Corridor, Supply | [Link](https://dune.com) |
| Etherscan API V2 | Malaysia | Explorer | Transfers, holders and supply for any token on Ethereum, BNB Chain and 50+ EVM chains through one key. | Live | Free key | Supply, Corridor | [Link](https://docs.etherscan.io) |
| TronScan | TRON network | Explorer | USDT-TRC20 supply, holders and transfers. Tron holds about 30% of USD stablecoin supply and is the main P2P rail in many emerging markets. | Live | Open | Supply, Corridor | [Live](https://apilist.tronscanapi.com/api/token_trc20?contract=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t&showAll=1) |
| CoinGecko | Singapore | Market data vendor | Prices and per-exchange volume for stablecoin/fiat pairs. *Keyless calls were rate-limited at snapshot time; use a demo key.* | Live | Free key | Ramp | [Link](https://www.coingecko.com/en/api) |
| Elliptic | United Kingdom | Risk and attribution | Wallet attribution and sanctions exposure, for screening flows tied to sanctioned rails such as A7A5. | Live | Paid | Risk | [Link](https://www.elliptic.co) |
| World Bank Remittance Prices Worldwide | International (World Bank) | Official statistics | Cost of sending $200 and $500 in about 365 corridors, by provider type. The benchmark for comparing stablecoin ramp spreads with corridor costs. | Quarterly | Download | Official | [Link](https://remittanceprices.worldbank.org) |
| Chainalysis Geography of Cryptocurrency | United States | Benchmark report | Country adoption index; the 2026 edition reports domestic P2P and cross-border stablecoin transfer value. | Annual | Report | Corridor | [Link](https://www.chainalysis.com) |

### Latin America

| Source | Based in | Kind | Measures | Cadence | Access | Lenses | Endpoint |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CriptoYa | Argentina | Rate aggregator | USDT, USDC and DAI quotes from 20+ local exchanges and P2P books in ARS, BRL, COP, MXN, PEN, CLP, VES, BOB and more; also every Argentine dollar rate. | Live | Open | Ramp | [Live](https://criptoya.com/api/usdt/ars/1) |
| Yadio | Latin America | Rate aggregator | P2P-derived USD rates for 150+ currencies, widely quoted as the street rate in Venezuela and Cuba. | Live | Open | Ramp | [Live](https://api.yadio.io/exrates/USD) |
| Bitso | Mexico | Exchange | Order books for USDT, PYUSD and RLUSD against MXN, plus USDT against BRL, ARS and COP. A major off-ramp for US to Mexico remittances. | Live | Open | Ramp, Corridor | [Live](https://api.bitso.com/v3/ticker/) |
| Mercado Bitcoin | Brazil | Exchange | USDT/BRL and USDC/BRL ticker, trades and order book. | Live | Open | Ramp | [Live](https://api.mercadobitcoin.net/api/v4/tickers?symbols=USDT-BRL,USDC-BRL) |
| Banco Central do Brasil | Brazil | Official statistics | PTAX reference rate through the open SGS API, and crypto purchases recorded in the goods account of the monthly balance of payments. *Resolution 561 (April 2026) is reported to take stablecoins out of regulated cross-border payment channels from 1 Oct 2026. Confirm on bcb.gov.br.* | Daily / monthly | Open | Official, Rules | [Live](https://api.bcb.gov.br/dados/serie/bcdata.sgs.1/dados/ultimos/1?formato=json) |
| Receita Federal crypto open data | Brazil | Official statistics | Declared crypto operations by asset, from Brazilian exchanges and from residents using offshore venues above R$30k a month (IN 1888, DeCripto from July 2026). | Monthly | Download | Official, Corridor | [Link](https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/declaracoes-e-demonstrativos/criptoativos) |
| Banxico SIE API | Mexico | Official statistics | Monthly remittance inflows and the FIX rate: the receiver-side benchmark for US to Mexico corridors. *Free token required.* | Monthly | Free key | Official | [Live](https://www.banxico.org.mx/SieAPIRest/service/v1/) |
| BCRA Estadísticas API | Argentina | Official statistics | Wholesale reference rate (Communication A 3500) and 1,600+ monetary series. | Daily | Open | Official, Ramp | [Live](https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/5) |
| Banco de la República TRM | Colombia | Official statistics | Official COP/USD market rate (TRM) on datos.gov.co; BanRep also publishes monthly remittance inflows. | Daily | Open | Official, Ramp | [Live](https://www.datos.gov.co/resource/32sa-8pi3.json) |
| Banguat remittance statistics | Guatemala | Official statistics | Monthly family remittance inflows, close to a fifth of Guatemala's GDP. | Monthly | Download | Official | [Link](https://www.banguat.gob.gt) |
| CNAD register | El Salvador | Regulator register | Registered digital-asset service providers and stablecoin issuers under the Digital Assets Issuance Law. | As published | Open | Rules | [Link](https://cnad.gob.sv) |
| CNV PSAV register | Argentina | Regulator register | Registered virtual asset service providers (PSAV). | As published | Open | Rules | [Link](https://www.cnv.gov.ar) |

### North America

| Source | Based in | Kind | Measures | Cadence | Access | Lenses | Endpoint |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Canadian Securities Administrators | Canada | Regulator register | Rules and platform undertakings for value-referenced crypto assets such as USDC and QCAD. | As published | Open | Rules, Local pegs | [Link](https://www.securities-administrators.ca) |

### Europe

| Source | Based in | Kind | Measures | Cadence | Access | Lenses | Endpoint |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ESMA interim MiCA register | European Union | Regulator register | CSV files of authorised e-money token issuers, their white papers, and licensed CASPs. *Moving into ESMA's own systems from mid-2026; file links may change.* | Weekly | Download | Rules, Local pegs | [Link](https://www.esma.europa.eu/esmas-activities/digital-finance-and-innovation/markets-crypto-assets-regulation-mica) |
| ECB Data Portal | European Union | Official statistics | Euro reference rates and euro-area series through an open SDMX API. | Daily | Open | Official, Ramp | [Live](https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?lastNObservations=1&format=jsondata) |
| Bitstamp | Luxembourg | Exchange | USDT/EUR and USDC/EUR ticker, trades and order book. | Live | Open | Ramp | [Live](https://www.bitstamp.net/api/v2/ticker/usdteur/) |
| Bitvavo | Netherlands | Exchange | USDC/EUR and EURC markets with 24h volume. | Live | Open | Ramp | [Live](https://api.bitvavo.com/v2/ticker/24h?market=USDC-EUR) |
| SG-FORGE | France | Issuer disclosure | EURCV and USDCV supply and reserve reports from Société Générale's digital-asset arm. | As published | Open | Local pegs, Supply | [Link](https://www.sgforge.com) |
| Monerium | Iceland | Issuer disclosure | EURe and GBPe e-money tokens with IBAN-linked minting and burning. | Live | Open | Local pegs | [Link](https://monerium.com) |
| Quantoz | Netherlands | Issuer disclosure | EURQ and USDQ e-money tokens issued under MiCA. | As published | Open | Local pegs | [Link](https://www.quantoz.com) |
| Frankencoin | Switzerland | Issuer disclosure | ZCHF, a collateralised Swiss franc stablecoin whose supply and collateral sit fully on-chain. | Live | Open | Local pegs | [Link](https://frankencoin.com) |
| FINMA | Switzerland | Regulator register | Stablecoin guidance (06/2024) and authorised institutions. | As published | Open | Rules | [Link](https://www.finma.ch) |
| FCA register | United Kingdom | Regulator register | Registered cryptoasset firms; the UK stablecoin regime is being built with the Bank of England. | As published | Open | Rules | [Link](https://register.fca.org.uk) |

### Africa and Middle East

| Source | Based in | Kind | Measures | Cadence | Access | Lenses | Endpoint |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BtcTurk | Turkey | Exchange | USDT/TRY and USDC/TRY ticker, trades and order book. | Live | Open | Ramp | [Live](https://api.btcturk.com/api/v2/ticker?pairSymbol=USDTTRY) |
| CBRT EVDS | Turkey | Official statistics | Official FX rates, balance of payments and other monthly series through the EVDS API. | Daily / monthly | Free key | Official | [Link](https://evds3.tcmb.gov.tr) |
| SPK (Capital Markets Board) | Turkey | Regulator register | Licensed crypto asset service providers under Turkey's 2024 crypto law. | As published | Open | Rules | [Link](https://spk.gov.tr) |
| VALR | South Africa | Exchange | USDT/ZAR and USDC/ZAR market summaries and trades. | Live | Open | Ramp | [Live](https://api.valr.com/v1/public/USDTZAR/marketsummary) |
| Luno | United Kingdom | Exchange | USDT and USDC against NGN, ZAR, KES and IDR, with rolling 24h volume. | Live | Open | Ramp | [Live](https://api.luno.com/api/1/tickers) |
| FSCA | South Africa | Regulator register | Licensed crypto asset service providers under FAIS. | As published | Open | Rules | [Link](https://www.fsca.co.za) |
| Central Bank of Nigeria and SEC Nigeria | Nigeria | Regulator register | The CBN sandbox (a stablecoin track opened in August 2026) and the SEC incubation programme, where the cNGN issuer holds approval-in-principle. | As published | Open | Rules | [Link](https://www.cbn.gov.ng) |
| cNGN | Nigeria | Issuer disclosure | Naira stablecoin from WrappedCBDC: about ₦2.5bn issued by August 2026 per the issuer, though on-chain data shows few holders. | As published | Open | Local pegs | [Link](https://cngn.co) |
| Quidax | Nigeria | Exchange | USDT/NGN and other naira markets through a public ticker API. *Returned HTTP 503 at snapshot time.* | Live | Open | Ramp | [Link](https://www.quidax.com/api/v1/markets/tickers/usdtngn) |
| Yellow Card | Pan-Africa | Payments API | Stablecoin buy and sell rates in about 20 African currencies through a business API. *The API answered but requires an allow-listed IP.* | Live | Partner | Ramp, Corridor | [Link](https://yellowcard.io) |
| Central Bank of Kenya | Kenya | Official statistics | Monthly diaspora remittances by source region. | Monthly | Download | Official | [Link](https://www.centralbank.go.ke/diaspora-remittances/) |
| Central Bank of Egypt | Egypt | Official statistics | Remittance inflows and the balance of payments. | Monthly | Download | Official | [Link](https://www.cbe.org.eg) |
| CBUAE and VARA | United Arab Emirates | Regulator register | The CBUAE Payment Token Services Regulation (dirham tokens such as AE Coin) and VARA licences in Dubai. | As published | Open | Rules | [Link](https://www.centralbank.ae) |

### Asia-Pacific

| Source | Based in | Kind | Measures | Cadence | Access | Lenses | Endpoint |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Upbit | South Korea | Exchange | KRW-USDT and KRW-USDC price and 24h turnover. The gap to the official rate is the kimchi premium. | Live | Open | Ramp | [Live](https://api.upbit.com/v1/ticker?markets=KRW-USDT,KRW-USDC) |
| Bithumb | South Korea | Exchange | USDT/KRW ticker and 24h traded value. | Live | Open | Ramp | [Live](https://api.bithumb.com/public/ticker/USDT_KRW) |
| KoFIU VASP survey | South Korea | Official statistics | Semiannual survey of Korean exchanges: trading value, users, and transfers to overseas and self-hosted wallets. *The won stablecoin bill (Digital Asset Basic Act) was still pending as of September 2026.* | Semiannual | Download | Official, Corridor | [Link](https://fsc.go.kr/eng) |
| Bank of Korea ECOS | South Korea | Official statistics | FX rates and the balance of payments through an open API. | Daily / monthly | Free key | Official | [Live](https://ecos.bok.or.kr/api/) |
| JVCEA statistics | Japan | Official statistics | Monthly trading value on Japanese exchanges, from the industry's self-regulatory body. | Monthly | Download | Official | [Link](https://jvcea.or.jp) |
| FSA Japan registers | Japan | Regulator register | Registered funds-transfer providers and electronic payment instrument dealers. JPYC launched Japan's first yen stablecoin in October 2025. | As published | Open | Rules, Local pegs | [Link](https://www.fsa.go.jp) |
| HKMA register of licensed stablecoin issuers | Hong Kong | Regulator register | First licences granted on 10 April 2026 to Anchorpoint Financial and HSBC under the Stablecoins Ordinance. | As published | Open | Rules, Local pegs | [Link](https://www.hkma.gov.hk) |
| MAS directory and StraitsX | Singapore | Regulator register | Major payment institutions in the MAS directory; StraitsX issues XSGD and XUSD under MAS licensing. | As published | Open | Rules, Local pegs | [Link](https://eservices.mas.gov.sg/fid) |
| Indodax | Indonesia | Exchange | USDT/IDR ticker and 24h USDT volume. Crypto oversight moved to OJK in 2025. | Live | Open | Ramp | [Live](https://indodax.com/api/ticker/usdtidr) |
| Bitkub | Thailand | Exchange | USDT/THB ticker and 24h volume. | Live | Open | Ramp | [Live](https://api.bitkub.com/api/v3/market/ticker?sym=USDT_THB) |
| Coins.ph | Philippines | Exchange | USDT/PHP ticker and 24h volume. Coins.ph also issues the PHPC peso stablecoin in the BSP sandbox. | Live | Open | Ramp, Local pegs | [Live](https://api.pro.coins.ph/openapi/quote/v1/ticker/24hr?symbol=USDTPHP) |
| Bangko Sentral ng Pilipinas | Philippines | Official statistics | Monthly cash remittances from overseas Filipinos, by source country. | Monthly | Download | Official | [Link](https://www.bsp.gov.ph/SitePages/Statistics/ExternalSector.aspx) |
| CoinDCX | India | Exchange | USDT/INR and USDC/INR tickers. India's 1% TDS on crypto transfers is one reason USDT trades above the official rate. | Live | Open | Ramp | [Live](https://api.coindcx.com/exchange/ticker) |
| State Bank of Pakistan | Pakistan | Official statistics | Monthly workers' remittances by source country. | Monthly | Download | Official | [Link](https://www.sbp.org.pk/ecodata/index2.asp) |
| Bangladesh Bank | Bangladesh | Official statistics | Monthly wage earners' remittances. | Monthly | Download | Official | [Link](https://www.bb.org.bd) |
| Independent Reserve | Australia | Exchange | USDT/AUD and USDC/AUD market summaries. | Live | Open | Ramp | [Live](https://api.independentreserve.com/Public/GetMarketSummary?primaryCurrencyCode=usdt&secondaryCurrencyCode=aud) |
| AUSTRAC and AUDD | Australia | Regulator register | AUSTRAC's register of digital currency exchanges; AUDD and AUDF are the main AUD stablecoins. | As published | Open | Rules, Local pegs | [Link](https://www.austrac.gov.au) |
| National Bank of Kazakhstan | Kazakhstan | Official statistics | Open daily rates feed, and the digital asset sandbox hosting the Evo (KZTE) tenge stablecoin on Solana. | Daily | Open | Official, Rules, Local pegs | [Live](https://nationalbank.kz/rss/get_rates.cfm?fdate=08.10.2026) |
| National Bank of the Kyrgyz Republic | Kyrgyzstan | Regulator register | Home of the KGST som stablecoin on BNB Chain, and the jurisdiction where the sanctioned rouble token A7A5 is registered. | As published | Open | Rules, Local pegs, Risk | [Link](https://www.nbkr.kg) |

## Rollout

Every series joins on the ISO 3166-1 numeric key through `resolveCountryId()` in `script/shared/iso3166.ts`.

1. **Daily ramp snapshots.** Turn the snapshot script into `script/ramps/sync-ramps.ts` writing a `RampSnapshot` per country, venue and day (price, reference rate, premium, venue volume). Country briefings gain a "Dollar price on local ramps" card.
2. **Local-currency stablecoin supply.** A monthly DefiLlama sync by peg currency, joined to the issuing country, adds non-USD tokens to the token mix and a local-currency share beside the dollarization index.
3. **Monthly official inflows.** Extend the `sync-remittances.ts` cascade with monthly central bank series on the receiving side (Banxico, BSP, State Bank of Pakistan, Bangladesh Bank, Central Bank of Kenya, Banguat), so a corridor can be read against the same month's official remittances instead of a pro-rated World Bank year.
4. **Registers beside Stride.** Count licensed issuers per country from the ESMA MiCA CSVs, HKMA, MAS, FSA Japan, CBUAE and VARA, CNAD, SEC Nigeria, FCA, FINMA, SPK and FSCA, and flag disagreements with the Stride stage.
5. **Corridor triangulation.** Test Allium's attribution on the top 20 corridors against Kaiko, CryptoQuant or Nansen, then add the geo-confidence flag from whitepaper §8.

## Caveats

- P2P figures are the median of the ten best advertised offers, not traded prices.
- Binance P2P's endpoint is unofficial and can change without notice. Keep request rates low.
- Official rates for currencies such as VES and DZD sit far from the street rate. That gap is the signal.
- Venue volume covers one venue, not a country's total.
- DefiLlama values every peg in US dollars. The rouble line is almost all A7A5, whose issuer is under US, UK and EU sanctions.
- Several claims above come from issuers or secondary reporting (cNGN circulation, Brazil Resolution 561, MAS recognition of XSGD). Confirm against the regulator before publishing them as facts.
