import { sampleDepth } from './result-sampling.js';
import { fieldValue } from './view-section.js';

export const RECENT_SECONDS = 48 * 3600;
export class RecentSeries {
  constructor(initial, dt, budget = 64 * 1048576) {
    this.bytesPerRecord = Object.values(initial).reduce((n, a) => n + (ArrayBuffer.isView(a) ? a.length : Object.values(a).reduce((s, v) => s + v.length, 0)) * 4, 0);
    this.capacity = Math.min(99, Math.floor(budget / this.bytesPerRecord));
    if (this.capacity < 3) throw new Error('時系列表示用メモリが不足しています。');
    this.interval = Math.ceil(Math.max(1800, RECENT_SECONDS / (this.capacity - 2)) / dt) * dt;
    this.records = []; this.next = 0;
  }
  due(time) { return time >= this.next - 1e-7; }
  add(time, state) {
    const copy = a => Float32Array.from(a);
    const packed = Object.fromEntries(Object.entries(state).map(([k, a]) => [k, ArrayBuffer.isView(a) ? copy(a) : Object.fromEntries(Object.entries(a).map(([key, v]) => [key, copy(v)]))]));
    if (this.records.at(-1)?.time === time) this.records.pop();
    this.records.push({ time, state: packed });
    this.next = time + this.interval;
    while (this.records.length > this.capacity || this.records[0].time < time - RECENT_SECONDS) this.records.shift();
  }
  query(base, current, time, { cell, field, layer, depth }) {
    if (!Number.isInteger(cell) || !base.mask[cell] || cell < 0 || cell >= base.mask.length) throw new Error('海のセルを選択してください。');
    if (!Number.isInteger(layer) || layer < 0 || layer >= base.nz || depth !== null && (!Number.isFinite(depth) || depth < 0)) throw new Error('層・深度が不正です。');
    if (!['h', 'zeta', 'temp', 'salt', 'u', 'v', ...Object.keys(current.biology ?? {})].includes(field)) throw new Error('時系列の変数が不正です。');
    const records = this.records.filter(r => r.time >= time - RECENT_SECONDS && r.time < time);
    records.push({ time, state: current });
    return { interval: this.interval, window: RECENT_SECONDS, samples: records.map(r => {
      const f = { ...base, ...r.state };
      const value = depth === null || ['h', 'zeta'].includes(field) ? fieldValue(f, field, cell, layer) : sampleDepth(f, field, cell, depth);
      return { time: r.time, value: Number.isFinite(value) ? value : null };
    }) };
  }
}
