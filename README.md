# Baby Names Exchange

An interactive explainer of 145 years of U.S. baby-name data, presented as a stock market: gainers, losers, volatility, meme-stock spikes, celebrity-driven surges, state-by-state favorites, name origins, and a quote terminal for looking up any of ~6,200 names.

Three pages, all static and self-contained:

- `index.html` — the main market report
- `terminal.html` — **NMDQ PRO**, multi-name compare + per-name state distribution
- `rankings.html` — every name given in 2024, ranked and searchable

## Data

Source: Social Security Administration [national](https://www.ssa.gov/oact/babynames/limits.html) (1880–2024) and [state](https://www.ssa.gov/oact/babynames/state/) (1910–2024) baby-names files, 2024 release. Names given to fewer than 5 babies of a sex in a year are suppressed by the SSA. Sex is recorded as M/F only. Trends are computed as rates per million births of the same sex. Name origins draw on [Wiktionary](https://en.wiktionary.org/) (CC BY-SA 4.0) plus project spelling-matches and editorial notes. Typeface: Suisse Intl (Swiss Typefaces, licensed) + IBM Plex Mono.

## Deploying (Vercel)

This is a **static site** — no build step runs on the host. The `.html` files already have all data inlined, so Vercel just serves them.

- Framework preset: **Other**
- Build command: **none** (leave empty)
- Output directory: **`.`** (repo root)

`.vercelignore` keeps the source files and raw data payloads out of the deployment; only the three built pages and `fonts/` ship.

## Rebuilding the data

The built `.html` files are committed, so a rebuild is only needed to refresh the SSA data (released each May) or edit the source.

1. Get the SSA data files (e.g. the [dcadata/name-finder](https://github.com/dcadata/name-finder) LFS mirror) into `mirror/data/`.
2. `node compute.mjs` → writes `payload.json`, `payload-terminal.json`, `payload-rankings.json`.
3. Optionally refresh name origins: `node fetch-meanings.mjs` (Wiktionary) then `node build-meanings.mjs` → `meanings.json`.
4. `node build.mjs` → injects payloads + meanings into the raw pages → `*-injected.html`.
5. Assemble each injected page (adds the review overlay) to its final name, then `cp namedaq.html index.html`.

`*-raw.html` are the editable sources; `index.html` / `terminal.html` / `rankings.html` are the built pages.
