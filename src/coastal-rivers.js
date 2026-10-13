export function coastalReceiverOptions(fields, landCell) {
  const { nx, ny, mask } = fields;
  if (!Number.isInteger(landCell) || landCell < 0 || landCell >= nx * ny || mask[landCell]) throw new Error('海に面する陸地を1マス選択してください。');
  const i = landCell % nx, j = Math.floor(landCell / nx);
  const adjacent = [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]].filter(([x, y]) => x >= 0 && y >= 0 && x < nx && y < ny && mask[y * nx + x]);
  if (!adjacent.length) throw new Error('この陸地は海に面していません。斜めではなく、辺が海に接する陸地を選択してください。');
  const valid = adjacent.filter(([x, y]) => x > 0 && y > 0 && x < nx - 1 && y < ny - 1);
  if (!valid.length) throw new Error('隣接する海が外周セルだけです。外周はROMSの境界用です。流入先と外周の海を合わせて2マス以上確保するか、内側の沿岸を選んでください。');
  return valid.map(([x, y]) => ({ cell: y * nx + x, direction: x < i ? 'west' : x > i ? 'east' : y < j ? 'south' : 'north', label: x < i ? '← 西へ' : x > i ? '→ 東へ' : y < j ? '↓ 南へ' : '↑ 北へ' }));
}

export function coastalReceiver(fields, landCell, selectedCell) {
  const options = coastalReceiverOptions(fields, landCell);
  if (selectedCell === undefined) return options[0].cell;
  if (!options.some(option => option.cell === selectedCell)) throw new Error('河川の流入先は、河口の陸地に辺で接する内側の水域セルを選んでください。');
  return selectedCell;
}

export function invalidRiverIndices(fields, rivers) {
  return rivers.flatMap((river, index) => {
    const i = river.cell % fields.nx, j = Math.floor(river.cell / fields.nx);
    if (!fields.mask[river.cell] || i <= 0 || j <= 0 || i >= fields.nx - 1 || j >= fields.ny - 1) return [index];
    if (river.landCell !== undefined) {
      try { coastalReceiver(fields, river.landCell, river.cell); }
      catch { return [index]; }
    }
    return [];
  });
}
