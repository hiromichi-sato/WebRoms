import { plotSeries } from './series-sampling.js';

export class PinSeriesControls {
  constructor(view, toolbar, parent, labels) {
    this.view = view; this.labels = labels; this.cell = null; this.requestId = 0;
    this.button = document.createElement('button'); this.button.id = 'pinSeriesToggle'; this.button.className = 'icon';
    this.button.title = '時系列のピンを配置'; this.button.setAttribute('aria-label', this.button.title); this.button.setAttribute('aria-pressed', 'false');
    this.button.innerHTML = '<i data-lucide="map-pin"></i>'; toolbar.append(this.button);
    this.sectionButton = this.button.cloneNode(true); this.sectionButton.id = 'sectionPinSeriesToggle'; document.querySelector('.section-tools').append(this.sectionButton);
    this.sectionButton.onclick = () => { this.button.click(); this.sectionButton.setAttribute('aria-pressed', this.button.getAttribute('aria-pressed')); };
    this.marker = document.createElement('button'); this.marker.type = 'button'; this.marker.className = 'series-pin'; this.marker.title = 'ピンを削除'; this.marker.setAttribute('aria-label', 'このピンを削除'); this.marker.hidden = true; this.marker.innerHTML = '<i data-lucide="map-pin"></i>'; view.container.parentElement.append(this.marker);
    this.sectionMarker = this.marker.cloneNode(true); document.querySelector('.secondary-scene').append(this.sectionMarker); this.sectionMarker.onclick = () => this.clear();
    this.root = document.createElement('section'); this.root.id = 'pinSeries'; this.root.hidden = true;
    this.root.innerHTML = '<div class="pin-heading"><strong id="pinSeriesTitle"></strong><button id="removeSeriesPin" class="icon" title="ピンを削除" aria-label="ピンを削除"><i data-lucide="x"></i></button></div><div class="pin-options"><label>表示間隔<select id="pinSeriesInterval" aria-label="時系列の表示間隔"><option value="1800">30分</option><option value="3600" selected>1時間</option><option value="10800">3時間</option><option value="21600">6時間</option><option value="43200">12時間</option></select></label><label><input id="pinSeriesAverage" type="checkbox" checked>長い間隔は区間平均</label></div><p id="pinSeriesSummary" role="status"></p><div id="pinSeriesYAxis" class="pin-axis-label"></div><canvas id="pinSeriesChart" aria-label="選択地点の直近48時間の時系列"></canvas><output id="pinSeriesValue"></output>';
    parent.after(this.root); this.canvas = this.root.querySelector('canvas'); this.summary = this.root.querySelector('p'); this.output = this.root.querySelector('output');
    this.interval = this.root.querySelector('#pinSeriesInterval'); this.average = this.root.querySelector('#pinSeriesAverage');
    this.interval.onchange = this.average.onchange = () => { this.output.textContent = ''; this.plot(); };
    this.button.onclick = () => { if (this.placing) this.clear(); else { this.placing = true; this.button.setAttribute('aria-pressed', 'true'); } };
    this.marker.onclick = () => this.clear();
    this.root.querySelector('button').onclick = () => this.clear();
    for (const surface of [view.renderer?.domElement, view.canvas, document.getElementById('sectionCanvas')].filter(Boolean)) {
      let down;
      surface.addEventListener('pointerdown', e => { down = e.button === 0 ? { x: e.clientX, y: e.clientY } : null; });
      surface.addEventListener('pointerup', e => {
        if (!this.visible || !this.placing || !down || view.sectionDragging || view.sectionDragged || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
        down = null;
        const section = surface.id === 'sectionCanvas';
        const hit = section ? view.companion?.hitAt(e) : view.mode === '3d' ? view.hitAt3d(e) : view.cellAt(e), p = typeof hit === 'number' ? hit : hit?.p;
        if (!Number.isInteger(p) || !view.fields.mask[p]) return;
        if (section && Number.isInteger(hit.k)) { const selector = document.getElementById('layerSelect'); selector.value = hit.k; selector.dispatchEvent(new Event('change')); }
        if (this.cell === p) { this.clear(); return; }
        this.cell = p; this.key = null; this.request(); this.position();
      });
      surface.addEventListener('pointercancel', () => { down = null; });
    }
    view.onSceneDraw = () => this.position();
    new ResizeObserver(() => this.plot()).observe(this.canvas);
    this.canvas.onpointermove = e => {
      if (!this.plotted?.samples.length) return;
      const x = e.clientX - this.canvas.getBoundingClientRect().left, target = this.start + (x - 64) / Math.max(1, this.width - 84) * (this.end - this.start);
      const s = this.plotted.samples.reduce((a, b) => Math.abs(a.time - target) < Math.abs(b.time - target) ? a : b);
      const label = this.labels[this.field] ?? this.field, unit = label.includes(' / ') ? label.slice(label.indexOf(' / ') + 3) : '';
      this.output.textContent = `${s.from === undefined ? '' : (s.from / 3600).toFixed(2) + '–'}${(s.time / 3600).toFixed(2)} h : ${s.value === null ? 'データなし' : Number(s.value.toPrecision(6)) + ' ' + unit}${s.from === undefined ? '' : '（区間平均）'}`;
    };
  }
  clear() { this.cell = null; this.data = null; this.plotted = null; this.key = null; this.pending = null; this.seriesKey = null; this.placing = false; this.button.setAttribute('aria-pressed', 'false'); this.sectionButton.setAttribute('aria-pressed', 'false'); this.requestId++; this.root.hidden = this.marker.hidden = this.sectionMarker.hidden = true; }
  update(visible, worker, time, field, layer, depth) {
    if (worker !== this.worker) this.clear();
    Object.assign(this, { visible, worker, time, field, layer, depth });
    this.button.hidden = !visible; this.button.disabled = !worker || !Number.isFinite(time);
    this.sectionButton.hidden = !visible; this.sectionButton.disabled = this.button.disabled; this.sectionButton.setAttribute('aria-pressed', String(!!this.placing));
    this.root.hidden = !visible || this.cell === null; this.position(); this.request();
  }
  request() {
    if (!this.visible || !this.worker || this.cell === null) return;
    const key = JSON.stringify([this.cell, this.field, this.layer, this.depth, this.time]); if (key === this.key) return;
    const seriesKey = JSON.stringify([this.cell, this.field, this.layer, this.depth]);
    if (this.pending && this.seriesKey === seriesKey) return;
    if (this.seriesKey !== seriesKey) { this.data = null; this.summary.textContent = '時系列を読み込み中'; this.output.textContent = ''; this.plot(); }
    this.seriesKey = seriesKey; this.key = key; this.root.hidden = false;
    this.root.querySelector('strong').textContent = `地点 (${this.cell % this.view.fields.nx}, ${Math.floor(this.cell / this.view.fields.nx)}) · ${['h', 'zeta'].includes(this.field) ? '海面・地形' : this.depth === null ? `第${this.view.fields.nz - this.layer}層` : `${this.depth} m`}`;
    this.pending = ++this.requestId;
    this.worker.postMessage({ type: 'pin-series', requestId: this.requestId, cell: this.cell, field: this.field, layer: this.layer, depth: this.depth });
  }
  receive(data) {
    if (data.requestId !== this.requestId) return;
    this.pending = null;
    if (data.error) { this.summary.textContent = data.error; return; }
    this.data = data;
    this.plot(); this.request();
  }
  position() {
    const pos = this.cell === null ? null : this.view.pinPosition(this.cell);
    this.marker.hidden = !this.visible || !pos;
    if (pos) { this.marker.style.left = pos.x + 'px'; this.marker.style.top = pos.y + 'px'; }
    const cell = this.cell === null ? null : this.view.companion?.cells?.find(c => c.p === this.cell && c.k === this.layer);
    this.sectionMarker.hidden = !this.visible || !cell;
    if (cell) { const canvas = this.view.companion.canvas, bounds = canvas.getBoundingClientRect(), parent = canvas.parentElement.getBoundingClientRect(); this.sectionMarker.style.left = `${cell.x + cell.width / 2 + bounds.left - parent.left}px`; this.sectionMarker.style.top = `${cell.y + cell.height / 2 + bounds.top - parent.top}px`; }
  }
  plot() {
    const w = this.canvas.clientWidth; if (!w) return;
    this.canvas.dataset.points = '0';
    this.width = w; const h = Math.max(95, this.canvas.clientHeight || 160), d = devicePixelRatio, bottom = h - 44;
    this.canvas.width = Math.round(w * d); this.canvas.height = h * d;
    const ctx = this.canvas.getContext('2d'); ctx.scale(d, d); ctx.clearRect(0, 0, w, h);
    this.root.querySelector('#pinSeriesYAxis').textContent = this.labels[this.field] ?? '';
    this.average.disabled = Number(this.interval.value) <= 3600;
    if (!this.data?.samples.length) { this.plotted = null; return; }
    this.plotted = plotSeries(this.data, Number(this.interval.value), this.average.checked);
    const { samples, interval, averaged } = this.plotted, valid = samples.filter(s => Number.isFinite(s.value));
    this.summary.textContent = `${valid.length}点 · ${Number((interval / 3600).toFixed(2))}時間 · ${averaged ? '区間平均（端は部分区間）' : '瞬間値（終了点を含む）'}${interval > Number(this.interval.value) ? ' · 保持間隔に制限' : ''}`;
    this.canvas.dataset.interval = String(interval); this.canvas.dataset.averaged = String(averaged);
    this.end = samples.at(-1).time; this.start = Math.max(0, this.end - 48 * 3600);
    const min = valid.length ? Math.min(...valid.map(s => s.value)) : 0, max = valid.length ? Math.max(...valid.map(s => s.value)) : 1;
    const pad = Math.max((max - min || Math.max(1, Math.abs(max)) * .02) * .1, .0001), lo = min - pad, hi = max + pad;
    const x = t => 64 + (t - this.start) / (this.end - this.start || 1) * (w - 84), y = v => bottom - (v - lo) / (hi - lo) * (bottom - 10);
    ctx.font = '11px system-ui'; ctx.fillStyle = '#425b60'; ctx.strokeStyle = '#d5e1df';
    const digits = Math.max(0, Math.min(8, Math.ceil(-Math.log10((hi - lo) / 4))));
    for (let i = 0; i <= 3; i++) { const v = lo + (hi - lo) * i / 3, label = v.toFixed(digits); ctx.beginPath(); ctx.moveTo(60, y(v)); ctx.lineTo(w - 20, y(v)); ctx.stroke(); ctx.fillText(label.length > 9 ? v.toExponential(2) : label, 2, y(v) + 4); }
    const ticks = Math.max(2, Math.min(6, Math.floor((w - 84) / 65))), spanHours = (this.end - this.start) / 3600;
    const precision = Math.max(0, Math.min(5, Math.ceil(-Math.log10(spanHours / ticks || 1)) + 1));
    ctx.textAlign = 'center';
    for (let i = 0; i <= ticks; i++) {
      const time = this.start + (this.end - this.start) * i / ticks;
      ctx.beginPath(); ctx.moveTo(x(time), bottom); ctx.lineTo(x(time), bottom + 5); ctx.stroke();
      ctx.fillText(Number((time / 3600).toFixed(precision)).toString(), x(time), h - 27);
    }
    ctx.fillText('計算経過時間 (h)', (64 + w - 20) / 2, h - 7); ctx.textAlign = 'left';
    if (!valid.length) { ctx.fillText('指定位置のデータはありません', 70, 58, Math.max(1, w - 95)); return; }
    ctx.strokeStyle = '#147d70'; ctx.lineWidth = 2; ctx.beginPath(); let active = false;
    for (const s of samples) { if (s.value === null) { active = false; continue; } if (active) ctx.lineTo(x(s.time), y(s.value)); else ctx.moveTo(x(s.time), y(s.value)); active = true; } ctx.stroke();
    ctx.fillStyle = '#147d70'; for (const s of valid) { ctx.beginPath(); ctx.arc(x(s.time), y(s.value), 2.5, 0, 2 * Math.PI); ctx.fill(); }
    this.canvas.dataset.points = String(valid.length);
  }
}
