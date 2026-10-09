export const COLOR_MAPS = {
  default: { label: '変数の標準色', colors: null },
  viridis: { label: '紫・緑・黄', colors: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'] },
  thermal: { label: '青・水色・黄・赤', colors: ['#313695', '#4575b4', '#74add1', '#ffffbf', '#fdae61', '#d73027', '#a50026'] },
  diverging: { label: '青・白・赤', colors: ['#2166ac', '#67a9cf', '#f7f7f7', '#ef8a62', '#b2182b'] },
  gray: { label: '白・黒', colors: ['#fafafa', '#111111'] }
};

export function validRange(min, max) { return Number.isFinite(min) && Number.isFinite(max) && min < max; }

export class ContourControls {
  constructor(parent, changed) {
    this.settings = {}; this.changed = changed;
    this.element = document.createElement('section');
    this.element.id = 'contourControls'; this.element.hidden = true;
    this.element.setAttribute('aria-label', 'コンターの色と範囲');
    this.element.innerHTML = `<div class="contour-heading"><strong>コンター</strong><span id="contourUnit"></span><label><input id="contourAuto" type="checkbox" checked>範囲を自動設定</label></div>
      <div class="contour-range"><label>最小値<input id="contourMin" type="number" step="any"></label><span id="contourPreview"></span><label>最大値<input id="contourMax" type="number" step="any"></label></div>
      <div class="contour-palettes" role="group" aria-label="カラーバーの種類">${Object.entries(COLOR_MAPS).map(([key, map]) => `<button type="button" data-palette="${key}" aria-label="${map.label}" title="${map.label}" aria-pressed="false"><span style="background:linear-gradient(90deg,${(map.colors ?? ['#387ba8', '#72c7b1', '#f0ce73', '#d56b50']).join(',')})"></span></button>`).join('')}<label><input id="contourReverse" type="checkbox">反転</label></div><output id="contourError" role="status"></output>`;
    parent.before(this.element);
    const find = id => this.element.querySelector('#' + id);
    this.auto = find('contourAuto'); this.min = find('contourMin'); this.max = find('contourMax'); this.reverse = find('contourReverse'); this.error = find('contourError');
    this.auto.onchange = () => {
      if (!this.auto.checked && !validRange(this.min.valueAsNumber, this.max.valueAsNumber)) this.max.value = this.min.valueAsNumber + 1;
      this.commit();
    };
    this.min.onchange = this.max.onchange = () => this.commit();
    this.reverse.onchange = () => this.commit();
    this.element.querySelectorAll('[data-palette]').forEach(button => button.onclick = () => { this.current.palette = button.dataset.palette; this.commit(); });
  }
  commit() {
    if (!this.auto.checked && !validRange(this.min.valueAsNumber, this.max.valueAsNumber)) { this.error.textContent = '最大値は最小値より大きくしてください。'; return; }
    Object.assign(this.current, { auto: this.auto.checked, min: this.min.valueAsNumber, max: this.max.valueAsNumber, reverse: this.reverse.checked });
    this.error.textContent = ''; this.changed();
  }
  get(variable) { return this.settings[variable] ??= { auto: true, palette: 'default', reverse: false }; }
  update(variable, view, visible) {
    this.element.hidden = !visible; this.current = this.get(variable);
    if (!visible) return;
    this.auto.checked = this.current.auto; this.reverse.checked = this.current.reverse;
    this.min.disabled = this.max.disabled = this.current.auto;
    this.min.value = this.current.auto ? Number(view.min.toPrecision(7)) : this.current.min;
    this.max.value = this.current.auto ? Number(view.max.toPrecision(7)) : this.current.max;
    this.element.querySelector('#contourUnit').textContent = view.canvas.ownerDocument.getElementById('legendTitle').textContent;
    this.element.querySelector('#contourPreview').style.background = `linear-gradient(90deg,${view.palette().join(',')})`;
    const standard = view.colorSettings;
    view.colorSettings = undefined;
    this.element.querySelector('[data-palette="default"] span').style.background = `linear-gradient(90deg,${view.palette().join(',')})`;
    view.colorSettings = standard;
    this.element.querySelectorAll('[data-palette]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.palette === this.current.palette)));
  }
}
