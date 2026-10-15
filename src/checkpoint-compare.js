export function checkCheckpoint(before,after) {
  for(const key of Object.keys(before)) {
    if(key==='biology'){checkCheckpoint(before[key],after[key]);continue;}
    const tolerance=(key==='zeta'||key==='z_r') ? .01 : null;
    if(!after[key]||before[key].length!==after[key].length)throw new Error(`07終了場の読み込みが一致しません：${key}（配列サイズ）`);
    let maximum=0,cell=0,failed=false;
    before[key].forEach((value,i)=>{
      const difference=Math.abs(value-after[key][i]);
      if(!Number.isFinite(value)||!Number.isFinite(after[key][i]))failed=true;
      if(difference>maximum){maximum=difference;cell=i;}
      if(difference>(tolerance??1e-9*Math.max(1,Math.abs(value))))failed=true;
    });
    if(failed)throw new Error(`07終了場の読み込みが一致しません：${key}（最大差 ${maximum.toExponential(3)}${tolerance?' m、許容差 0.01 m':''}、配列位置 ${cell}）`);
  }
}
