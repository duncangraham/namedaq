// Merge origin layers into meanings.json: curated desk notes > Wiktionary > respelling matcher.
import fs from 'fs';

const payload = JSON.parse(fs.readFileSync('payload.json'));
const wikt = JSON.parse(fs.readFileSync('meanings-wikt.json'));

// total babies per name (for variant direction: small name -> bigger name)
const vol = {};
for (const [key, e] of Object.entries(payload.db)) {
  const n = key.split('|')[0];
  vol[n] = (vol[n] || 0) + e[1].reduce((a, b) => a + b, 0);
}
const names = Object.keys(vol);

// ---- layer 3: curated desk notes (facts verified against the data/story sections) ----
const CURATED = {
  Nevaeh: '“heaven” spelled backwards — a 2000s American coinage',
  Khaleesi: 'Dothraki for “queen,” coined by George R.R. Martin',
  Kylo: 'from Star Wars’ Kylo Ren (2015)',
  Daleyza: 'coined on the reality show Larrymania (2013)',
  Wrenley: 'modern coinage: wren, the songbird, plus the fashionable -ley ending',
  Everleigh: 'modern coinage: ever + -leigh, a 2010s spelling-wave favorite',
  Oaklynn: 'modern nature coinage: oak + -lynn',
  Oaklee: 'modern nature coinage: oak + -lee',
  Kehlani: 'after the R&B singer Kehlani',
  Cataleya: 'from the Cattleya orchid, via the film Colombiana (2011)',
  Miley: 'after Miley Cyrus — a childhood nickname shortened from “Smiley”',
  Elian: 'Spanish name; surged with the Elián González story (2000)',
  Saint: 'the English word, taken up as a name in the mid-2010s',
  Kobe: 'after Kobe Bryant, himself named for Kobe, Japan',
  Zhuri: 'popularized by Zhuri James, daughter of LeBron James',
  Litzy: 'after the Mexican pop singer and telenovela actress Litzy',
  Talan: 'popularized by Talan Torriero of MTV’s Laguna Beach (2005)',
  Allisson: 'double-s spelling popularized by Mexican actress Allisson Lozz',
  Ailany: 'modern variant of Hawaiian Ailani, “high chief”',
  Aaliyah: 'Arabic, “exalted, lofty” — popularized by the singer Aaliyah',
  Yaretzi: 'Nahuatl origin, commonly glossed “you will always be loved”',
  Barack: 'from Swahili baraka, “blessing” — via President Obama',
};

// ---- layer 2: respelling matcher ----
// conservative normalization: spelling-fashion equivalences only
function key(n) {
  let s = n.toLowerCase();
  s = s.replace(/eigh/g, 'ey');
  s = s.replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/x/g, 'ks');
  s = s.replace(/ai|ay/g, 'a');
  s = s.replace(/(ee|ey|ie|y|i)$/, '#');
  s = s.replace(/(.)\1+/g, '$1');
  return s;
}
const byKey = {};
for (const n of names) (byKey[key(n)] ??= []).push(n);

const out = {};
for (const [n, e] of Object.entries(wikt)) if (e.t) out[n] = { t: e.t, s: 'w' };
for (const [n, t] of Object.entries(CURATED)) if (vol[n] !== undefined) out[n] = { t, s: 'e' };

let varCount = 0;
for (const n of names) {
  if (out[n]) continue;
  const sibs = (byKey[key(n)] || []).filter(m => m !== n && vol[m] >= vol[n] * 5);
  if (!sibs.length) continue;
  sibs.sort((a, b) => vol[b] - vol[a]);
  const target = sibs[0];
  const tMean = out[target];
  out[n] = { t: 'respelling of ' + target + (tMean && tMean.s !== 'v' ? ' — ' + tMean.t : ''), s: 'v' };
  varCount++;
}
fs.writeFileSync('meanings.json', JSON.stringify(out));
const total = Object.keys(out).length;
// baby-weighted coverage
let covered = 0, all = 0;
for (const n of names) { all += vol[n]; if (out[n]) covered += vol[n]; }
console.log(`meanings: ${total}/${names.length} names (${(total / names.length * 100).toFixed(0)}%)`);
console.log(`  wikt: ${total - varCount - Object.keys(CURATED).filter(c => out[c]?.s === 'e').length} · variants: ${varCount} · curated: ${Object.keys(CURATED).filter(c => out[c]?.s === 'e').length}`);
console.log(`  baby-weighted coverage: ${(covered / all * 100).toFixed(1)}%`);
console.log('samples:');
for (const n of ['Aiden', 'Ayden', 'Jaxon', 'Preslee', 'Wrenleigh', 'Nevaeh', 'Zaveah', 'Lilieth', 'Olivia', 'Liam'])
  console.log(`  ${n}: ${out[n] ? out[n].t + ' [' + out[n].s + ']' : '(none)'}`);
