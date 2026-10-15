import createRoms from '../../runtime/roms.js';
import { writeNetcdf } from '../../src/netcdf.js';

export async function terrainGridFixture(bounds,n=16) {
  const runtime=await createRoms({print(){},printErr(){}});
  writeNetcdf(runtime,'grid.nc',{eta_rho:n,xi_rho:n},[
    {name:'h',dimensions:['eta_rho','xi_rho'],data:new Float64Array(n*n).fill(100)},
    {name:'lon_rho',dimensions:['eta_rho','xi_rho'],data:Float64Array.from({length:n*n},(_,p)=>bounds.west+p%n/(n-1)*(bounds.east-bounds.west))},
    {name:'lat_rho',dimensions:['eta_rho','xi_rho'],data:Float64Array.from({length:n*n},(_,p)=>bounds.south+Math.floor(p/n)/(n-1)*(bounds.north-bounds.south))}
  ],{type:'ROMS GRID file'});
  return Buffer.from(runtime.FS.readFile('grid.nc'));
}
