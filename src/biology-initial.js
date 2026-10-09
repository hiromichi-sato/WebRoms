import { CHLOROPHYLL } from './data/chlorophyll.js';
import { regionalClimate, sampleClimatology } from './climatology.js';
export { CHLOROPHYLL };

export function biologyProfile(config, key, k, depth) {
  const e = config.ecosystem, pattern = e.distribution;
  if (!pattern || pattern === 'manual') return e.initial[key];
  const z = depth * (1 - (k + .5) / config.grid.nz), winter = pattern === 'winter' || (pattern === 'climatology' && config.initial.regionalSeason === 'winter');
  const mixedDepth = winter ? 100 : 20;
  const attenuation = Math.exp(-Math.max(0, z - mixedDepth) / 40);
  if (pattern !== 'climatology') {
    const nutrient = /NO3_|NH4_|SiOH/.test(key);
    return e.initial[key] * (nutrient ? 1 + Math.max(0, z - mixedDepth) / Math.max(1, depth) * 3 : attenuation);
  }
  const region = regionalClimate(config, config.initial.regionalSeason ?? 'annual');
  const chl = CHLOROPHYLL.regions.find(r => r.id === region.region).chlorophyllMgM3;
  const p = chl * (e.carbonChl ?? 50) / (12.011 * 106 / 16) * attenuation;
  if (/NO3_|SiOH/.test(key)) {
    const climate = sampleClimatology(region.id, z, { outOfRange: 'clamp', nutrientUnits: 'mmol/m3' });
    return /SiOH/.test(key) ? climate.silicate : climate.nitrate;
  }
  const zTotal = p * (e.zooRatio ?? .5), d = p * (e.detritusRatio ?? .2);
  return ({ npzd_Phyt: p, npzd_Zoop: zTotal, npzd_SDet: d,
    nemuro_Sphy: p * .5, nemuro_Lphy: p * .5,
    nemuro_Szoo: zTotal / 3, nemuro_Lzoo: zTotal / 3, nemuro_Pzoo: zTotal / 3,
    nemuro_PON_: d, nemuro_DON_: d, nemuro_opal: d,
    nemuro_NH4_: e.initial[key] })[key] ?? e.initial[key];
}
