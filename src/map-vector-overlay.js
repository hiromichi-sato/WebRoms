import * as THREE from '../vendor/three/three.module.js';

export function prepareGpuMapOverlay(view) {
  const active=view.mode==='map'&&(view.coastlineMesh||view.showN03Land&&view.landOverlayMesh);
  if(active&&view.renderer&&!view.mapVectorRenderer&&!view.mapVectorFailed){
    try {
      const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
      renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0,0);
      renderer.domElement.className='map-vector-overlay';renderer.domElement.setAttribute('aria-hidden','true');
      renderer.domElement.style.cssText='position:absolute;pointer-events:none;z-index:1;';
      view.canvas.parentElement.append(renderer.domElement);
      view.mapVectorRenderer=renderer;view.mapVectorScene=new THREE.Scene();
      const camera=new THREE.OrthographicCamera(-5,5,5,-5,.1,100);
      camera.position.set(0,10,0);camera.up.set(0,0,-1);camera.lookAt(0,0,0);view.mapVectorCamera=camera;
    }catch{view.mapVectorFailed=true;}
  }
  view.gpuMapOverlays=Boolean(active&&view.mapVectorRenderer);
  if(view.mapVectorRenderer)view.mapVectorRenderer.domElement.hidden=!view.gpuMapOverlays;
}

export function drawGpuMapOverlay(view) {
  if(!view.gpuMapOverlays)return false;
  const renderer=view.mapVectorRenderer,scene=view.mapVectorScene,camera=view.mapVectorCamera;
  const coast=view.coastlineMesh,land=view.showN03Land?view.landOverlayMesh:null;
  if(view.mapVectorCoast!==coast||view.mapVectorLand!==land){
    scene.clear();
    // Share the exact buffers/materials used by 3D. Their lifetime belongs to the main view.
    if(coast){const lines=new THREE.LineSegments(coast.geometry,coast.material);lines.renderOrder=5;scene.add(lines);}
    if(land){const mesh=new THREE.Mesh(land.geometry,land.material);mesh.renderOrder=100000;scene.add(mesh);}
    view.mapVectorCoast=coast;view.mapVectorLand=land;
  }
  const canvas=view.canvas,box=canvas.getBoundingClientRect(),parent=canvas.parentElement,p=parent.getBoundingClientRect();
  const width=box.width,height=box.height;
  if(width<=0||height<=0)return true;
  const size=renderer.getSize(new THREE.Vector2());if(size.x!==width||size.y!==height)renderer.setSize(width,height);
  renderer.domElement.style.left=box.left-p.left+parent.scrollLeft+'px';renderer.domElement.style.top=box.top-p.top+parent.scrollTop+'px';
  const {x,y,width:rw,height:rh}=view.rect,{width:ww,height:wh}=view.vectorLayout;
  camera.left=(-x/rw-.5)*ww;camera.right=((width-x)/rw-.5)*ww;
  camera.top=(.5+y/rh)*wh;camera.bottom=(.5-(height-y)/rh)*wh;camera.updateProjectionMatrix();
  renderer.render(scene,camera);
  canvas.dataset.mapOverlayBackend='webgl';
  return true;
}
