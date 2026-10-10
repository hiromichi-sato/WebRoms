import { vectorRatio, vectorSpeedAtRatio } from './result-sampling.js';

export class ResultControls {
  constructor(toolbar, redraw) {
    this.root = document.createElement('div');
    this.root.className = 'result-controls'; this.root.hidden = true;
    this.root.innerHTML = `<label>表示位置 <select id="resultLevelMode"><option value="layer">層別</option><option value="depth">深度別</option></select></label>
      <div id="resultDepthControl" hidden>海面下 <input id="resultDepth" type="range" min="0" max="100" step="any" value="0" aria-label="表示深度"><input id="resultDepthNumber" type="number" min="0" max="100" step="any" value="0" aria-label="表示深度（数値）"><span>m</span><output id="resultDepthValue" hidden>0 m</output></div>
      <label id="vectorScaleControl" hidden>矢印 <select id="vectorScale"><option value="log">対数</option><option value="linear">線形</option></select></label>
      <canvas id="vectorLegend" width="300" height="46" aria-label="流速ベクトルの長さの凡例" hidden></canvas>`;
    toolbar.after(this.root);
    this.mode = this.root.querySelector('#resultLevelMode'); this.depth = this.root.querySelector('#resultDepth');
    this.depthNumber = this.root.querySelector('#resultDepthNumber');
    this.scale = this.root.querySelector('#vectorScale'); this.legend = this.root.querySelector('#vectorLegend');
    this.mode.onchange = this.scale.onchange = this.depth.oninput = redraw;
    this.depthNumber.oninput = () => {
      if (!this.depthNumber.validity.valid || this.depthNumber.value === '') return;
      this.depth.value = this.depthNumber.value;
      this.editingNumber = true;
      try { redraw(); } finally { this.editingNumber = false; }
    };
    this.depthNumber.onchange = () => {
      const value = this.depthNumber.valueAsNumber;
      this.depth.value = Number.isFinite(value) ? Math.max(0, Math.min(Number(this.depth.max), value)) : this.depth.value;
      redraw();
    };
  }
  update(active, fields, vectors, volumetric) {
    this.root.hidden = !active;
    this.mode.disabled = !volumetric;
    const maximum = fields.h.reduce((max, h, p) => Math.max(max, fields.mask[p] ? h + (fields.zeta?.[p] ?? 0) : 0), 0);
    this.depth.max = maximum; this.depth.value = Math.min(maximum, Number(this.depth.value));
    // Range inputs can round the decimal maximum upward when serializing it.
    const depth = Math.min(maximum, Number(this.depth.value));
    this.depthNumber.max = maximum;
    if (!this.editingNumber) this.depthNumber.value = depth;
    this.root.querySelector('#resultDepthControl').hidden = !volumetric || this.mode.value !== 'depth';
    this.root.querySelector('#resultDepthValue').textContent = `${depth} m`;
    this.root.querySelector('#vectorScaleControl').hidden = !vectors;
    this.legend.hidden = !vectors;
    return active && volumetric && this.mode.value === 'depth' ? depth : null;
  }
  drawLegend(maximum, referencePixels = 64, mode = 'map') {
    if (this.root.hidden || this.legend.hidden) return;
    const ctx = this.legend.getContext('2d'); ctx.clearRect(0, 0, 300, 46);
    const pixels = Math.max(0, referencePixels) * 300 / (this.legend.getBoundingClientRect().width || 300);
    const referenceSpeed = vectorSpeedAtRatio(pixels > 0 ? Math.min(1, 64 / pixels) : 0, maximum, this.scale.value);
    this.legend.dataset.referencePixels = String(referencePixels);
    this.legend.dataset.referenceSpeed = String(referenceSpeed);
    ctx.fillStyle = ctx.strokeStyle = '#173f37'; ctx.font = '10px system-ui'; ctx.lineWidth = 1.5;
    if (!(maximum > 0)) { ctx.fillText('流速 0 m/s', 8, 26); this.legend.setAttribute('aria-label', '流速 0 m/s'); return; }
    const labels = [];
    for (let i = 0; i < 3; i++) {
      const speed = referenceSpeed * [0.01, 0.1, 1][i], length = pixels * vectorRatio(speed, maximum, this.scale.value), x = i * 100 + 5;
      ctx.beginPath(); ctx.moveTo(x, 12); ctx.lineTo(x + length, 12); ctx.stroke();
      const head = Math.min(6, length * .24);
      ctx.beginPath(); ctx.moveTo(x + length, 12); ctx.lineTo(x + length - head, 12 - head * .5); ctx.lineTo(x + length - head, 12 + head * .5); ctx.fill();
      const label = `${Number(speed.toPrecision(3))} m/s`; labels.push(label);
      ctx.fillText(label, x, 34, 92);
    }
    const basis = mode === '3d' ? '3D視点中心の画面横向き水平ベクトル基準' : '平面表示の矢印と同じ縮尺';
    this.legend.setAttribute('aria-label', `${basis}: ${labels.join('、')}`);
    this.legend.title = basis + '\n' + (this.scale.value === 'log' ? '長さ比 = ln(1 + 100 × 速さ / 最大速さ) / ln(101)' : '長さ比 = 速さ / 最大速さ');
  }
}
