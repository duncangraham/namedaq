// Crunch SSA baby names data into a compact JSON payload for the explainer page.
import fs from 'fs';
import path from 'path';

const DATA = path.join(process.env.HOME, 'baby-names/mirror/data');
const Y0 = 1880, Y1 = 2024;
const YEARS = Y1 - Y0 + 1;

// ---------- load national ----------
// series: Map "Name|S" -> Int32Array counts indexed by year-Y0
const series = new Map();
const totals = { M: new Float64Array(YEARS), F: new Float64Array(YEARS) };
const distinct = { M: new Int32Array(YEARS), F: new Int32Array(YEARS) };

for (let y = Y0; y <= Y1; y++) {
  const txt = fs.readFileSync(path.join(DATA, `names/yob${y}.txt`), 'utf8');
  const i = y - Y0;
  for (const line of txt.split('\n')) {
    if (!line.trim()) continue;
    const [name, sex, cnt] = line.trim().split(',');
    const c = +cnt;
    const key = name + '|' + sex;
    let arr = series.get(key);
    if (!arr) { arr = new Int32Array(YEARS); series.set(key, arr); }
    arr[i] = c;
    totals[sex][i] += c;
    distinct[sex][i]++;
  }
}
console.log('unique name+sex:', series.size);

// ---------- applicants (true births proxy) ----------
const app = fs.readFileSync(path.join(DATA, 'applicants/data.csv'), 'utf8')
  .trim().split('\n').slice(1).map(l => l.split(',').map(Number));
const births = {}; // year -> {m,f,t}
for (const [y, m, f, t] of app) births[y] = { m, f, t };

// rate per million (within sex), using name-data totals as denominator
const rate = (key, i) => {
  const sex = key.slice(-1);
  return totals[sex][i] ? (series.get(key)[i] / totals[sex][i]) * 1e6 : 0;
};
const avgRate = (key, i0, i1) => {
  let s = 0; for (let i = i0; i <= i1; i++) s += rate(key, i);
  return s / (i1 - i0 + 1);
};

const I95 = 1995 - Y0, I14 = 2014 - Y0, I24 = 2024 - Y0, I23 = 2023 - Y0;

// ---------- movers (gainers/losers) ----------
// score by change in rate/million between window start (3yr avg) and 2024 (or 3yr end avg)
function movers(iStart) {
  const rows = [];
  for (const key of series.keys()) {
    const r0 = (rate(key, iStart - 1) + rate(key, iStart) + rate(key, iStart + 1)) / 3;
    const r1 = (rate(key, I24 - 2) + rate(key, I24 - 1) + rate(key, I24)) / 3;
    const c24 = series.get(key)[I24];
    if (r0 < 5 && r1 < 5) continue; // both negligible
    rows.push({ key, r0: +r0.toFixed(1), r1: +r1.toFixed(1), d: r1 - r0, mult: r0 >= 1 ? r1 / r0 : null, c24 });
  }
  rows.sort((a, b) => b.d - a.d);
  return rows;
}
const m30 = movers(I95), m10 = movers(I14);

// ---------- volatility (1995-2024) ----------
const vol = [];
for (const key of series.keys()) {
  const arr = series.get(key);
  let present = 0, meanR = 0;
  for (let i = I95; i <= I24; i++) { if (arr[i] > 0) present++; meanR += rate(key, i); }
  meanR /= 30;
  if (present < 26 || meanR < 30) continue; // needs steady presence + real size
  const logs = [];
  for (let i = I95 + 1; i <= I24; i++) {
    const a = rate(key, i - 1), b = rate(key, i);
    if (a > 0 && b > 0) logs.push(Math.log(b / a));
  }
  const mu = logs.reduce((s, x) => s + x, 0) / logs.length;
  const sd = Math.sqrt(logs.reduce((s, x) => s + (x - mu) ** 2, 0) / logs.length);
  vol.push({ key, sd: +sd.toFixed(3), meanR: +meanR.toFixed(1) });
}
vol.sort((a, b) => b.sd - a.sd);

