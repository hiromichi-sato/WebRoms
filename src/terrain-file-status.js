export function terrainFileStatus(files) {
  const names = files.map(f => f.name.toLowerCase());
  if (!names.length) return ['.shp 形状', '.dbf 水深属性', '.prj 座標系'].map(label => ({ label, state: 'idle', text: '未選択' }));
  const archive = names.some(name => /\.(zip|nc)$/.test(name));
  if (archive) return [{ label: names.some(name => /\.nc$/.test(name)) ? '格子データ（NetCDF）' : 'ベクターデータ一式（ZIP）', state: names.length === 1 ? 'ready' : 'missing', text: names.length === 1 ? '選択済み・内容は読み込み時に確認' : '混在しています：ZIPまたはNetCDFを1ファイルだけ指定' }];
  const bases = [...new Set(names.map(name => name.replace(/\.[^.]+$/, '')))];
  return bases.flatMap(base => ['shp', 'dbf', 'prj', 'shx', 'cpg'].map(ext => {
    const found = names.includes(`${base}.${ext}`), required = ['shp', 'dbf', 'prj'].includes(ext);
    return { label: `${base}.${ext}`, state: found ? 'ready' : required ? 'missing' : 'optional', text: found ? '選択済み' : required ? '不足・必須' : '任意' };
  }));
}
