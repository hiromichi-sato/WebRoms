// Experimental local two-population split, not a full CCAIM implementation.
export function histogramFront(values) {
  const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b),n=sorted.length;
  if(n<8)return null;
  const mean=sorted.reduce((a,b)=>a+b,0)/n,total=sorted.reduce((sum,v)=>sum+(v-mean)**2,0);
  if(total<1e-12)return null;
  let sum=0,best=null;
  for(let i=0;i<n-1;i++) {
    sum+=sorted[i];const left=i+1,right=n-left;
    if(left<3||right<3||sorted[i]===sorted[i+1])continue;
    const a=sum/left,b=(mean*n-sum)/right,separation=left*right/n*(a-b)**2/total;
    if(!best||separation>best.separation)best={threshold:(sorted[i]+sorted[i+1])/2,separation,
      confidence:Math.min(1,n/16)*Math.min(1,Math.min(left,right)/5)*Math.max(0,Math.min(1,(separation-.85)/.15))};
  }
  return best?.confidence>0?best:null;
}

export function frontBarriers(rows,level,grid,mask,bounds,neighbors) {
  const lats=[...new Set(rows.map(r=>r[0]))].sort((a,b)=>a-b),lons=[...new Set(rows.map(r=>r[1]))].sort((a,b)=>a-b);
  const latitude=new Map(lats.map((v,i)=>[v,i])),longitude=new Map(lons.map((v,i)=>[v,i]));
  const points=new Map(rows.map((row,i)=>[`${latitude.get(row[0])}:${longitude.get(row[1])}`,i]));
  const wetSource=new Set(neighbors.flatMap(list=>list.map(v=>v.source)));
  const fronts=rows.map((row,index)=>{
    if(!wetSource.has(index)||!Number.isFinite(row[level+2]))return null;
    const y=latitude.get(row[0]),x=longitude.get(row[1]),values=[];
    for(let j=y-2;j<=y+2;j++)for(let i=x-2;i<=x+2;i++) {
      const source=points.get(`${j}:${i}`);if(wetSource.has(source))values.push(rows[source][level+2]);
    }
    return histogramFront(values);
  });
  const barriers=new Map(),lines=[];
  for(let p=0;p<mask.length;p++) {
    if(!mask[p])continue;
    for(const q of [p%grid.nx<grid.nx-1?p+1:-1,p+grid.nx<mask.length?p+grid.nx:-1]) {
      if(q<0||!mask[q])continue;
      const a=neighbors[p]?.[0],b=neighbors[q]?.[0];if(!a||!b||a.source===b.source)continue;
      const va=rows[a.source][level+2],vb=rows[b.source][level+2];if(!Number.isFinite(va)||!Number.isFinite(vb))continue;
      const confidence=Math.max(...[fronts[a.source],fronts[b.source]].map(f=>f&&(va<f.threshold)!==(vb<f.threshold)?f.confidence:0));
      if(confidence<=0)continue;
      barriers.set(`${p}:${q}`,1+9*confidence);
      const x=p%grid.nx,y=Math.floor(p/grid.nx);
      // Segments lie on cell interfaces, perpendicular to the penalized edge.
      lines.push(q===p+1?{x0:x+.5,y0:y-.5,x1:x+.5,y1:y+.5,confidence}:{x0:x-.5,y0:y+.5,x1:x+.5,y1:y+.5,confidence});
    }
  }
  return {barriers,lines};
}
