// ROMS nonlinear EOS: rho_eos.F and mod_eoscoef.F (ROMS Group, MIT/X).
// Input temperature is model potential temperature; depth uses ROMS' pressure approximation.
export function seawaterDensity(salinity,temperature,depth=0) {
  if(![salinity,temperature,depth].every(Number.isFinite))return NaN;
  const t=Math.max(-2,temperature),s=Math.max(0,salinity),root=Math.sqrt(s),d=Math.max(0,depth);
  const rho0=999.842594+t*(.06793952+t*(-.009095290+t*(.0001001685+t*(-.000001120083+t*6.536332e-9))))
    +s*(.824493+t*(-.00408990+t*(.0000764380+t*(-.000000824670+t*5.38750e-9)))
    +root*(-.00572466+t*(.000102270-t*.00000165460))+s*.00048314);
  if(!d)return rho0;
  const a=19092.56+t*(209.8925+t*(-3.041638+t*(-.001852732-t*.00001361629)));
  const b=104.4077+t*(-6.500517+t*(.1553190+t*.0002326469));
  const c=-5.587545+t*(.7390729-t*.01909078);
  const e=.4721788+t*(.01028859+t*(-.0002512549-t*5.939910e-7));
  const f=-.01571896+t*(-.0002598241+t*.000007267926);
  const g=t*(.00001045941+t*(-5.782165e-10+t*1.296821e-7));
  const h=-2.595994e-7+t*(-1.248266e-9-t*3.508914e-9);
  const bulk=a+s*(b+root*c)+d*(e+s*(f+root*.002042967)+d*(g+s*h));
  return rho0*bulk/(bulk-.1*d);
}
