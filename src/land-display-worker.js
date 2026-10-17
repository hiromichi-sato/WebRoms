import {loadN03DisplayTiles} from './n03-display-tiles.js';
import {landOverlayTriangles} from './land-vector-overlay.js';
import {coastSegmentsForGroups} from './coastline-overlay.js';
import {subsetLandDisplay} from './land-display-subset.js';

self.onmessage=async({data})=>{
  const {bounds,source}=data;
  try {
    if(source){const result=subsetLandDisplay(source,bounds);self.postMessage(result,[result.triangles.buffer]);return;}
    self.postMessage({progress:'N03陸域を読み込み中…'});
    const dataset=await loadN03DisplayTiles(bounds);
    self.postMessage({progress:'N03陸域を切り取り中…'});
    const triangles=landOverlayTriangles(dataset.groups,bounds);
    const segments=coastSegmentsForGroups(dataset.groups,bounds);
    self.postMessage({triangles,segments,tiles:dataset.tiles,bytes:dataset.bytes},[triangles.buffer]);
  }catch(error){self.postMessage({error:error.message});}
};
