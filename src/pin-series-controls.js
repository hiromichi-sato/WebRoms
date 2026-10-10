export class PinSeriesControls {
  constructor(view, toolbar, parent, labels) {
    this.view = view; this.labels = labels; this.cell = null; this.requestId = 0;
    this.button = document.createElement('button'); this.button.id = 'pinSeriesToggle'; this.button.className = 'icon';
    this.button.title = '時系列のピンを配置'; this.button.setAttribute('aria-label', this.button.title); this.button.setAttribute('aria-pressed', 'false');
    this.button.innerHTML = '<i data-lucide="map-pin"></i>'; toolbar.append(this.button);
    this.marker = document.createElement('div'); this.marker.className = 'series-pin'; this.marker.hidden = true; this.marker.innerHTML = '<i data-lucide="map-pin"></i>'; view.container.parentElement.append(this.marker);
    this.root = document.createElement('section'); this.root.id = 'pinSeries'; this.root.hidden = true;
    this.root.innerHTML = '<div class="pin-heading"><strong id="pinSeriesTitle"></strong><button id="removeSeriesPin" class="icon" title="ピンを削除" aria-label="ピンを削除"><i data-lucide="x"></i></button></div><p id="pinSeriesSummary" role="status"></p><canvas id="pinSeriesChart" aria-label="選択地点の直近48時間の時系列"></canvas><output id="pinSeriesValue"></output>';
    parent.after(this.root); this.canvas = this.root.querySelector('canvas'); this.summary = this.root.querySelector('p'); this.output = this.root.querySelector('output');
    this.button.onclick = () => { this.placing = !this.placing; this.button.setAttribute('aria-pressed', String(this.placing)); };
    this.root.querySelector('button').onclick = () => this.clear();
    for (const surface of [view.renderer?.domElement, view.canvas].filter(Boolean)) {
      let down;
      surface.addEventListener('pointerdown', e => { down = e.button === 0 ? { x: e.clientX, y: e.clientY } : null; });
      surface.addEventListener('pointerup', e => {
        if (!this.visible || !this.placing || !down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
        down = null;
        const hit = view.mode === '3d' ? view.hitAt3d(e) : view.cellAt(e), p = typeof hit === 'number' ? hit : hit?.p;
        if (!Number.isInteger(p) || !view.fields.mask[p]) return;
        this.cell = p; this.placing = false; this.button.setAttribute('aria-pressed', 'false'); this.key = null; this.request(); this.position();
      });
      surface.addEventListener('pointercancel', () => { down = null; });
    }
    view.onSceneDraw = () => this.position();
    new ResizeObserver(() => this.plot()).observe(this.canvas);
    this.canvas.onpointermove = e => {
      if (!this.data?.samples.length) return;
      const x = e.clientX - this.canvas.getBoundingClientRect().left, target = this.start + (x - 64) / Math.max(1, this.width - 84) * (this.end - this.start);
      const s = this.data.samples.reduce((a, b) => Math.abs(a.time - target) < Math.abs(b.time - target) ? a : b);
      this.output.textContent = `${(s.time / 3600).toFixed(2)} h : ${s.value === null ? '深度範囲外' : Number(s.value.toPrecision(6))}`;
    };
  }
  clear() { this.cell = null; this.data = null; this.key = null; this.requestId++; this.root.hidden = this.marker.hidden = true; }
  update(visible, worker, time, field, layer, depth) {
    if (worker !== this.worker) this.clear();
    Object.assign(this, { visible, worker, time, field, layer, depth });
    this.button.hidden = !visible; this.button.disabled = !worker || !Number.isFinite(time);
    this.root.hidden = !visible || this.cell === null; this.position(); this.request();
  }
  request() {
    if (!this.visible || !this.worker || this.cell === null) return;
    const key = JSON.stringify([this.cell, this.field, this.layer, this.depth, this.time]); if (key === this.key) return;
    this.key = key; this.root.hidden = false; this.data = null; this.summary.textContent = '時系列を読み込み中'; this.output.textContent = ''; this.plot();
    this.root.querySelector('strong').textContent = `地点 (${this.cell % this.view.fields.nx}, ${Math.floor(this.cell / this.view.fields.nx)}) · ${this.labels[this.field]} · ${['h', 'zeta'].includes(this.field) ? '海面・地形' : this.depth === null ? `第${this.view.fields.nz - this.layer}層` : `${this.depth} m`}`;
    this.worker.postMessage({ type: 'pin-series', requestId: ++this.requestId, cell: this.cell, field: this.field, layer: this.layer, depth: this.depth });
  }
  receive(data) {
    if (data.requestId !== this.requestId) return;
    if (data.error) { this.summary.textContent = data.error; return; }
    this.data = data;
    const first = data.samples[0]?.time ?? 0, last = data.samples.at(-1)?.time ?? 0;
    this.summary.textContent = `${(first / 3600).toFixed(2)}–${(last / 3600).toFixed(2)} h ／ ${data.samples.length}点 ／ 標準間隔 ${(data.interval / 60).toFixed(1)}分（終了点を含む）`;
    this.plot();
  }
  position() {
    const pos = this.cell === null ? null : this.view.pinPosition(this.cell);
    this.marker.hidden = !this.visible || !pos;
    if (pos) { this.marker.style.left = pos.x + 'px'; this.marker.style.top = pos.y + 'px'; }
  }
  plot() {
    const w = this.canvas.clientWidth; if (!w) return;
    this.width = w; const h = 210, d = devicePixelRatio;
    this.canvas.width = Math.round(w * d); this.canvas.height = h * d;
    const ctx = this.canvas.getContext('2d'); ctx.scale(d, d); ctx.clearRect(0, 0, w, h);
    if (!this.data?.samples.length) return;
    const samples = this.data.samples, valid = samples.filter(s => s.value !== null);
    if (!valid.length) { ctx.fillText('この深度に有効な値はありません', 20, 80); return; }
    this.end = samples.at(-1).time; this.start = Math.max(0, this.end - 48 * 3600);
    const min = Math.min(...valid.map(s => s.value)), max = Math.max(...valid.map(s => s.value));
    const pad = Math.max((max - min || Math.max(1, Math.abs(max)) * .02) * .1, .0001), lo = min - pad, hi = max + pad;
    const x = t => 64 + (t - this.start) / (this.end - this.start || 1) * (w - 84), y = v => 174 - (v - lo) / (hi - lo) * 155;
    ctx.font = '11px system-ui'; ctx.fillStyle = '#425b60'; ctx.strokeStyle = '#d5e1df';
    const digits = Math.max(0, Math.min(8, Math.ceil(-Math.log10((hi - lo) / 4))));
    for (let i = 0; i <= 4; i++) { const v = lo + (hi - lo) * i / 4, label = v.toFixed(digits); ctx.beginPath(); ctx.moveTo(60, y(v)); ctx.lineTo(w - 20, y(v)); ctx.stroke(); ctx.fillText(label.length > 9 ? v.toExponential(2) : label, 2, y(v) + 4); }
    ctx.fillText(`${(this.start / 3600).toFixed(1)} h`, 64, 199); ctx.textAlign = 'right'; ctx.fillText(`${(this.end / 3600).toFixed(2)} h`, w - 20, 199); ctx.textAlign = 'left';
    ctx.strokeStyle = '#147d70'; ctx.lineWidth = 2; ctx.beginPath(); let active = false;
    for (const s of samples) { if (s.value === null) { active = false; continue; } if (active) ctx.lineTo(x(s.time), y(s.value)); else ctx.moveTo(x(s.time), y(s.value)); active = true; } ctx.stroke();
    ctx.fillStyle = '#147d70'; for (const s of valid) { ctx.beginPath(); ctx.arc(x(s.time), y(s.value), 2.5, 0, 2 * Math.PI); ctx.fill(); }
    this.canvas.dataset.points = String(valid.length);
  }
}
