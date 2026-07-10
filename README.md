# NMDQ · The Nursery Exchange

An interactive explainer of 145 years of U.S. baby-name data, presented as a stock market: gainers, losers, volatility, meme-stock spikes, state-by-state favorites, and a quote terminal for looking up any of 6,213 names.

**Live page:** https://duncangraham.github.io/namedaq/

## Data

Source: Social Security Administration [national](https://www.ssa.gov/oact/babynames/limits.html) (1880–2024) and [state](https://www.ssa.gov/oact/babynames/state/) (1910–2024) baby-names files, 2024 release. Names given to fewer than 5 babies of a sex in a year are suppressed by the SSA. Sex is recorded as M/F only. Trends are computed as rates per million births of the same sex.

## Rebuilding

1. Get the SSA data files (e.g. the [dcadata/name-finder](https://github.com/dcadata/name-finder) LFS mirror) into `mirror/data/`.
2. `node compute.mjs` → writes `payload.json`.
3. Inject the payload into `namedaq-raw.html` (replace the `/*PAYLOAD*/null/*ENDPAYLOAD*/` token) and save as `index.html`.

`namedaq-raw.html` is the editable source; `index.html` is the built page.