// least volatile (blue chips): high mean rate, low sd
const blue = vol.filter(v => v.meanR > 800).sort((a, b) => a.sd - b.sd);

// ---------- spikes ("meme stocks", 1990-2024) ----------
const spikes = [];
const I90 = 1990 - Y0;
for (const key of series.keys()) {
  const arr = series.get(key);
  let peak = 0, peakI = 0, sum = 0, n = 0;
  for (let i = I90; i <= I24; i++) { if (arr[i] > peak) { peak = arr[i]; peakI = i; } sum += arr[i]; n++; }
  if (peak < 400) continue;
  const vals = [];
  for (let i = I90; i <= I24; i++) vals.push(arr[i]);
  vals.sort((a, b) => a - b);
  const med = vals[Math.floor(n / 2)];
  const ratio = peak / Math.max(med, 1);
  if (ratio >= 8) spikes.push({ key, peak, peakYear: Y0 + peakI, med, ratio: +ratio.toFixed(1) });
}
spikes.sort((a, b) => b.ratio - a.ratio);

// ---------- crashes: big names that collapsed from their peak (peak 1985-2021) ----------
const crashes = [];
const I85 = 1985 - Y0;
for (const key of series.keys()) {
  let peakR = 0, peakI = 0;
  for (let i = I85; i <= 2021 - Y0; i++) { const r = rate(key, i); if (r > peakR) { peakR = r; peakI = i; } }
  if (peakR < 100) continue;
  const now = rate(key, I24);
  if (now > peakR * 0.12) continue;
  crashes.push({ key, peakR: +peakR.toFixed(0), peakYear: Y0 + peakI, nowR: +now.toFixed(1), dropPct: +((1 - now / peakR) * 100).toFixed(1) });
}
crashes.sort((a, b) => (b.peakR * b.dropPct) - (a.peakR * a.dropPct));

// ---------- diversity: top-10 share + effective number of names, per sex/year ----------
const top10share = { M: [], F: [] }, effNames = { M: [], F: [] };
for (let i = 0; i < YEARS; i++) {
  for (const sex of ['M', 'F']) {
    const counts = [];
    for (const [key, arr] of series) if (key.endsWith('|' + sex) && arr[i] > 0) counts.push(arr[i]);
    counts.sort((a, b) => b - a);
    const tot = totals[sex][i];
    const t10 = counts.slice(0, 10).reduce((s, x) => s + x, 0);
    top10share[sex].push(+((t10 / tot) * 100).toFixed(1));
    let hhi = 0; for (const c of counts) hhi += (c / tot) ** 2;
    effNames[sex].push(Math.round(1 / hhi));
  }
}

// ---------- top names 2024 + rank history helper ----------
function topNames(i, sex, n) {
  const rows = [];
  for (const [key, arr] of series) if (key.endsWith('|' + sex) && arr[i] > 0) rows.push([key.split('|')[0], arr[i]]);
  rows.sort((a, b) => b[1] - a[1]);
  return rows.slice(0, n);
}

// ---------- ticker tape: YoY movers 2023->2024 among established names ----------
const tape = [];
for (const key of series.keys()) {
  const a = rate(key, I23), b = rate(key, I24), c = series.get(key)[I24];
  if (c < 250 && series.get(key)[I23] < 250) continue;
  if (a < 20) continue;
  tape.push({ key, pct: +(((b - a) / a) * 100).toFixed(1), c24: c });
}
tape.sort((a, b) => b.pct - a.pct);

