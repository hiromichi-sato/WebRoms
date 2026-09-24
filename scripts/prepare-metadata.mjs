import { readFile, writeFile } from 'node:fs/promises';
import { parse } from 'yaml';

const root = new URL('../runtime/', import.meta.url);
const source = await readFile(new URL('varinfo.yaml', root), 'utf8');
// ROMS accepts the unquoted SVN keyword containing ': '; standard YAML does not.
const { metadata } = parse(source.replace(/^git_repository:.*$/m, ''));
const fields = ['variable', 'long_name', 'units', 'field', 'time', 'index_code', 'type'];
const number = value => Number(String(value).replace(/[dD]/, 'e'));
const lines = ['! Generated from the pinned ROMS varinfo.yaml; see licenses/ROMS.txt.'];
for (const entry of metadata) {
  if (number(entry.add_offset) !== 0) throw new Error(`Nonzero offset cannot be represented in varinfo.dat: ${entry.variable}`);
  for (const field of fields) {
    if (typeof entry[field] !== 'string' || /[\r\n]/.test(entry[field])) throw new Error(`Invalid metadata field: ${entry.variable}.${field}`);
    lines.push("'" + entry[field].replaceAll("'", "''") + "'");
  }
  if (!Number.isFinite(number(entry.scale))) throw new Error(`Invalid scale: ${entry.variable}`);
  lines.push(String(number(entry.scale)), '');
}
await writeFile(new URL('varinfo.dat', root), lines.join('\n'));
console.log(`Converted ${metadata.length} ROMS metadata entries`);
