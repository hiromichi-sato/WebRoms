import { prepareForcing, forcingEnd } from './ocean-boundary.js';
import { TIDAL_DAY } from './tide-analysis.js';

export function particleForcing(config, fields, start, duration,initialState) {
  const original = prepareForcing(config, fields, start);
  if (!original) return { forcing: null, metadata: { mode: 'none', start, period: 0 } };
  const period = TIDAL_DAY;
  if (start + period > forcingEnd(config)) throw new Error('固定する潮汐１周期（約24.84時間）のデータが開始時点以降に必要です。');
  const intervals = Math.ceil(period / 1800), cycleTimes = Array.from({ length: intervals + 1 }, (_, i) => i * period / intervals);
  // Match ROMS's linear interpolation of the original NetCDF samples during replay.
  const nativeAt = (cell, t) => {
    let lo = 0, hi = original.times.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (original.times[mid] <= t) lo = mid; else hi = mid; }
    const f = (t - original.times[lo]) / (original.times[hi] - original.times[lo]);
    return original.value(cell, original.times[lo]) * (1 - f) + original.value(cell, original.times[hi]) * f;
  };
  const cycles = new Map();
  // Remove the end-to-start drift so the repeated waveform remains continuous.
  const cycle = cell => {
    if (!cycles.has(cell)) {
      const first = nativeAt(cell, start), drift = nativeAt(cell, start + period) - first;
      cycles.set(cell, cycleTimes.map(t => nativeAt(cell, start + t) - drift * t / period));
    }
    return cycles.get(cell);
  };
  const end = start + duration + 2 * config.numerics.dt;
  const times = original.times.filter(t => t < start); times.push(start);
  for (let offset = 0; start + offset < end; offset += period) {
    for (const t of cycleTimes.slice(1)) if (start + offset + t < end) times.push(start + offset + t);
  }
  times.push(end);
  const transitionSeconds=initialState?.zeta?6*3600:0;
  if(transitionSeconds) {
    for(let t=start+1800;t<Math.min(end,start+transitionSeconds);t+=1800)times.push(t);
    times.sort((a,b)=>a-b);
    for(let i=times.length-1;i>0;i--)if(times[i]-times[i-1]<1e-7)times.splice(i,1);
  }
  if (times.length > 20000) throw new Error('粒子実験の境界時系列が長すぎます。');
  const value = (cell, t) => {
    if (t < start||t===start&&!transitionSeconds) return nativeAt(cell, t);
    const phase = ((t - start) % period) / period * intervals, i = Math.floor(phase), f = phase - i, values = cycle(cell);
    let result=values[i] * (1 - f) + values[i + 1] * f;
    if(transitionSeconds&&t<start+transitionSeconds&&Number.isFinite(initialState.zeta[cell])) {
      const x=cell%config.grid.nx,y=Math.floor(cell/config.grid.nx),baselines=[];
      for(const [side,edge,along] of [['west',x===0,y],['east',x===config.grid.nx-1,y],['south',y===0,x],['north',y===config.grid.ny-1,x]]) {
        const b=config.boundary[side];if(edge&&!['closed','periodic'].includes(b.mode))baselines.push(config.ocean?.seaLevelEnabled===false?0:b.fromInitial?fields.zeta[cell]:b.painted?.zeta?.[0]?.[along]??b.zeta??0);
      }
      const baseline=baselines.length?baselines.reduce((a,b)=>a+b,0)/baselines.length:0;
      const fraction=Math.max(0,Math.min(1,(t-start)/transitionSeconds)),weight=1-fraction*fraction*(3-2*fraction);
      result+=(initialState.zeta[cell]-baseline-nativeAt(cell,start))*weight;
    }
    return result;
  };
  const metadata = { mode: 'fixed-period', start, period, source: original.source, seam: 'linear end-to-start drift removed', includesCorrections: Boolean(config.ocean?.corrections?.length) };
  if(transitionSeconds)metadata.transition={seconds:transitionSeconds,method:'Boundary surface height matched to 07 final state; initial offset decays with smoothstep, then fixed tidal-day waveform repeats. Corner baseline uses adjacent-side mean.'};
  return { forcing: { times, value, source: `${original.source}; fixed repeating tidal-day waveform` }, metadata };
}