// ---------- states (2024): top name per state per sex + most distinctive ----------
const stateTop = {}; // ST -> {M:[name,c], F:[name,c]}
const stateRows2024 = []; // for distinctive calc
const stateFiles = fs.readdirSync(path.join(DATA, 'namesbystate')).filter(f => f.endsWith('.TXT'));
const stateTotals2024 = {}; // ST -> {M,F}
const sdb = {}; // "Name|S" -> {ST: count} summed 2020-2024 (for the pro terminal)
const stateTotals5 = {}; // ST -> {M,F} summed 2020-2024
for (const f of stateFiles) {
  const txt = fs.readFileSync(path.join(DATA, 'namesbystate', f), 'utf8');
  for (const line of txt.split('\n')) {
    if (!line.trim()) continue;
    const [st, sex, yr, name, cnt] = line.trim().split(',');
    const y = +yr, c = +cnt;
    if (y >= 2020) {
      const key = name + '|' + sex;
      (sdb[key] ??= {})[st] = ((sdb[key] ??= {})[st] || 0) + c;
      stateTotals5[st] ??= { M: 0, F: 0 };
      stateTotals5[st][sex] += c;
    }
    if (y !== 2024) continue;
    stateTop[st] ??= {};
    stateTotals2024[st] ??= { M: 0, F: 0 };
    stateTotals2024[st][sex] += c;
    if (!stateTop[st][sex] || c > stateTop[st][sex][1]) stateTop[st][sex] = [name, c];
    stateRows2024.push([st, sex, name, c]);
  }
}
// distinctive: state rate / national rate, min 15 births in state
const distinctive = {};
for (const [st, sex, name, c] of stateRows2024) {
  if (c < 15) continue;
  const key = name + '|' + sex;
  if (!series.has(key)) continue;
  const natR = rate(key, I24);
  if (natR <= 0) continue;
  const stR = (c / stateTotals2024[st][sex]) * 1e6;
  const lift = stR / natR;
  distinctive[st] ??= [];
  distinctive[st].push({ name, sex, c, lift: +lift.toFixed(1) });
}
for (const st of Object.keys(distinctive)) {
  distinctive[st].sort((a, b) => b.lift - a.lift);
  distinctive[st] = distinctive[st].slice(0, 3);
}

// ---------- unisex ----------
const byNameAll = new Map(); // name -> {M:arr|null, F:arr|null}
for (const [key, arr] of series) {
  const n = key.slice(0, -2), s = key.slice(-1);
  let e = byNameAll.get(n); if (!e) { e = { M: null, F: null }; byNameAll.set(n, e); }
  e[s] = arr;
}
// share of babies each year whose name is meaningfully shared (>=20% minority sex)
const uniShare = [];
for (let i = 0; i < YEARS; i++) {
  let tot = 0, neu = 0;
  for (const e of byNameAll.values()) {
    const m = e.M ? e.M[i] : 0, f = e.F ? e.F[i] : 0, t = m + f;
    if (!t) continue; tot += t;
    if (t >= 10 && Math.min(m, f) / t >= 0.2) neu += t;
  }
  uniShare.push(+((neu / tot) * 100).toFixed(2));
}
// 2024 leaderboard: 30-70 split, 500+ babies
const uniTop = [];
for (const [n, e] of byNameAll) {
  const m = e.M ? e.M[I24] : 0, f = e.F ? e.F[I24] : 0, t = m + f;
  if (t < 500) continue;
  if (Math.min(m, f) / t >= 0.3) uniTop.push({ n, m, f, t, pctF: +((f / t) * 100).toFixed(0) });
}
uniTop.sort((a, b) => b.t - a.t);
// flips: majority-M mid-century -> majority-F now
const uniFlips = [];
for (const [n, e] of byNameAll) {
  let m1 = 0, f1 = 0, m2 = 0, f2 = 0;
  for (let y = 1940; y <= 1960; y++) { m1 += e.M ? e.M[y - Y0] : 0; f1 += e.F ? e.F[y - Y0] : 0; }
  for (let y = 2004; y <= 2024; y++) { m2 += e.M ? e.M[y - Y0] : 0; f2 += e.F ? e.F[y - Y0] : 0; }
  if (m1 + f1 < 3000 || m2 + f2 < 3000) continue;
  if (m1 / (m1 + f1) > 0.7 && f2 / (m2 + f2) > 0.7)
    uniFlips.push({ n, then: +((m1 / (m1 + f1)) * 100).toFixed(0), now: +((f2 / (m2 + f2)) * 100).toFixed(0), vol: m2 + f2 });
}
uniFlips.sort((a, b) => b.vol - a.vol);

