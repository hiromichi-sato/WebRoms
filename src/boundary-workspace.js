export function arrangeBoundaryWorkspace(config, column, scenePair, busy) {
  const $ = id => document.getElementById(id), tide = $('boundaryTidePanel'), sea = $('seaLevelEditor');
  const group = document.createElement('div'); group.id = 'boundaryForcingColumn';
  $('boundaryHeightResizer').before(group);
  if (tide) group.append(tide);
  if (sea) { sea.hidden = !config.ocean?.seaLevelEnabled; group.append(sea); }
  group.classList.toggle('has-two-forcings', Boolean(tide && !tide.hidden && sea && !sea.hidden));
  const toolbar = document.createElement('div'); toolbar.id = 'boundaryForcingTools'; toolbar.setAttribute('aria-label', '潮汐と海面高度の編集');
  const tideControls = $('tideToolbarControls');
  if (tideControls && config.ocean?.tideMode !== 'off') {
    const title = document.createElement('strong'); title.textContent = '潮汐の編集'; tideControls.prepend(title); toolbar.append(tideControls);
  }
  const seaControls = $('seaLevelEditTools');
  if (seaControls) {
    seaControls.title = seaControls.querySelector('.source-note')?.textContent ?? '';
    seaControls.querySelector('.source-note')?.remove();
    seaControls.hidden = !config.ocean?.seaLevelEnabled; toolbar.append(seaControls);
  }
  toolbar.hidden = ![...toolbar.children].some(child => !child.hidden);
  for (const control of toolbar.querySelectorAll('input,select')) if (busy) control.disabled = true;
  scenePair.before(toolbar);
}

export function showClimateSourceInfo() {
  document.getElementById('climateInfoDialog')?.remove();
  const dialog = document.createElement('dialog'); dialog.id = 'climateInfoDialog'; dialog.className = 'boundary-source-dialog';
  dialog.setAttribute('aria-label', '初期条件の気候値・出典');
  const heading = document.createElement('h2'); heading.textContent = '初期条件の気候値・出典'; dialog.append(heading);
  for (const id of ['climateSource', 'regionalClimateSource']) {
    const source = document.getElementById(id); if (!source?.textContent.trim()) continue;
    const copy = source.cloneNode(true); copy.removeAttribute('id'); copy.removeAttribute('hidden'); dialog.append(copy);
  }
  if (dialog.children.length === 1) { const note = document.createElement('p'); note.textContent = '気候値は未適用です。'; dialog.append(note); }
  const close = document.createElement('button'); close.type = 'button'; close.textContent = '閉じる'; close.onclick = () => dialog.close(); dialog.append(close);
  dialog.onclose = () => dialog.remove(); document.body.append(dialog); dialog.showModal();
}
