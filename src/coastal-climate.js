// Four nearest source profiles by water-only path distance on the model grid.
export function coastalProfileNeighbors(rows, grid, mask, bounds, barriers=new Map(),{extrapolate=false}={}) {
  const {nx,ny,dx,dy}=grid, labels=Array.from(mask,()=>[]),heap=[];
  const push=item=>{heap.push(item);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p].distance<=item.distance)break;heap[i]=heap[p];i=p;}heap[i]=item;};
  const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].distance<heap[c].distance)c++;if(heap[c].distance>=last.distance)break;heap[i]=heap[c];i=c;}heap[i]=last;}return first;};
  const seeded=new Set();
  for(let source=0;source<rows.length;source++) {
    const [lat,lon,...values]=rows[source];if(!values.some(Number.isFinite))continue;
    const x=(lon-bounds.west)/(bounds.east-bounds.west)*(nx-1),y=(lat-bounds.south)/(bounds.north-bounds.south)*(ny-1);
    const i=Math.max(0,Math.min(nx-1,Math.round(x))),j=Math.max(0,Math.min(ny-1,Math.round(y))),cell=j*nx+i;
    if(mask[cell]){push({cell,source,distance:Math.hypot((x-i)*dx,(y-j)*dy)});seeded.add(cell);}
  }
  if(extrapolate) {
    const seen=new Uint8Array(mask.length);
    for(let start=0;start<mask.length;start++) {
      if(!mask[start]||seen[start])continue;
      const cells=[start];seen[start]=1;
      for(let at=0;at<cells.length;at++) {
        const p=cells[at],x=p%nx,y=Math.floor(p/nx);
        for(const q of [x>0?p-1:-1,x<nx-1?p+1:-1,y>0?p-nx:-1,y<ny-1?p+nx:-1])if(q>=0&&mask[q]&&!seen[q]){seen[q]=1;cells.push(q);}
      }
      if(cells.some(p=>seeded.has(p)))continue;
      const candidates=[];
      for(let source=0;source<rows.length;source++) {
        const [lat,lon,...values]=rows[source];if(!values.some(Number.isFinite))continue;
        const x=(lon-bounds.west)/(bounds.east-bounds.west)*(nx-1),y=(lat-bounds.south)/(bounds.north-bounds.south)*(ny-1);
        let cell=-1,distance=Infinity;
        for(const p of cells){const d=Math.hypot((x-p%nx)*dx,(y-Math.floor(p/nx))*dy);if(d<distance){cell=p;distance=d;}}
        candidates.push({cell,source,distance,extrapolated:true});
      }
      candidates.sort((a,b)=>a.distance-b.distance);
      for(const candidate of candidates.slice(0,4))push(candidate);
    }
  }
  while(heap.length) {
    const item=pop(),{cell,source,distance}=item,list=labels[cell];
    if(list.length>=4||list.some(entry=>entry.source===source))continue;
    list.push({source,distance,row:rows[source],extrapolated:!!item.extrapolated});
    const x=cell%nx,y=Math.floor(cell/nx);
    for(const [next,step] of [[x>0?cell-1:-1,dx],[x<nx-1?cell+1:-1,dx],[y>0?cell-nx:-1,dy],[y<ny-1?cell+nx:-1,dy]])
      if(next>=0&&mask[next]&&labels[next].length<4)push({cell:next,source,extrapolated:item.extrapolated,distance:distance+step*(barriers.get(`${Math.min(cell,next)}:${Math.max(cell,next)}`)??1)});
  }
  return labels.map(list=>list.map(entry=>({...entry,distance:entry.distance**2})));
}
