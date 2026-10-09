export const COLOR_MAPS = {
  default: { label: '変数の標準色', colors: null },
  viridis: { label: '紫・緑・黄', colors: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'] },
  thermal: { label: '青・水色・黄・赤', colors: ['#313695', '#4575b4', '#74add1', '#ffffbf', '#fdae61', '#d73027', '#a50026'] },
  diverging: { label: '青・白・赤', colors: ['#2166ac', '#67a9cf', '#f7f7f7', '#ef8a62', '#b2182b'] },
  gray: { label: '白・黒', colors: ['#fafafa', '#111111'] }
};

export function validRange(min, max) { return Number.isFinite(min) && Number.isFinite(max) && min < max; }

export function sliderDomain(min, max) {
  const span = max > min ? max - min : Math.max(Math.abs(min) * .2, 1);
  return { min: min - span / 2, max: max + span / 2 };
}
const format = value => Number(value.toPrecision(5)).toString();

export class ContourControls {
  constructor(parent, changed) {
    this.settings = {}; this.changed = changed;
    this.element = document.createElement('div');
    this.element.id = 'contourControls'; this.element.hidden = true;
    this.element.setAttribute('aria-label', 'コンターの色と範囲');
    this.element.innerHTML = `<button id="contourToggle" type="button" aria-label="カラーバーの色と範囲" title="カラーバーの色と範囲" aria-expanded="false" aria-controls="contourPanel" aria-haspopup="dialog"><span id="contourPreview"></span><span class="contour-limits"><span id="contourLow"></span><span id="contourHigh"></span></span></button>
      <div id="contourPanel" role="dialog" aria-label="カラーバーの色と範囲" hidden>
      <div class="contour-heading"><strong id="contourUnit"></strong><button type="button" id="contourClose" class="icon" title="閉じる" aria-label="カラーバーを閉じる"><i data-lucide="x"></i></button></div>
      <label class="contour-check"><input id="contourAuto" type="checkbox" checked>範囲を自動設定</label>
      <label class="contour-slider" for="contourMin"><span>下限</span><output id="contourMinValue"></output><input id="contourMin" type="range" aria-label="カラーバーの下限"></label>
      <label class="contour-slider" for="contourMax"><span>上限</span><output id="contourMaxValue"></output><input id="contourMax" type="range" aria-label="カラーバーの上限"></label>
      <div class="contour-domain"><span id="contourDomain"></span><button id="contourExpand" type="button" class="icon" title="選択できる範囲を広げる" aria-label="選択できる範囲を広げる"><i data-lucide="maximize-2"></i></button></div>
      <div class="contour-palettes" role="group" aria-label="カラーバーの種類">${Object.entries(COLOR_MAPS).map(([key, map]) => `<button type="button" data-palette="${key}" aria-label="${map.label}" title="${map.label}" aria-pressed="false"><span style="background:linear-gradient(90deg,${(map.colors ?? ['#387ba8', '#72c7b1', '#f0ce73', '#d56b50']).join(',')})"></span></button>`).join('')}</div><label class="contour-check"><input id="contourReverse" type="checkbox">色を反転</label></div>`;
    parent.before(this.element);
    const find = id => this.element.querySelector('#' + id);
    this.auto = find('contourAuto'); this.min = find('contourMin'); this.max = find('contourMax'); this.reverse = find('contourReverse');
    this.toggle = find('contourToggle'); this.panel = find('contourPanel');
    this.toggle.onclick = () => this.open(this.panel.hidden);
    find('contourClose').onclick = () => { this.open(false); this.toggle.focus(); };
    document.addEventListener('pointerdown', event => { if (!this.element.contains(event.target)) this.open(false); });
    this.element.addEventListener('keydown', event => { if (event.key === 'Escape' && !this.panel.hidden) { event.preventDefault(); event.stopPropagation(); this.open(false); this.toggle.focus(); } });
    this.element.addEventListener('focusout', event => { if (event.relatedTarget && !this.element.contains(event.relatedTarget)) this.open(false); });
    window.addEventListener('resize', () => this.position());
    window.addEventListener('scroll', () => this.position(), true);
    this.auto.onchange = () => {
      if (this.auto.checked) delete this.current.domain;
      if (!this.auto.checked && !validRange(this.min.valueAsNumber, this.max.valueAsNumber)) this.max.value = this.min.valueAsNumber + Number(this.min.step);
      this.commit();
    };
    for (const input of [this.min, this.max]) input.oninput = () => {
      this.auto.checked = false;
      const gap = Number(input.step);
      if (input === this.min) input.value = Math.min(input.valueAsNumber, this.max.valueAsNumber - gap);
      else input.value = Math.max(input.valueAsNumber, this.min.valueAsNumber + gap);
      this.commit();
    };
    find('contourExpand').onclick = () => { const d = this.current.domain, span = d.max - d.min; this.current.domain = { min: d.min - span / 2, max: d.max + span / 2 }; this.changed(); };
    this.reverse.onchange = () => { this.current.reverse = this.reverse.checked; this.changed(); };
    this.element.querySelectorAll('[data-palette]').forEach(button => button.onclick = () => { this.current.palette = button.dataset.palette; this.changed(); });
  }
  open(open) {
    this.panel.hidden = !open; this.toggle.setAttribute('aria-expanded', String(open));
    if (open) { this.position(); this.min.focus({ preventScroll: true }); }
  }
  position() {
    if (this.panel.hidden) return;
    const bounds = this.toggle.getBoundingClientRect(), width = this.panel.offsetWidth, height = this.panel.offsetHeight;
    this.panel.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, bounds.right - width))}px`;
    this.panel.style.top = `${Math.max(8, Math.min(window.innerHeight - height - 8, bounds.bottom + 6))}px`;
  }
  commit() {
    if (!this.auto.checked && !validRange(this.min.valueAsNumber, this.max.valueAsNumber)) return;
    Object.assign(this.current, { auto: this.auto.checked, min: this.min.valueAsNumber, max: this.max.valueAsNumber, reverse: this.reverse.checked });
    this.changed();
  }
  get(variable) { return this.settings[variable] ??= { auto: true, palette: 'default', reverse: false }; }
  update(variable, view, visible) {
    this.element.hidden = !visible; this.current = this.get(variable);
    if (!visible) { this.open(false); return; }
    this.auto.checked = this.current.auto; this.reverse.checked = this.current.reverse;
    this.current.domain ??= sliderDomain(Math.min(view.dataMin, view.min), Math.max(view.dataMax, view.max));
    const d = this.current.domain;
    // Keep the slider scale stable while dragging, including live calculation updates.
    d.min = Math.min(d.min, view.min); d.max = Math.max(d.max, view.max);
    for (const input of [this.min, this.max]) { input.min = d.min; input.max = d.max; input.step = (d.max - d.min) / 1000; }
    this.min.value = view.min; this.max.value = view.max;
    for (const id of ['contourMinValue', 'contourLow']) this.element.querySelector('#' + id).textContent = format(view.min);
    for (const id of ['contourMaxValue', 'contourHigh']) this.element.querySelector('#' + id).textContent = format(view.max);
    this.min.setAttribute('aria-valuetext', format(view.min)); this.max.setAttribute('aria-valuetext', format(view.max));
    this.element.querySelector('#contourDomain').textContent = `${format(d.min)} ～ ${format(d.max)}`;
    this.element.querySelector('#contourUnit').textContent = view.canvas.ownerDocument.getElementById('legendTitle').textContent;
    this.element.querySelector('#contourPreview').style.background = `linear-gradient(90deg,${view.palette().join(',')})`;
    this.element.querySelector('[data-palette="default"] span').style.background = `linear-gradient(90deg,${view.palette(variable, null).join(',')})`;
    this.element.querySelectorAll('[data-palette]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.palette === this.current.palette)));
    this.position();
  }
}