// ---------- penny stocks ----------
const penny = { picks: [], winners: [], base: {} };
const I21 = 2021 - Y0, I14b = 2014 - Y0;
for (const [key, arr] of series) {
  const c21 = arr[I21], c22 = arr[I21 + 1], c23 = arr[I21 + 2], c24 = arr[I24];
  // momentum screen: still tiny, listed 3 yrs ago, rising every year, >=2.5x
  if (c24 >= 20 && c24 <= 180 && c21 >= 5 && c22 >= c21 && c23 >= c22 && c24 > c23 && c24 >= c21 * 2.5) {
    const ser = []; for (let y = 2015; y <= 2024; y++) ser.push(arr[y - Y0]);
    penny.picks.push({ n: key.slice(0, -2), s: key.slice(-1), c21, c24, x: +(c24 / c21).toFixed(1), ser });
  }
  // proof: pennies that mooned (5-50 babies in 2014 -> 800+ in 2024)
  const c14 = arr[I14b];
  if (c14 >= 5 && c14 <= 50 && c24 >= 800)
    penny.winners.push({ n: key.slice(0, -2), s: key.slice(-1), c14, c24, x: Math.round(c24 / c14) });
}
penny.picks.sort((a, b) => b.x - a.x); penny.picks = penny.picks.slice(0, 12);
penny.winners.sort((a, b) => b.c24 - a.c24); penny.winners = penny.winners.slice(0, 10);
// base rate: fate of every 2014 penny name
let uni = 0, hit = 0, dead = 0;
for (const arr of series.values()) {
  const c14 = arr[I14b];
  if (c14 >= 5 && c14 <= 50) { uni++; if (arr[I24] >= 500) hit++; if (arr[I24] === 0) dead++; }
}
penny.base = { universe: uni, hit, dead };
console.log('penny picks:', penny.picks.map(p => `${p.n}/${p.s} ${p.c21}->${p.c24}`).join(', '));
console.log('penny winners:', penny.winners.map(w => `${w.n}/${w.s} ${w.c14}->${w.c24}`).join(', '));
console.log('penny base:', JSON.stringify(penny.base));

// ---------- lookup DB ----------
// include names whose peak yearly count >= 150 (either sex entry separate)
let dbNames = 0, dbEntries = {};
for (const [key, arr] of series) {
  let peak = 0; for (let i = 0; i < YEARS; i++) if (arr[i] > peak) peak = arr[i];
  if (peak < 150) continue;
  let first = 0; while (arr[first] === 0) first++;
  let last = YEARS - 1; while (arr[last] === 0) last--;
  dbEntries[key] = [Y0 + first, Array.from(arr.slice(first, last + 1))];
  dbNames++;
}
console.log('lookup names:', dbNames);

// ---------- all-time uniques ----------
const uniqueNames = new Set();
for (const key of series.keys()) uniqueNames.add(key.split('|')[0]);
const names2024 = new Set();
for (const [key, arr] of series) if (arr[I24] > 0) names2024.add(key.split('|')[0]);

const fmtMover = m => ({ n: m.key.split('|')[0], s: m.key.split('|')[1], r0: m.r0, r1: m.r1, d: +m.d.toFixed(1), x: m.mult ? +m.mult.toFixed(1) : null, c: m.c24 });

