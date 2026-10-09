import { vectorRatio } from './result-sampling.js';

export class ResultControls {
  constructor(toolbar, redraw) {
    this.root = document.createElement('div');
    this.root.className = 'result-controls'; this.root.hidden = true;
    this.root.innerHTML = `<label>表示位置 <select id="resultLevelMode"><option value="layer">層別</option><option value="depth">深度別</option></select></label>
      <label id="resultDepthControl" hidden>海面下 <input id="resultDepth" type="range" min="0" max="100" step="0.1" value="0" aria-label="表示深度"><output id="resultDepthValue">0 m</output></label>
      <label id="vectorScaleControl" hidden>矢印 <select id="vectorScale"><option value="log">対数</option><option value="linear">線形</option></select></label>
      <canvas id="vectorLegend" width="300" height="46" aria-label="流速ベクトルの長さの凡例" hidden></canvas>`;
    toolbar.after(this.root);
    this.mode = this.root.querySelector('#resultLevelMode'); this.depth = this.root.querySelector('#resultDepth');
    this.scale = this.root.querySelector('#vectorScale'); this.legend = this.root.querySelector('#vectorLegend');
    this.mode.onchange = this.scale.onchange = this.depth.oninput = redraw;
  }
  update(active, fields, vectors, volumetric) {
    this.root.hidden = !active;
    this.mode.disabled = !volumetric;
    const maximum = fields.h.reduce((max, h, p) => Math.max(max, fields.mask[p] ? h + (fields.zeta?.[p] ?? 0) : 0), 0);
    this.depth.max = maximum; this.depth.value = Math.min(maximum, Number(this.depth.value));
    this.root.querySelector('#resultDepthControl').hidden = !volumetric || this.mode.value !== 'depth';
    this.root.querySelector('#resultDepthValue').textContent = `${Number(this.depth.value)} m`;
    this.root.querySelector('#vectorScaleControl').hidden = !vectors;
    this.legend.hidden = !vectors;
    return active && volumetric && this.mode.value === 'depth' ? Number(this.depth.value) : null;
  }
  drawLegend(maximum) {
    const ctx = this.legend.getContext('2d'); ctx.clearRect(0, 0, 300, 46);
    ctx.fillStyle = ctx.strokeStyle = '#173f37'; ctx.font = '10px system-ui'; ctx.lineWidth = 1.5;
    if (!(maximum > 0)) { ctx.fillText('流速 0 m/s', 8, 26); return; }
    for (let i = 0; i < 3; i++) {
      const speed = maximum * [0.01, 0.1, 1][i], length = 64 * vectorRatio(speed, maximum, this.scale.value), x = i * 100 + 5;
      ctx.beginPath(); ctx.moveTo(x, 12); ctx.lineTo(x + length, 12); ctx.stroke();
      const head = Math.min(6, length * .24);
      ctx.beginPath(); ctx.moveTo(x + length, 12); ctx.lineTo(x + length - head, 12 - head * .5); ctx.lineTo(x + length - head, 12 + head * .5); ctx.fill();
      ctx.fillText(`${Number(speed.toPrecision(3))} m/s`, x, 34);
    }
    this.legend.title = this.scale.value === 'log' ? '長さ比 = ln(1 + 100 × 速さ / 最大速さ) / ln(101)' : '長さ比 = 速さ / 最大速さ';
  }
}
