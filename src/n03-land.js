const overlap = (a,b) => a.east >= b.west && a.west <= b.east && a.north >= b.south && a.south <= b.north;
export async function loadN03Land(bounds, fetcher = fetch) {
  if (!bounds || !overlap(bounds,{west:122,east:155,south:20,north:46})) return null;
  const base = new URL('../assets/coastlines/n03-2026/', import.meta.url);
  const response = await fetcher(new URL('index.json',base));
  if (!response.ok) throw new Error('N03陸域データの一覧を読み込めません。配布データを確認してください。');
  const manifest = await response.json(), polygons = new Map(), used = [];
  const region = { west:bounds.west-.03,east:bounds.east+.03,south:bounds.south-.03,north:bounds.north+.03 };
  for (const tile of manifest.tiles.filter(tile => overlap(tile.bounds,region))) {
    const response = await fetcher(new URL(tile.file,base));
    if (!response.ok) throw new Error('N03陸域データを読み込めません: ' + tile.file);
    const bytes = await response.arrayBuffer();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    if (hash !== tile.sha256) throw new Error('N03陸域データの整合性を確認できません: ' + tile.file);
    const data = JSON.parse(new TextDecoder().decode(bytes));
    for (const polygon of data.polygons) {
      const b = polygon.box;
      if (b[2]+.03>=region.west && b[0]-.03<=region.east && b[3]+.03>=region.south && b[1]-.03<=region.north) polygons.set(polygon.id,polygon);
    }
    used.push({file:tile.file,sha256:tile.sha256});
  }
  if (!used.length || !polygons.size) return null;
  return { polygons:[...polygons.values()], metadata:{ source:manifest.source,date:manifest.date,license:manifest.license,
    sourceUrl:manifest.sourceUrl,crs:manifest.crs,processing:manifest.processing,tiles:used } };
}

export function n03Classifier(dataset) {
  if (!dataset?.polygons?.length) return null;
  const rows = new Map();
  return (x,y) => {
    if (!rows.has(y)) {
      const intervals = [], coverage = [];
      for (const {box,rings} of dataset.polygons) {
        if (y < box[1]-.03 || y > box[3]+.03) continue;
        coverage.push([box[0]-.03,box[2]+.03]);
        if (y < box[1] || y > box[3]) continue;
        const crossings = [];
        for (const ring of rings) for (let i=0,j=ring.length-1;i<ring.length;j=i++) {
          const a=ring[j],b=ring[i];
          if ((a[1]>y)!==(b[1]>y)) crossings.push(a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]));
        }
        crossings.sort((a,b)=>a-b);
        for (let i=0;i+1<crossings.length;i+=2) intervals.push([crossings[i],crossings[i+1]]);
      }
      // Union intervals, so internal administrative borders never become coastlines.
      intervals.sort((a,b)=>a[0]-b[0]);
      const merged=[];
      for (const interval of intervals) {
        if (merged.length && interval[0]<=merged.at(-1)[1]+1e-9) merged.at(-1)[1]=Math.max(merged.at(-1)[1],interval[1]);
        else merged.push([...interval]);
      }
      rows.set(y,{merged,coverage});
    }
    const {merged,coverage}=rows.get(y);
    if (!coverage.some(([west,east])=>x>=west&&x<=east)) return null;
    return merged.some(([west,east])=>x>=west&&x<=east);
  };
}

export function needsEtopo(grid, fields, options, n03) {
  if(options.maskSource==='polygon' && options.etopo && fields.mask.some(value=>!value))return true;
  const classify = options.maskSource === 'etopo' ? n03Classifier(n03) : null;
  const bounds = grid.geoBounds;
  for(let p=0;p<grid.nx*grid.ny;p++) {
    let water=Boolean(fields.mask[p]);
    if(options.preservedMask?.[p]>=0)water=Boolean(options.preservedMask[p]);
    else if(options.maskSource==='etopo') {
      if(!bounds || !classify)return true;
      const lon=bounds.west+p%grid.nx/(grid.nx-1)*(bounds.east-bounds.west);
      const lat=bounds.south+Math.floor(p/grid.nx)/(grid.ny-1)*(bounds.north-bounds.south);
      let count=0;
      for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++) {
        const x=Math.max(bounds.west,Math.min(bounds.east,lon+i*(bounds.east-bounds.west)/(grid.nx-1)/3));
        const y=Math.max(bounds.south,Math.min(bounds.north,lat+j*(bounds.north-bounds.south)/(grid.ny-1)/3));
        const land=classify(x,y);
        if(land==null)return true;
        count+=land?1:0;
      }
      water=count/9<(options.threshold??.5);
    }
    if(!water || !options.etopo)continue;
    const depth=fields.mask[p] ? fields.h[p] : grid.coastline?.baseDepths?.[p] ?? grid.contourInterpolation?.interpolatedDepths?.[p] ?? grid.contourInterpolation?.inferredLandDepths?.[p] ?? 0;
    if(!(Number.isFinite(depth)&&depth>0))return true;
  }
  return false;
}