const out = {
  meta: {
    y0: Y0, y1: Y1,
    uniqueAllTime: uniqueNames.size, unique2024: names2024.size,
    pairsAllTime: series.size,
    distinct2024: { M: distinct.M[I24], F: distinct.F[I24] },
    named2024: { M: totals.M[I24], F: totals.F[I24] },
  },
  births: app.map(([y, m, f, t]) => [y, m, f, t]),
  namedTotals: { M: Array.from(totals.M), F: Array.from(totals.F) },
  distinctByYear: { M: Array.from(distinct.M), F: Array.from(distinct.F) },
  top10share, effNames,
  top2024: { M: topNames(I24, 'M', 10), F: topNames(I24, 'F', 10) },
  topByYear: {
    M: Array.from({ length: YEARS }, (_, i) => topNames(i, 'M', 10)),
    F: Array.from({ length: YEARS }, (_, i) => topNames(i, 'F', 10)),
  },
  gainers30: m30.slice(0, 15).map(fmtMover),
  losers30: m30.slice(-15).reverse().map(fmtMover),
  gainers10: m10.slice(0, 15).map(fmtMover),
  losers10: m10.slice(-15).reverse().map(fmtMover),
  volatile: vol.slice(0, 12).map(v => ({ n: v.key.split('|')[0], s: v.key.slice(-1), sd: v.sd, r: v.meanR })),
  blueChips: blue.slice(0, 8).map(v => ({ n: v.key.split('|')[0], s: v.key.slice(-1), sd: v.sd, r: v.meanR })),
  spikes: spikes.slice(0, 14).map(s => ({ n: s.key.split('|')[0], s: s.key.slice(-1), peak: s.peak, y: s.peakYear, x: s.ratio })),
  crashes: crashes.slice(0, 14).map(c => ({ n: c.key.split('|')[0], s: c.key.slice(-1), pr: c.peakR, y: c.peakYear, now: c.nowR, drop: c.dropPct })),
  tapeUp: tape.slice(0, 20).map(t => ({ n: t.key.split('|')[0], s: t.key.slice(-1), p: t.pct })),
  tapeDown: tape.slice(-20).reverse().map(t => ({ n: t.key.split('|')[0], s: t.key.slice(-1), p: t.pct })),
  states: { top: stateTop, distinctive },
  unisex: { share: uniShare, top: uniTop.slice(0, 12), flips: uniFlips.slice(0, 8) },
  penny,
  db: dbEntries,
};
// make penny picks quotable in the terminal even though they're below the db floor
for (const p of penny.picks) {
  const k = p.n + '|' + p.s;
  if (!out.db[k]) {
    const arr = series.get(k);
    let first = 0; while (arr[first] === 0) first++;
    let last = YEARS - 1; while (arr[last] === 0) last--;
    out.db[k] = [Y0 + first, Array.from(arr.slice(first, last + 1))];
  }
}

fs.writeFileSync(path.join(process.env.HOME, 'baby-names/payload.json'), JSON.stringify(out));

// ---------- pro terminal payload: lookup db + per-name state distribution ----------
const sdbOut = {};
for (const k of Object.keys(out.db)) if (sdb[k]) sdbOut[k] = sdb[k];
const term = {
  y0: Y0, y1: Y1,
  namedTotals: out.namedTotals,
  db: out.db,
  sdb: sdbOut,
  stateTotals5,
};
fs.writeFileSync(path.join(process.env.HOME, 'baby-names/payload-terminal.json'), JSON.stringify(term));
console.log('terminal payload:', (fs.statSync(path.join(process.env.HOME, 'baby-names/payload-terminal.json')).size / 1e6).toFixed(2), 'MB');
const size = fs.statSync(path.join(process.env.HOME, 'baby-names/payload.json')).size;
console.log('payload size:', (size / 1e6).toFixed(2), 'MB');
console.log('births 2024:', births[2024]);
console.log('top gainers 30y:', out.gainers30.slice(0, 8).map(x => x.n + '/' + x.s + ' +' + x.d).join(', '));
console.log('top losers 30y:', out.losers30.slice(0, 8).map(x => x.n + '/' + x.s + ' ' + x.d).join(', '));
console.log('volatile:', out.volatile.slice(0, 8).map(x => x.n + '/' + x.s + ' ' + x.sd).join(', '));
console.log('spikes:', out.spikes.slice(0, 10).map(x => `${x.n}/${x.s} ${x.y} x${x.x}`).join(', '));
console.log('top10share F 1880/1950/2024:', top10share.F[0], top10share.F[1950 - Y0], top10share.F[I24]);
console.log('effNames F 1950/2024:', effNames.F[1950 - Y0], effNames.F[I24]);
