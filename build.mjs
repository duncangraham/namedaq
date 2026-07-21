// Inject data payloads + meanings into both raw pages -> *-injected.html
import fs from 'fs';

const meanings = fs.readFileSync('meanings.json', 'utf8');

for (const [raw, payloadFile, outFile] of [
  ['namedaq-raw.html', 'payload.json', 'namedaq-injected.html'],
  ['terminal-raw.html', 'payload-terminal.json', 'terminal-injected.html'],
]) {
  let html = fs.readFileSync(raw, 'utf8');
  html = html.replace('/*PAYLOAD*/null/*ENDPAYLOAD*/', fs.readFileSync(payloadFile, 'utf8'));
  html = html.replace('/*MEANINGS*/null/*ENDMEANINGS*/', meanings);
  fs.writeFileSync(outFile, html);
  console.log(outFile, (html.length / 1e6).toFixed(2), 'MB');
}
