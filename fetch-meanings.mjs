// Harvest name origins from English Wiktionary (CC BY-SA) for every listed name.
// Output: meanings-wikt.json  { Name: { g:[genders], t:"origin text" } }
import fs from 'fs';

const payload = JSON.parse(fs.readFileSync('payload.json'));
const names = [...new Set(Object.keys(payload.db).map(k => k.split('|')[0]))];
console.log('names to fetch:', names.length);

const UA = { 'User-Agent': 'namedaq-origins/1.0 (open-data project; duncangraham75@gmail.com)' };
const out = {};

// map from= values to readable phrases
const FROM = {
  'surnames': 'transferred from a surname',
  'coinages': 'a modern coinage',
  'place names': 'from a place name',
  'nicknames': 'from a nickname',
  'the Bible': 'from the Bible',
};
const fromPhrase = f => FROM[f] || 'from ' + f;

function parseEnglish(wt) {
  const em = wt.match(/==\s*English\s*==([\s\S]*?)(?:\n==[^=]|$)/);
  if (!em) return null;
  const eng = em[1];
  // 1) {{given name|en|...}} templates (may be several: male + female entries)
  const gns = [...eng.matchAll(/\{\{given name\|([^}]*)\}\}/g)];
  if (gns.length) {
    const genders = new Set(); const froms = new Set(); let dimOf = null, varOf = null, eq = null;
    for (const m of gns) {
      const parts = m[1].split('|');
      for (const part of parts) {
        const [k, v] = part.includes('=') ? part.split(/=(.*)/) : [null, part];
        if (k === null) {
          const g = v.trim();
          if (['male', 'female', 'unisex'].includes(g)) genders.add(g);
        } else if (k === 'or') { if (['male','female','unisex'].includes(v)) genders.add(v); }
        else if (k === 'from') v.split(',').forEach(f => froms.add(f.trim()));
        else if (k === 'dimof' || k === 'dim') dimOf = v.split(',')[0].trim();
        else if (k === 'varof' || k === 'var') varOf = v.split(',')[0].trim();
        else if (k === 'eq') eq = v.split(',')[0].trim();
      }
    }
    const bits = [];
    if (dimOf) bits.push('diminutive of ' + dimOf);
    if (varOf) bits.push('variant of ' + varOf);
    if (froms.size) bits.push([...froms].slice(0, 2).map(fromPhrase).join(', also '));
    if (!bits.length && eq) bits.push('equivalent of ' + eq);
    return { g: [...genders], t: bits.join('; ') };
  }
  // 2) diminutive / variant / spelling templates on the definition line
  const dim = eng.match(/\{\{(?:dim of|diminutive of)\|en\|([^|}]+)/);
  if (dim) return { g: [], t: 'diminutive of ' + dim[1].replace(/[#\[\]]/g, '') };
  const alt = eng.match(/\{\{(?:alternative (?:form|spelling) of|alt form|alt sp)\|en\|([^|}]+)/);
  if (alt) return { g: [], t: 'variant of ' + alt[1].replace(/[#\[\]]/g, '') };
  const fem = eng.match(/\{\{female equivalent of\|en\|([^|}]+)/);
  if (fem) return { g: ['female'], t: 'feminine form of ' + fem[1].replace(/[#\[\]]/g, '') };
  return null;
}

let hits = 0;
for (let i = 0; i < names.length; i += 50) {
  const batch = names.slice(i, i + 50);
  const url = 'https://en.wiktionary.org/w/api.php?action=query&format=json&formatversion=2&prop=revisions&rvprop=content&rvslots=main&titles=' + encodeURIComponent(batch.join('|'));
  let j = null;
  for (let tries = 0; tries < 3; tries++) {
    try { const r = await fetch(url, { headers: UA }); j = await r.json(); break; }
    catch (e) { await new Promise(res => setTimeout(res, 2000)); }
  }
  if (!j) { console.log('batch failed permanently at', i); continue; }
  for (const pg of (j.query?.pages || [])) {
    if (pg.missing) continue;
    const wt = pg.revisions?.[0]?.slots?.main?.content || '';
    const parsed = parseEnglish(wt);
    if (parsed && parsed.t) { out[pg.title] = parsed; hits++; }
    else if (parsed) { out[pg.title] = parsed; hits++; } // gender-only entries still useful? keep only with text
  }
  if ((i / 50) % 20 === 0) console.log('batch', i / 50, '·', hits, 'hits so far');
  await new Promise(res => setTimeout(res, 250));
}
// drop entries with no text at all
for (const k of Object.keys(out)) if (!out[k].t && !out[k].g.length) delete out[k];
fs.writeFileSync('meanings-wikt.json', JSON.stringify(out));
console.log('DONE:', Object.keys(out).length, 'of', names.length, 'names have Wiktionary data');
