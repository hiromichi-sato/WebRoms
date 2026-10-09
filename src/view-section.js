// Sample rho-centered fields and native staggered velocities without mutating data.
export function fieldValue(f, variable, p, k) {
  const source = f.biology?.[variable] ?? f[variable], size = f.nx * f.ny;
  if (!source) return 0;
  if (source.length === size) return source[p];
  if (variable === 'u' || variable === 'v') {
    if (source.length === size * f.nz) return source[k * size + p];
    const i = p % f.nx, j = Math.floor(p / f.nx), stride = variable === 'u' ? (f.nx - 1) * f.ny : f.nx * (f.ny - 1);
    const indices = variable === 'u'
      ? [i > 0 ? j * (f.nx - 1) + i - 1 : -1, i < f.nx - 1 ? j * (f.nx - 1) + i : -1]
      : [j > 0 ? (j - 1) * f.nx + i : -1, j < f.ny - 1 ? j * f.nx + i : -1];
    const values = indices.filter(index => index >= 0).map(index => source[k * stride + index]).filter(Number.isFinite);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  }
  return source[k * size + p] ?? 0;
}

export class SectionView {
  constructor(canvas, owner, color, labels, listen = true) {
    this.canvas = canvas; this.owner = owner; this.color = color; this.labels = labels;
    this.scale = 1; this.offsetX = 0; this.offsetY = 0;
    canvas.style.touchAction = 'none';
    if (!listen) return;
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0 && event.button !== 2) return;
      if (event.shiftKey || !owner.editing) { this.pan = { x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); return; }
      canvas.setPointerCapture(event.pointerId); this.pick(event, true);
    });
    canvas.addEventListener('pointermove', event => {
      if (this.pan && event.buttons) {
        this.offsetX += event.clientX - this.pan.x; this.offsetY += event.clientY - this.pan.y;
        this.pan = { x: event.clientX, y: event.clientY }; owner.draw();
      } else this.pick(event, Boolean(event.buttons & 3));
    });
    canvas.addEventListener('wheel', event => { event.preventDefault(); this.zoom(event.deltaY < 0 ? 1 : -1); }, { passive: false });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, () => owner.onPick(null, false, true));
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, () => { this.pan = null; });
    canvas.addEventListener('contextmenu', event => { if (owner.editing) event.preventDefault(); });
  }
  zoom(direction) { this.scale = Math.max(1, Math.min(12, this.scale * (direction > 0 ? 1.3 : 1 / 1.3))); if (this.scale === 1) this.offsetX = this.offsetY = 0; this.owner.draw(); }
  home() { this.scale = 1; this.offsetX = this.offsetY = 0; this.owner.draw(); }
  draw(mode, options = {}) {
    this.cells = []; this.mode = mode;
    const f = this.owner.fields;
    if (!mode || !f) return;
    const canvas = this.canvas, bounds = canvas.getBoundingClientRect(), dpr = globalThis.devicePixelRatio || 1;
    const w = bounds.width, h = bounds.height;
    if (w <= 0 || h <= 0) return;
    const pixelW = Math.max(1, Math.round(w * dpr)), pixelH = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== pixelW) canvas.width = pixelW;
    if (canvas.height !== pixelH) canvas.height = pixelH;
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#edf3f1'; ctx.fillRect(0, 0, w, h);
    const variable = mode === 'boundary' ? options.variable ?? this.owner.variable : this.owner.variable, boundary = options.boundary ?? {}, side = options.side ?? 'west';
    const isBoundary = mode === 'boundary', verticalSide = side === 'west' || side === 'east';
    const length = isBoundary && verticalSide ? f.ny : f.nx;
    const slice = Math.max(0, Math.min(f.ny - 1, Math.floor(options.slice ?? this.owner.slice ?? 0)));
    const indexAt = q => !isBoundary ? slice * f.nx + q : side === 'west' ? q * f.nx : side === 'east' ? q * f.nx + f.nx - 1 : side === 'south' ? q : (f.ny - 1) * f.nx + q;
    const valueAt = (q, k) => isBoundary ? boundary.painted?.[variable]?.[k]?.[q] ?? (variable === 'zeta' ? boundary.zeta ?? 0 : boundary.layers?.[k]?.[variable] ?? 0) : fieldValue(f, variable, indexAt(q), k);
    let min = Infinity, max = -Infinity, maxDepth = 1, wet = 0;
    for (let q = 0; q < length; q++) {
      const p = indexAt(q); maxDepth = Math.max(maxDepth, f.h[p]); if (!f.mask[p]) continue;
      wet++;
      for (let k = 0; k < f.nz; k++) { const value = valueAt(q, k); if (Number.isFinite(value)) { min = Math.min(min, value); max = Math.max(max, value); } }
    }
    if (!Number.isFinite(min)) { min = 0; max = 1; }
    if (!isBoundary && Number.isFinite(this.owner.min) && Number.isFinite(this.owner.max)) { min = this.owner.min; max = this.owner.max; }
    this.range = { min, max, variable };
    const x0 = Math.min(42, w * 0.14), y0 = Math.min(66, h * 0.25), rw = Math.max(1, w - x0 - 14), rh = Math.max(1, h - y0 - 36), cellW = rw * this.scale / length;
    this.offsetX = Math.max(rw * (1 - this.scale), Math.min(0, this.offsetX));
    this.offsetY = Math.max(rh * (1 - this.scale), Math.min(0, this.offsetY));
    this.plot = { x: x0, y: y0, width: rw, height: rh };
    ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, rw, rh); ctx.clip();
    ctx.fillStyle = '#b8c5b8'; ctx.fillRect(x0, y0, rw, rh);
    for (let q = 0; q < length; q++) for (let k = 0; k < f.nz; k++) {
      const p = indexAt(q), depth = f.h[p], cellH = rh * this.scale / f.nz * (isBoundary ? 1 : depth / maxDepth);
      const x = x0 + q * cellW + this.offsetX, y = y0 + (f.nz - k - 1) * cellH + this.offsetY;
      const value = valueAt(q, k);
      const wetCell = f.mask[p] && !(isBoundary && boundary.mode === 'closed');
      ctx.fillStyle = wetCell ? this.color(value, min, max, variable).getStyle() : '#aeb5b6';
      ctx.fillRect(x, y, cellW + 0.5, cellH + 0.5);
      ctx.strokeStyle = k === this.owner.layer ? '#fff' : 'rgba(37,65,55,.3)'; ctx.lineWidth = k === this.owner.layer ? 1.5 : 0.6;
      ctx.strokeRect(x, y, cellW, cellH);
      if (wetCell) this.cells.push({ p, k, x, y, width: cellW, height: cellH, topDepth: (f.nz - k - 1) * depth / f.nz, bottomDepth: (f.nz - k) * depth / f.nz });
      if (wetCell && cellW >= 34 && cellH >= 20) { ctx.fillStyle = '#172a29'; ctx.font = '10px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(Number(value.toPrecision(3)).toString(), x + cellW / 2, y + cellH / 2, cellW - 3); }
    }
    ctx.restore();
    ctx.strokeStyle = '#71877b'; ctx.lineWidth = 1; ctx.strokeRect(x0, y0, rw, rh);
    ctx.fillStyle = '#24312f'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = '600 12px system-ui';
    const closed = isBoundary && boundary.mode === 'closed';
    const title = isBoundary ? `${{ west: '西', east: '東', south: '南', north: '北' }[side]}側境界${closed ? '・閉鎖' : ''}` : `鉛直断面 A–A′ j=${slice}`;
    canvas.dataset.sectionRow = String(slice);
    if (!isBoundary) { ctx.fillStyle = '#bb3269'; ctx.fillRect(0, 0, w, 3); }
    ctx.fillText(`${title} · ${this.labels[variable] ?? variable}`, 10, 16, Math.max(1, w - 20));
    const gradient = ctx.createLinearGradient(x0, 0, x0 + rw, 0);
    for (let n = 0; n <= 20; n++) gradient.addColorStop(n / 20, this.color(min + (max - min) * n / 20, min, max, variable).getStyle());
    ctx.fillStyle = closed ? '#aeb5b6' : gradient; ctx.fillRect(x0, 30, rw, 6);
    ctx.fillStyle = '#52675c'; ctx.font = '10px system-ui'; ctx.fillText(closed ? '陸色' : min.toPrecision(3), x0, 46); ctx.textAlign = 'right'; ctx.fillText(closed ? '' : max.toPrecision(3), x0 + rw, 46);
    const topDepth = -this.offsetY / (rh * this.scale) * maxDepth, bottomDepth = (rh - this.offsetY) / (rh * this.scale) * maxDepth;
    ctx.textAlign = 'left'; ctx.fillText(isBoundary ? '表層' : topDepth < .5 ? '表層' : `${Math.round(topDepth)}m`, 2, y0 + 8, Math.max(1, x0 - 4)); ctx.fillText(isBoundary ? '底層' : `${Math.round(bottomDepth)}m`, 2, y0 + rh - 6, Math.max(1, x0 - 4));
    ctx.textAlign = 'center'; ctx.fillText(wet ? (isBoundary && verticalSide ? '南 → 北' : '西 → 東') : '陸域 · 水域セルなし', x0 + rw / 2, y0 + rh + 20, rw);
  }
  hitAt(event) {
    const bounds = this.canvas.getBoundingClientRect(), x = event.clientX - bounds.left, y = event.clientY - bounds.top;
    if (!this.plot || x < this.plot.x || x > this.plot.x + this.plot.width || y < this.plot.y || y > this.plot.y + this.plot.height) return null;
    const cell = this.cells?.find(cell => x >= cell.x && x < cell.x + cell.width && y >= cell.y && y < cell.y + cell.height);
    if (!cell) return null;
    return { ...cell, depth: cell.topDepth + (cell.bottomDepth - cell.topDepth) * (y - cell.y) / cell.height };
  }
  pick(event, paint) {
    const hit = this.hitAt(event); if (!hit) return;
    this.owner.onPick(hit.p, paint && this.owner.editing, false, hit.k, { source: this.mode, depth: hit.depth, normal: { x: 0, y: 0, z: 1 } });
  }
}
