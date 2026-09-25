import { readFile, writeFile } from 'node:fs/promises';

// Read scalar reaction parameters from the single-grid ROMS input examples.
const models = {};
const metadata = (await readFile('runtime/varinfo.dat', 'utf8')).split(/\r?\n/);
const netcdfName = id => {
  const index = metadata.findIndex(line => line.trim() === `'${id}'`);
  if (index < 5) throw new Error(`Missing ROMS metadata ${id}`);
  return metadata[index - 5].trim().slice(1, -1);
};
for (const [id, file, label, entries] of [
  ['npzd', 'npzd_Franks', 'NPZD (Franks)', [['NO3_', '栄養塩 N'], ['Phyt', '植物プランクトン P'], ['Zoop', '動物プランクトン Z'], ['SDet', 'デトリタス D']]],
  ['nemuro', 'nemuro', 'NEMURO', [['Sphy', '小型植物プランクトン PS'], ['Lphy', '大型植物プランクトン PL'], ['Szoo', '小型動物プランクトン ZS'], ['Lzoo', '大型動物プランクトン ZL'], ['Pzoo', '捕食性動物プランクトン ZP'], ['NO3_', '硝酸塩 NO3'], ['NH4_', 'アンモニウム NH4'], ['PON_', '粒状有機窒素 PON'], ['DON_', '溶存有機窒素 DON'], ['SiOH', 'ケイ酸 SiOH4'], ['opal', 'オパール Opal']]]
]) {
  const source = `roms/ROMS/External/${file}.in`;
  const lines = (await readFile(source, 'utf8')).split(/\r?\n/);
  const initial = {}, parameters = []; let comments = [];
  for (const line of lines) {
    if (/^\s*TNU2\s*==/.test(line)) break;
    if (line.startsWith('!')) { comments.push(line.slice(1).trim()); continue; }
    const match = line.match(/^\s*(BioIni\(i\w+\)|\w+)\s*==\s*([+-]?[\d.]+(?:[dDeE][+-]?\d+)?)\s*(?:!.*)?$/);
    if (!match) continue;
    const [, key, literal] = match, value = Number(literal.replace(/[dD]/, 'e'));
    if (key.startsWith('BioIni')) initial[key.slice(8, -1)] = value;
    else {
      const description = comments.join(' '), unit = description.match(/\[([^\]]+)\]/)?.[1] ?? '';
      parameters.push({ key, value, unit, description: description.replace(/\s+/g, ' ').trim() });
    }
    comments = [];
  }
  if (id === 'nemuro') {
    const sample = await readFile('roms/sample/NEMURO.BOX.f90', 'utf8');
    for (const [name, variable] of Object.entries({ Sphy: 'TPS', Lphy: 'TPL', Szoo: 'TZS', Lzoo: 'TZL', Pzoo: 'TZP', NO3_: 'TNO3', NH4_: 'TNH4', PON_: 'TPON', DON_: 'TDON', SiOH: 'TSiOH4', opal: 'TOpal' })) {
      const match = sample.match(new RegExp('::\\s*' + variable + '\\s*=\\s*([\\d.]+[dD][+-]?\\d+)'));
      if (!match) throw new Error(`Missing sample variable ${variable}`);
      initial[name] = Number(match[1].replace(/[dD]/, 'e')) * 1e6; // mol/l to mmol/m3
    }
  }
  models[id] = { label, source, initialSource: id === 'nemuro' ? 'roms/sample/NEMURO.BOX.f90 (A7; mol/l to mmol/m3)' : source, parameters, tracers: entries.map(([name, label]) => {
    if (!Number.isFinite(initial[name])) throw new Error(`Missing ${id} initial ${name}`);
    return { key: `${id}_${name}`, roms: name, netcdf: netcdfName(`idTvar(i${name})`), boundary: netcdfName(`idTbry(iwest,i${name})`).replace(/_west$/, ''), label, initial: initial[name], unit: ['SiOH', 'opal'].includes(name) ? 'mmol Si/m³' : 'mmol N/m³' };
  }) };
}
await writeFile('src/biology-catalog.js', '// Generated from ROMS/External input examples by scripts/generate-biology-catalog.mjs.\nexport const BIO_MODELS = ' + JSON.stringify(models, null, 2) + ';\n');
