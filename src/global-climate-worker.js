import { fetchGlobalClimate } from './global-climatology.js';
self.onmessage=async({data})=>{
  try { const profile=await fetchGlobalClimate(data.bounds,data.season,{variables:data.variables,progress:text=>self.postMessage({progress:text})});self.postMessage({profile}); }
  catch(error){self.postMessage({error:error.message});}
};
