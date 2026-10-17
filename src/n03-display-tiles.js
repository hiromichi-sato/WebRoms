const base=new URL('../assets/coastlines/n03-2026/display/',import.meta.url);

export function n03DisplayTileIds(bounds,subdivisions=4) {
  if(!bounds||![bounds.west,bounds.east,bounds.south,bounds.north].every(Number.isFinite)||bounds.west>=bounds.east||bounds.south>=bounds.north)return [];
  const west=Math.max(122,bounds.west),east=Math.min(155,bounds.east),south=Math.max(20,bounds.south),north=Math.min(46,bounds.north);
  const ids=[];
  for(let y=Math.floor(south*subdivisions);y<Math.ceil(north*subdivisions);y++)for(let x=Math.floor(west*subdivisions);x<Math.ceil(east*subdivisions);x++)ids.push(`${x}_${y}`);
  return ids;
}

export async function loadN03DisplayTiles(bounds,fetcher=fetch) {
  const ids=n03DisplayTileIds(bounds);
  if(!ids.length)return {groups:[],tiles:[],bytes:0};
  const response=await fetcher(new URL('index.json',base));
  if(!response.ok)throw new Error('N03表示用タイルの索引を読み込めません。');
  const index=await response.json();
  if(index.format!=='webroms-n03-display-v1'||index.subdivisions!==4)throw new Error('N03表示用タイルの形式が不正です。');
  const selected=ids.filter(id=>Object.hasOwn(index.tiles,id)),groups=[];
  let bytes=0;
  // Small bounded batches avoid serial file round-trips without fetching unrelated regions.
  for(let start=0;start<selected.length;start+=4){
    const batch=await Promise.all(selected.slice(start,start+4).map(async id=>{
      const tile=index.tiles[id],response=await fetcher(new URL(tile.file,base));
      if(!response.ok)throw new Error('N03表示用タイルを読み込めません: '+id);
      const payload=await response.arrayBuffer();bytes+=payload.byteLength;
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',payload)),b=>b.toString(16).padStart(2,'0')).join('');
      if(hash!==tile.sha256)throw new Error('N03表示用タイルの整合性を確認できません: '+id);
      const text=await new Response(new Blob([payload]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
      const [x,y]=id.split('_').map(Number),tileBounds={west:x/4,east:(x+1)/4,south:y/4,north:(y+1)/4};
      return JSON.parse(text).groups.filter(({box:b})=>b[2]>=bounds.west&&b[0]<=bounds.east&&b[3]>=bounds.south&&b[1]<=bounds.north).map(group=>({...group,tileBounds}));
    }));
    for(const entries of batch)groups.push(...entries);
  }
  return {groups,tiles:selected,bytes};
}
