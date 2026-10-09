export class WindView {
  constructor(canvas, onPick) {
    this.canvas = canvas; this.onPick = onPick; this.scale = 1; this.pan = [0, 0];
    new ResizeObserver(() => this.draw()).observe(canvas);
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); if (!this.editing || e.shiftKey || e.button === 1) this.drag = [e.clientX, e.clientY]; else this.pick(e, true); });
    canvas.addEventListener('pointermove', e => {
      if (this.drag) { this.pan[0] += e.clientX - this.drag[0]; this.pan[1] += e.clientY - this.drag[1]; this.drag = [e.clientX, e.clientY]; this.draw(); }
      else this.pick(e, Boolean(e.buttons & 1));
    });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(event, () => { this.drag = null; onPick(null, false); });
    canvas.addEventListener('wheel', e => { e.preventDefault(); this.zoom(e.deltaY < 0 ? 1 : -1); }, { passive: false });
  }
  zoom(direction) { this.scale = Math.max(1, Math.min(8, this.scale * (direction > 0 ? 1.25 : 0.8))); this.draw(); }
  home() { this.scale = 1; this.pan = [0, 0]; this.draw(); }
  set(fields, wind, editing) { this.fields = fields; this.wind = wind; this.editing = editing; this.canvas.style.cursor = editing ? 'crosshair' : 'grab'; this.draw(); }
  pick(event, paint) {
    if (!this.rect) return;
    const bounds = this.canvas.getBoundingClientRect(), r = this.rect, f = this.fields;
    const i = Math.floor((event.clientX - bounds.left - r.x) / r.w * f.nx), j = f.ny - 1 - Math.floor((event.clientY - bounds.top - r.y) / r.h * f.ny);
    if (i < 0 || j < 0 || i >= f.nx || j >= f.ny) return;
    this.selected = j * f.nx + i; this.onPick(this.selected, paint); this.draw();
  }
  draw() {
    const f = this.fields, wind = this.wind, canvas = this.canvas;
    if (!f || !wind || !canvas.clientWidth || !canvas.clientHeight) return;
    const w = canvas.clientWidth, h = canvas.clientHeight, dpr = devicePixelRatio;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#edf3f1'; ctx.fillRect(0, 0, w, h);
    const aspect = f.nx * f.dx / (f.ny * f.dy), rw = Math.min(w - 32, (h - 48) * aspect) * this.scale, rh = rw / aspect;
    const x = (w - rw) / 2 + this.pan[0], y = (h - rh) / 2 + this.pan[1], cw = rw / f.nx, ch = rh / f.ny;
    this.rect = { x, y, w: rw, h: rh };
    let max = 0;
    for (let p = 0; p < f.mask.length; p++) if (f.mask[p]) max = Math.max(max, Math.hypot(wind.u[p], wind.v[p]));
    for (let j = 0; j < f.ny; j++) for (let i = 0; i < f.nx; i++) {
      const p = j * f.nx + i, speed = Math.hypot(wind.u[p], wind.v[p]), a = x + i * cw, b = y + (f.ny - j - 1) * ch;
      const t = Math.min(1, speed / Math.max(10, max));
      ctx.fillStyle = f.mask[p] ? `rgb(${Math.round(229 - t * 39)},${Math.round(242 - t * 140)},${Math.round(240 - t * 170)})` : '#a6b5ae';
      ctx.fillRect(a, b, cw + 0.5, ch + 0.5);
      if (cw >= 10 && ch >= 10) { ctx.strokeStyle = 'rgba(40,60,65,.18)'; ctx.lineWidth = 0.5; ctx.strokeRect(a, b, cw, ch); }
      const skip = Math.max(1, Math.ceil(18 / Math.min(cw, ch)));
      if (f.mask[p] && speed > 0.001 && i % skip === 0 && j % skip === 0) {
        const length = Math.min(cw * skip, ch * skip) * 0.72 * Math.min(1, speed / Math.max(10, max));
        const angle = Math.atan2(-wind.v[p], wind.u[p]), cx = a + cw / 2, cy = b + ch / 2;
        const ex = cx + Math.cos(angle) * length / 2, ey = cy + Math.sin(angle) * length / 2;
        ctx.strokeStyle = '#24495d'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(cx - Math.cos(angle) * length / 2, cy - Math.sin(angle) * length / 2); ctx.lineTo(ex, ey);
        const head = Math.min(5, length / 2);
        ctx.moveTo(ex - head * Math.cos(angle - 0.6), ey - head * Math.sin(angle - 0.6)); ctx.lineTo(ex, ey); ctx.lineTo(ex - head * Math.cos(angle + 0.6), ey - head * Math.sin(angle + 0.6)); ctx.stroke();
      }
      if (p === this.selected) { ctx.strokeStyle = '#b12d61'; ctx.lineWidth = 2; ctx.strokeRect(a, b, cw, ch); }
    }
    ctx.fillStyle = '#24495d'; ctx.font = '12px system-ui'; ctx.fillText('N ↑   E →', 12, 20);
    ctx.fillText(`10 m風速  0 – ${Math.max(10, max).toFixed(1)} m/s`, 12, h - 12);
  }
}
