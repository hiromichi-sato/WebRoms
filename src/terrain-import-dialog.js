import { terrainFileStatus } from './terrain-file-status.js';
import { importTerrain } from './shape-io.js';
import { readGeographicNetcdf, resampleTerrain } from './geographic-io.js';
import { buildCoastline } from './terrain-builder.js';

export function bindTerrainImporter({ getConfig, blocked, commit, notify }) {
  const previous=document.getElementById('terrainImportDialog');
  if(previous?.open) previous.close(); previous?.remove();
  const button=document.getElementById('openTerrainImport'); if(!button) return;
  document.getElementById('terrainImportedFiles')?.remove();
  const source=getConfig().grid.jodcSource;
  if(source){const summary=document.createElement('div');summary.id='terrainImportedFiles';const title=document.createElement('strong');title.textContent='追加済みJDOSSファイル';summary.append(title);const list=document.createElement('ul');for(const name of source.selectedFiles??source.files??[]){const item=document.createElement('li');item.textContent=name;item.style.overflowWrap='anywhere';list.append(item);}summary.append(list);button.after(summary);}
  button.onclick=()=>{
    const dialog=document.createElement('dialog'); dialog.id='terrainImportDialog'; dialog.className='terrain-import-dialog';
    dialog.setAttribute('aria-labelledby','terrainImportTitle');
    dialog.innerHTML='<header><h2 id="terrainImportTitle">地形データを追加</h2><button type="button" id="closeTerrainImport" aria-label="閉じる"><i data-lucide="x"></i>閉じる</button></header><div class="terrain-file-heading"><strong>GIS・ROMS地形データ</strong><button id="terrainFileInfo" type="button" class="terrain-info-button" aria-label="GIS地形データの説明" aria-expanded="false"><i data-lucide="info"></i></button></div><div id="terrainFileHelp" class="terrain-file-help" hidden><strong>Shapefile：同名の3ファイルが必須</strong><p>.shp 形状 ／ .dbf 水深属性 ／ .prj 座標系。任意で.shx・.cpg。水深属性はDEPTH_M／DEPTH（m、正の水深）。ポリゴン・等深線・水深点に対応します。</p><p>NetCDFまたはZIPは1ファイル。従来ROMSのh・lon_rho・lat_rho、任意のmask_rhoを持つ地形.ncに対応します。明示された陸海マスクは保持します。Shapefile一式のZIPも読み込めます。</p><p>緯度経度がある場合はETOPOから陸海・不足水深を自動補完します。必要に応じてNOAAから取得するため、インターネット接続が必要です。水深基準面は自動変換しません。</p></div><label id="terrainDropZone" class="terrain-import-drop"><i data-lucide="upload"></i><strong>地形ファイルをドラッグ＆ドロップ</strong><span>Shapefile 3点 ／ ZIP ／ NetCDF・ROMS .nc</span><span class="terrain-file-picker">ファイルを選択</span><input id="terrainImport" aria-label="GIS地形データを追加" type="file" accept=".zip,.nc,.shp,.dbf,.prj,.shx,.cpg" multiple></label><div id="terrainFileStatus" class="terrain-file-status" role="status"></div><div id="terrainImportProgress" class="terrain-build-progress" role="status" hidden><span class="terrain-build-spinner"></span><span>地形を構築中…</span></div><p id="terrainImportError" class="terrain-import-error" role="alert" hidden></p>';
    dialog.querySelector('.terrain-file-heading strong').textContent='GIS・ROMS・JODC地形データ';
    dialog.querySelector('#terrainImport').accept+=',.txt,.dat,.csv,.asc,.jegg,.xyz,.gz';
    dialog.querySelector('#terrainDropZone > span').textContent='Shapefile ／ ZIP ／ NetCDF・ROMS .nc ／ JODC J-EGG500';
    const jodcHelp=document.createElement('p');jodcHelp.textContent='JODC JDOSS J-EGG500：種別（0/1）・緯度・経度・水深mの固定長テキスト、空白/CSV形式、gzip、テキスト一式のZIPに対応します。テキストは複数選択可。WGS84、正の水深。陸域は含まれないためN03・ETOPOで補完します。J-BIRD・MGD77は未対応です。元データ・派生データの再配布はJODCの利用条件を確認してください。';dialog.querySelector('#terrainFileHelp').append(jodcHelp);
    document.body.append(dialog); dialog.showModal(); window.lucide?.createIcons();
    const $=id=>dialog.querySelector('#'+id), files=new Map(), controller=new AbortController(); let busy=false;
    const close=()=>{controller.abort();dialog.close();};
    $('closeTerrainImport').onclick=close;
    dialog.onclose=()=>{controller.abort();dialog.remove();};
    $('terrainFileInfo').onclick=event=>{const help=$('terrainFileHelp');help.hidden=!help.hidden;event.currentTarget.setAttribute('aria-expanded',String(!help.hidden));};
    const selection=document.createElement('div');selection.className='terrain-import-selection';$('terrainFileStatus').before(selection);
    const readSelected=document.createElement('button');readSelected.type='button';readSelected.id='readJodcTerrain';readSelected.textContent='選択したファイルをまとめて読み込む';readSelected.hidden=true;$('terrainFileStatus').after(readSelected);
    readSelected.after(selection);
    readSelected.onclick=()=>void add([],true);
    const update=()=>{
      readSelected.hidden=true;
      selection.replaceChildren(...[...files.values()].map(file=>{
        const row=document.createElement('div'),name=document.createElement('span'),remove=document.createElement('button');name.textContent=file.name;
        remove.type='button';remove.setAttribute('aria-label',file.name+'を除外');remove.title=file.name+'を除外';remove.innerHTML='<i data-lucide="x"></i>';
        remove.onclick=()=>{if(busy)return;files.delete(file.name.toLowerCase());update();void add([]);};
        row.append(name,remove);return row;
      }));
      $('terrainFileStatus').replaceChildren(...terrainFileStatus([...files.values()]).map(status=>{
        const row=document.createElement('div');row.className='terrain-file-check '+status.state;
        const name=document.createElement('span');name.textContent=status.label;
        const state=document.createElement('strong');state.textContent=status.state==='idle'?'追加待ち':status.text;
        row.append(name,state);return row;
      })); window.lucide?.createIcons();
    }; update();
    const add=async(incoming,apply=false)=>{
      if(busy||!incoming.length&&!files.size) return;
      if(blocked()){notify('計算を停止してから地形を変更してください。');return;}
      for(const file of incoming)files.set(file.name.toLowerCase(),file);
      $('terrainImport').value=''; update(); $('terrainImportError').hidden=true;
      const selected=[...files.values()], statuses=terrainFileStatus(selected);
      if(statuses.some(s=>s.state==='missing')) return;
      const jodcSelection=selected.some(file=>/\.(txt|dat|csv|asc|jegg|xyz|gz)$/i.test(file.name))||selected.every(file=>/\.zip$/i.test(file.name));
      readSelected.hidden=!jodcSelection;
      if(jodcSelection&&!apply)return;
      busy=true; $('terrainImport').disabled=true;
      const progress=$('terrainImportProgress');progress.hidden=false;
      const snapshot=JSON.stringify(getConfig());
      try{
        await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
        if(selected.reduce((sum,file)=>sum+file.size,0)>50e6)throw new Error('地形ファイルは合計50 MB以下にしてください。');
        let grid;
        if(/\.nc$/i.test(selected[0].name)) grid=resampleTerrain(readGeographicNetcdf(await selected[0].arrayBuffer(),0,{romsTerrain:true}),getConfig().grid);
        else grid=await importTerrain(selected,getConfig().grid);
        delete grid.autoEtopoCoastline;
        if(grid.geoBounds&&!grid.coastline&&grid.landMaskProvided!==true){
          const size=grid.nx*grid.ny,h=Float64Array.from({length:size},(_,p)=>grid.edits[p]??0),mask=Uint8Array.from(h,v=>v>0?1:0);
          grid=await buildCoastline(grid,{h,mask},null,{maskSource:'etopo',etopo:true,source:'NOAA ETOPO 2022; automatic land mask'},text=>progress.lastElementChild.textContent=text,controller.signal);
        }
        if(!dialog.open||!dialog.isConnected||JSON.stringify(getConfig())!==snapshot)throw new Error('構築中に条件が変わりました。もう一度地形を追加してください。');
        commit(grid); busy=false; dialog.close(); notify('地形を読み込みました。');
      }catch(error){if(dialog.isConnected){$('terrainImportError').textContent=error.message;$('terrainImportError').hidden=false;}}
      finally{busy=false;progress.hidden=true;$('closeTerrainImport')?.removeAttribute('disabled');$('terrainImport')?.removeAttribute('disabled');}
    };
    $('terrainImport').onchange=event=>void add([...event.target.files]);
    const drop=$('terrainDropZone');
    for(const type of ['dragenter','dragover']) drop.addEventListener(type,event=>{event.preventDefault();drop.classList.add('drag-active');});
    drop.ondragleave=()=>drop.classList.remove('drag-active');
    drop.ondrop=event=>{event.preventDefault();drop.classList.remove('drag-active');const entries=[...event.dataTransfer.items].map(item=>item.webkitGetAsEntry?.());if(entries.some(entry=>entry?.isDirectory)){notify('フォルダーではなく中のファイルを指定してください。');return;}void add([...event.dataTransfer.files]);};
  };
}
