const open=boundary=>['specified','open','radiation'].includes(boundary.mode);
const pairs=[['west',0,'south',0],['east',0,'south',-1],['west',-1,'north',0],['east',-1,'north',-1]];

// Work on resolved copies only; keep user inputs and undo history unchanged.
export function smoothBoundaryCorners(boundaries,fields) {
  const keys=['zeta','ubar','vbar','temp','salt','u','v',...Object.keys(fields.biology??{})];
  for(const key of keys){
    const isU=['u','ubar'].includes(key),isV=['v','vbar'].includes(key);
    const width=fields.nx-(isU?1:0),height=fields.ny-(isV?1:0);
    const mask=isU?fields.maskU:isV?fields.maskV:fields.mask;
    const levels=['zeta','ubar','vbar'].includes(key)?1:fields.nz,original=new Map();
    const length=side=>['west','east'].includes(side)?height:width;
    const wet=(side,q)=>Boolean(mask[side==='west'?q*width:side==='east'?q*width+width-1:side==='south'?q:(height-1)*width+q]);
    const values=(side,k)=>{
      const id=side+':'+k;
      if(!original.has(id)){
        const b=boundaries[side];
        original.set(id,Array.from({length:length(side)},(_,q)=>b.painted?.[key]?.[k]?.[q]??(levels===1&&['zeta','ubar','vbar'].includes(key)?b[key]:b.layers[k][key])??0));
      }return original.get(id);
    };
    for(const [a,endA,b,endB] of pairs){
      if(!open(boundaries[a])||!open(boundaries[b]))continue;
      const qa=endA===0?0:length(a)-1,qb=endB===0?0:length(b)-1;
      if(!wet(a,qa)||!wet(b,qb))continue;
      for(let k=0;k<levels;k++){
        const va=values(a,k)[qa],vb=values(b,k)[qb],target=(va+vb)/2;
        if(!Number.isFinite(target))throw new Error('境界接続部の値が不正です: '+key);
        for(const [side,end,q0,value] of [[a,endA,qa,va],[b,endB,qb,vb]]){
          if(value===target)continue;
          const span=Math.min(3,Math.floor((length(side)-1)/2)),b=boundaries[side];
          b.painted??={};b.painted[key]??=Array.from({length:levels},()=>({}));b.painted[key][k]??={};
          for(let d=0;d<span;d++){
            const q=q0+(end===0?d:-d);if(!wet(side,q))break;
            const t=1-d/span,weight=t*t*(3-2*t);
            b.painted[key][k][q]=values(side,k)[q]+(target-value)*weight;
          }
        }
      }
    }
  }
  return boundaries;
}

export function smoothTidalCorners(boundaries,fields,value) {
  const {nx,ny,mask}=fields,rows=new Map();
  const cell=(side,q)=>side==='west'?q*nx:side==='east'?q*nx+nx-1:side==='south'?q:(ny-1)*nx+q;
  const length=side=>['west','east'].includes(side)?ny:nx;
  for(const [a,endA,b,endB] of pairs){
    if(!open(boundaries[a])||!open(boundaries[b]))continue;
    const qa=endA===0?0:length(a)-1,qb=endB===0?0:length(b)-1,c=cell(a,qa);
    const a1=cell(a,qa+(endA===0?1:-1)),b1=cell(b,qb+(endB===0?1:-1));
    if(!mask[c]||!mask[a1]||!mask[b1])continue;
    const target=[[c,.5],[a1,.25],[b1,.25]];rows.set(c,target);
    for(const [side,end,q0] of [[a,endA,qa],[b,endB,qb]]){
      let span=Math.min(3,Math.floor((length(side)-1)/2));
      for(let d=1;d<=span;d++)if(!mask[cell(side,q0+(end===0?d:-d))]){span=d-1;break;}
      for(let d=1;d<span;d++){
        const q=cell(side,q0+(end===0?d:-d)),far=cell(side,q0+(end===0?span:-span));
        const t=1-d/span,w=t*t*(3-2*t);
        rows.set(q,[[q,1-w],[far,w*(1-t)],...target.map(([p,v])=>[p,w*t*v])]);
      }
    }
  }
  // Apply identical linear weights to the complete waveforms: phase cancellation
  // is preserved, equivalent to weighting the real/imaginary harmonic components.
  return (cell,time)=>rows.has(cell)?rows.get(cell).reduce((sum,[p,w])=>sum+w*value(p,time),0):value(cell,time);
}
