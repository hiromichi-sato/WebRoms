import { withInterpolation } from './interpolation-status.js';

export function bindTerrainCrop({ view, group, blocked, activateMap, apply, notify }) {
  const button=document.createElement('button');button.id='cropTerrain';button.type='button';button.className='terrain-crop-button';
  button.title='元地形を保持して計算対象の範囲を指定';button.setAttribute('aria-label','領域を切り出す');button.setAttribute('aria-pressed','false');button.innerHTML='<i data-lucide="crop"></i><span>領域を切り出す</span>';group.append(button);
  const canvas=view.canvas, parent=canvas.parentElement;
  const overlay=document.createElement('canvas');overlay.id='terrainCropOverlay';overlay.className='terrain-crop-overlay';overlay.hidden=true;parent.append(overlay);
  const tools=document.createElement('div');tools.className='terrain-crop-actions';tools.hidden=true;
  const label=document.createElement('output');label.textContent='残す範囲を選択';
  const accept=document.createElement('button');accept.type='button';accept.id='applyTerrainCrop';accept.disabled=true;accept.innerHTML='<i data-lucide="check"></i>計算範囲を適用';
  const cancel=document.createElement('button');cancel.type='button';cancel.id='cancelTerrainCrop';cancel.innerHTML='<i data-lucide="x"></i>キャンセル';
  const zoomTools=document.createElement('div');zoomTools.className='terrain-crop-zoom';
  for(const [name,icon,action] of [['縮小','minus',()=>view.zoom(-1)],['拡大','plus',()=>view.zoom(1)],['全体表示','scan',()=>view.home()]]){
    const control=document.createElement('button');control.type='button';control.title=name;control.setAttribute('aria-label',name);control.innerHTML=`<i data-lucide="${icon}"></i>`;control.onclick=()=>{action();resize();};zoomTools.append(control);
  }
  tools.append(label,zoomTools,accept,cancel);parent.append(tools);
  let active=false, start=null, selection=null, transitioning=false,disposed=false,restoreView=null;
  const transition=async(action,description)=>{
    if(transitioning||disposed)return;
    transitioning=true;button.disabled=cancel.disabled=true;
    try {
      await withInterpolation(async()=>{
        if(disposed)return;
        await action();
        await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
      },{title:'処理中です…',description});
    }catch(error){notify(error.message);}
    finally{transitioning=false;button.disabled=cancel.disabled=false;}
  };
  const resize=()=>{
    if(active){parent.style.setProperty('--crop-header-height',tools.getBoundingClientRect().height+'px');view.resize();}
    const r=canvas.getBoundingClientRect(),p=parent.getBoundingClientRect();
    Object.assign(overlay.style,{left:r.left-p.left+parent.scrollLeft+'px',top:r.top-p.top+parent.scrollTop+'px',width:r.width+'px',height:r.height+'px'});
    overlay.width=Math.round(r.width*devicePixelRatio);overlay.height=Math.round(r.height*devicePixelRatio);paint();
  };
  const paint=()=>{
    const ctx=overlay.getContext('2d'),dpr=devicePixelRatio,r=view.rect;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,overlay.width/dpr,overlay.height/dpr);
    if(!r||!selection)return;
    const f=view.fields,s=selection,x=r.x+s.i0/f.nx*r.width,y=r.y+(f.ny-1-s.j1)/f.ny*r.height,w=(s.i1-s.i0+1)/f.nx*r.width,h=(s.j1-s.j0+1)/f.ny*r.height;
    ctx.fillStyle='#242d3b77';ctx.beginPath();ctx.rect(0,0,overlay.width/dpr,overlay.height/dpr);ctx.rect(x,y,w,h);ctx.fill('evenodd');
    ctx.fillStyle='#18b6a326';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#007b70';ctx.lineWidth=2;ctx.setLineDash([7,4]);ctx.strokeRect(x,y,w,h);
    overlay.dataset.selection=JSON.stringify(selection);
  };
  const reset=()=>{
    const expanded=parent.classList.contains('terrain-crop-expanded');
    active=false;start=null;selection=null;restoreView=null;button.setAttribute('aria-pressed','false');overlay.hidden=tools.hidden=true;delete overlay.dataset.selection;
    parent.classList.remove('terrain-crop-expanded');parent.style.removeProperty('--crop-header-height');document.body.classList.remove('terrain-cropping');
    if(expanded)view.resize();
  };
  const point=event=>{
    const box=overlay.getBoundingClientRect(),r=view.rect,f=view.fields,x=event.clientX-box.left,y=event.clientY-box.top;
    if(!r||!f)return null;
    return {i:Math.max(0,Math.min(f.nx-1,Math.floor((x-r.x)/r.width*f.nx))),j:Math.max(0,Math.min(f.ny-1,f.ny-1-Math.floor((y-r.y)/r.height*f.ny))),inside:x>=r.x&&x<=r.x+r.width&&y>=r.y&&y<=r.y+r.height};
  };
  const cancelSelection=()=>transition(()=>{const restore=restoreView;reset();restore?.();},'切り出しをキャンセルしています。');
  button.onclick=()=>{
    if(transitioning||blocked())return;
    if(active)return cancelSelection();
    return transition(async()=>{
      restoreView=await activateMap();if(disposed)return;
      active=true;selection=null;accept.disabled=true;label.textContent='残す範囲を選択';button.setAttribute('aria-pressed','true');overlay.hidden=tools.hidden=false;
      parent.classList.add('terrain-crop-expanded');document.body.classList.add('terrain-cropping');resize();
    },'切り出し画面を準備しています。');
  };
  overlay.onpointerdown=event=>{if(event.button!==0)return;const hit=point(event);if(!hit?.inside)return;event.preventDefault();start=hit;overlay.setPointerCapture(event.pointerId);selection={i0:hit.i,i1:hit.i,j0:hit.j,j1:hit.j};paint();};
  overlay.onpointermove=event=>{
    if(!start)return;const hit=point(event);if(!hit)return;
    selection={i0:Math.min(start.i,hit.i),i1:Math.max(start.i,hit.i),j0:Math.min(start.j,hit.j),j1:Math.max(start.j,hit.j)};
    const nx=selection.i1-selection.i0+1,ny=selection.j1-selection.j0+1;
    label.textContent=`残す範囲 ${nx} × ${ny} マス`+(nx<8||ny<8?'（各8マス以上）':'');accept.disabled=nx<8||ny<8;paint();
  };
  overlay.onpointerup=event=>{start=null;if(overlay.hasPointerCapture(event.pointerId))overlay.releasePointerCapture(event.pointerId);};
  overlay.onpointercancel=()=>{start=null;};cancel.onclick=cancelSelection;
  overlay.addEventListener('wheel',event=>{event.preventDefault();if(!start&&event.deltaY){view.zoom(event.deltaY<0?1:-1,event);paint();}},{passive:false});
  accept.onclick=async()=>{
    if(!selection||blocked())return;accept.disabled=true;
    try{if(await apply({...selection}))reset();}catch(error){notify(error.message);}finally{if(selection)accept.disabled=false;}
  };
  const escape=event=>{if(event.key==='Escape'&&active&&!transitioning){event.preventDefault();void cancelSelection();}};document.addEventListener('keydown',escape);
  const observer=new ResizeObserver(()=>{if(active)resize();});observer.observe(canvas);
  const checkMode=()=>{if(active&&canvas.hidden)reset();};const modes=new MutationObserver(checkMode);modes.observe(canvas,{attributes:true,attributeFilter:['hidden']});
  return ()=>{disposed=true;reset();observer.disconnect();modes.disconnect();document.removeEventListener('keydown',escape);overlay.remove();tools.remove();button.remove();};
}
