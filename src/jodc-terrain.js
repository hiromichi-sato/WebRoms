import { pointTerrain,setPointLandMask } from './contour-terrain.js';
export const JODC_TERRAIN_FILE=/\.(txt|dat|csv|asc|jegg|xyz|gz)$/i;
export function parseJegg500(text) {
  const features=[];let measured=0,interpolated=0;
  for(const [index,raw] of text.replace(/^\uFEFF/,'').split(/\r?\n/).entries()) {
    const line=raw.trim();if(!line||/^(#|\/\/)/.test(line))continue;
    if(/^(flag|classification|種別)[,\s]/i.test(line))continue;
    let tokens=line.split(/[,\s]+/);
    if(tokens.length!==4&&raw.length>=27)tokens=[raw.slice(0,1),raw.slice(1,11),raw.slice(11,21),raw.slice(21,27)].map(v=>v.trim());
    if(tokens.length!==4||tokens.some(v=>!v||!/^[-+]?\d+(\.\d+)?$/.test(v)))throw new Error(`J-EGG500 ${index+1}行目：種別・緯度・経度・水深の4項目を確認してください。`);
    const [flag,lat,lon,depth]=tokens.map(Number);
    if(![0,1].includes(flag)||lat< -90||lat>90||lon< -180||lon>180||depth<0||depth>10000)throw new Error(`J-EGG500 ${index+1}行目：種別は0/1、座標はWGS84の度、水深は0～10000 mです。`);
    if(flag===0)measured++;else interpolated++;
    features.push({depth,geometry:{type:'Point',coordinates:[lon,lat]}});
    if(features.length>500000)throw new Error('J-EGG500は合計50万点以下に分割してください。');
  }
  if(!features.length)throw new Error('J-EGG500の水深点がありません。');
  return {features,measured,interpolated};
}
export function jeggTerrain(texts,grid) {
  const features=[];let measured=0,interpolated=0;
  for(const {text} of texts){const parsed=parseJegg500(text);for(const feature of parsed.features)features.push(feature);measured+=parsed.measured;interpolated+=parsed.interpolated;if(features.length>500000)throw new Error('J-EGG500は合計50万点以下に分割してください。');}
  const clean={...grid};for(const key of ['coastline','terrainResampling','domainCrop','landMaskProvided','contourInterpolation'])delete clean[key];
  const result=pointTerrain(features,clean);setPointLandMask(result,false);
  result.geoSource='JODC JDOSS J-EGG500 (WGS84); point aggregation / discrete Laplace interpolation';
  result.jodcSource={product:'J-EGG500',sourceUrl:'https://www.jodc.go.jp/jodcweb/JDOSS/infoJEGG.html',files:texts.map(v=>v.name),measuredOrContourPoints:measured,sourceInterpolatedPoints:interpolated,landIncluded:false,depthDatum:'source datum; no automatic vertical datum conversion'};
  return result;
}
