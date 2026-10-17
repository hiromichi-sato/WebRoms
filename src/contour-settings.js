export const COLOR_MAPS = {
  default: { label: '変数の標準色', colors: null },
  viridis: { label: '紫・緑・黄', colors: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'] },
  thermal: { label: '青・水色・黄・赤', colors: ['#313695', '#4575b4', '#74add1', '#ffffbf', '#fdae61', '#d73027', '#a50026'] },
  diverging: { label: '青・白・赤', colors: ['#2166ac', '#67a9cf', '#f7f7f7', '#ef8a62', '#b2182b'] },
  gray: { label: '白・黒', colors: ['#fafafa', '#111111'] }
};

export function validRange(min, max) { return Number.isFinite(min) && Number.isFinite(max) && min < max; }

export function quartileRange(values) {
  const sorted = Array.from(values).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return { min: 0, max: 1, dataMin: 0, dataMax: 1 };
  const quantile = p => {
    const position = (sorted.length - 1) * p, index = Math.floor(position), weight = position - index;
    return sorted[index] * (1 - weight) + sorted[Math.min(index + 1, sorted.length - 1)] * weight;
  };
  const min = quantile(.25), upper = quantile(.75);
  const max = upper > min ? upper : min + Math.max(1e-12, Math.abs(min) * 1e-6);
  return { min, max, dataMin: sorted[0], dataMax: sorted.at(-1) };
}

export function sliderDomain(min, max) {
  const span = max > min ? max - min : Math.max(Math.abs(min) * .2, 1);
  return { min: min - span / 2, max: max + span / 2 };
}
const format = value => value !== 0 && (Math.abs(value) < .001 || Math.abs(value) >= 100000) ? value.toExponential(2) : Number(value.toPrecision(4)).toString();

export function rangeLabels(min, max, precision = 4) {
  let labels = [format(min), format(max)];
  for (let digits = precision; labels[0] === labels[1] && min !== max && digits <= 15; digits++) {
    labels = [min, max].map(value => Number(value.toPrecision(digits)).toString());
  }
  return labels;
}

export class ContourControls {
  constructor(parent, changed, { prefix = '', label = 'コンターの色と範囲' } = {}) {
    this.settings = {}; this.changed = changed;
    this.element = document.createElement('div');
    const idFor = id => prefix ? prefix + id[0].toUpperCase() + id.slice(1) : id;
    this.element.id = idFor('contourControls'); this.element.className = 'contour-controls'; this.element.hidden = true;
    this.element.setAttribute('aria-label', label);
    this.element.innerHTML = `<button id="contourToggle" type="button" aria-label="カラーバーの色と範囲" title="カラーバーの色と範囲" aria-expanded="false" aria-controls="contourPanel" aria-haspopup="dialog"><span id="contourPreview"></span><span class="contour-limits"><span id="contourLow"></span><span id="contourHigh"></span></span></button>
      <div id="contourPanel" role="dialog" aria-label="カラーバーの色と範囲" hidden>
      <div class="contour-heading"><strong id="contourUnit"></strong><button type="button" id="contourClose" class="icon" title="閉じる" aria-label="カラーバーを閉じる"><i data-lucide="x"></i></button></div>
      <label class="contour-check"><input id="contourAuto" type="checkbox" checked>自動範囲 <select id="contourAutoMode" aria-label="自動範囲の方式"><option value="quartile">四分位範囲</option><option value="full">最小〜最大</option></select></label>
      <div class="contour-range" role="group" aria-label="カラーバーの範囲"><div class="contour-range-track"></div><input id="contourMin" type="range" aria-label="カラーバーの下限"><input id="contourMax" type="range" aria-label="カラーバーの上限"></div>
      <div class="contour-numbers"><label for="contourMinNumber">下限<input id="contourMinNumber" type="number" step="any" aria-label="カラーバーの下限を入力"></label><label for="contourMaxNumber">上限<input id="contourMaxNumber" type="number" step="any" aria-label="カラーバーの上限を入力"></label></div>
      <div class="contour-domain"><span id="contourDomain"></span><button id="contourZoomIn" type="button" class="icon" title="範囲スライダーを拡大" aria-label="範囲スライダーを拡大"><i data-lucide="zoom-in"></i></button><button id="contourExpand" type="button" class="icon" title="範囲スライダーを縮小（選択できる範囲を広げる）" aria-label="範囲スライダーを縮小"><i data-lucide="zoom-out"></i></button></div>
      <div class="contour-palettes" role="group" aria-label="カラーバーの種類">${Object.entries(COLOR_MAPS).map(([key, map]) => `<button type="button" data-palette="${key}" aria-label="${map.label}" title="${map.label}" aria-pressed="false"><span style="background:linear-gradient(90deg,${(map.colors ?? ['#387ba8', '#72c7b1', '#f0ce73', '#d56b50']).join(',')})"></span></button>`).join('')}</div><label class="contour-check"><input id="contourReverse" type="checkbox">色を反転</label></div>`;
    parent.before(this.element);
    for (const element of this.element.querySelectorAll('[id]')) { const original = element.id; element.dataset.controlId = original; element.id = idFor(original); }
    for (const element of this.element.querySelectorAll('[for]')) element.htmlFor = idFor(element.htmlFor);
    const find = id => this.find(id);
    find('contourToggle').setAttribute('aria-controls', idFor('contourPanel'));
    find('contourToggle').title = label; find('contourToggle').setAttribute('aria-label', label);
    find('contourPanel').setAttribute('aria-label', label);
    this.auto = find('contourAuto'); this.min = find('contourMin'); this.max = find('contourMax'); this.reverse = find('contourReverse');
    this.minNumber = find('contourMinNumber'); this.maxNumber = find('contourMaxNumber');
    this.toggle = find('contourToggle'); this.panel = find('contourPanel');
    this.toggle.onclick = () => this.open(this.panel.hidden);
    find('contourAutoMode').onchange = event => { this.current.autoMode = event.target.value; this.current.auto = true; delete this.current.domain; this.changed(); };
    this.caption = document.createElement('span'); this.caption.className = 'colorbar-caption'; this.element.prepend(this.caption);
    find('contourClose').onclick = () => { this.open(false); this.toggle.focus(); };
    document.addEventListener('pointerdown', event => { if (!this.element.contains(event.target)) this.open(false); });
    this.element.addEventListener('keydown', event => { if (event.key === 'Escape' && !this.panel.hidden) { event.preventDefault(); event.stopPropagation(); this.open(false); this.toggle.focus(); } });
    this.element.addEventListener('focusout', event => { if (event.relatedTarget && !this.element.contains(event.relatedTarget)) this.open(false); });
    window.addEventListener('resize', () => this.position());
    window.addEventListener('scroll', () => this.position(), true);
    this.auto.onchange = () => {
      if (this.auto.checked) delete this.current.domain;
      if (!this.auto.checked && !validRange(this.min.valueAsNumber, this.max.valueAsNumber)) this.max.value = this.min.valueAsNumber + (Number(this.min.max) - Number(this.min.min)) / 1000000;
      this.commit();
    };
    for (const input of [this.min, this.max]) input.oninput = () => {
      this.auto.checked = false;
      const gap = (Number(input.max) - Number(input.min)) / 1000000;
      if (input === this.min) input.value = Math.min(input.valueAsNumber, this.max.valueAsNumber - gap);
      else input.value = Math.max(input.valueAsNumber, this.min.valueAsNumber + gap);
      this.commit();
    };
    for (const input of [this.minNumber, this.maxNumber]) {
      input.oninput = () => input.setCustomValidity('');
      input.onchange = () => {
        const min = this.minNumber.valueAsNumber, max = this.maxNumber.valueAsNumber;
        if (!validRange(min, max)) { input.setCustomValidity('下限・上限に数値を入力し、下限を上限より小さくしてください。'); input.reportValidity(); return; }
        Object.assign(this.current, { auto: false, min, max });
        const d = this.current.domain;
        d.min = Math.min(d.min, min); d.max = Math.max(d.max, max);
        this.changed();
      };
    }
    const track = this.element.querySelector('.contour-range-track');
    let dragging;
    const move = event => {
      const rect = track.getBoundingClientRect(), d = this.current.domain;
      const value = d.min + Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * (d.max - d.min);
      dragging ??= Math.abs(value - this.min.valueAsNumber) <= Math.abs(value - this.max.valueAsNumber) ? this.min : this.max;
      dragging.value = value; dragging.dispatchEvent(new Event('input', { bubbles: true }));
    };
    track.onpointerdown = event => { if (event.button !== 0) return; event.preventDefault(); track.setPointerCapture(event.pointerId); move(event); };
    track.onpointermove = event => { if (dragging) move(event); };
    track.onpointerup = track.onpointercancel = track.onlostpointercapture = () => { dragging = undefined; };
    find('contourZoomIn').onclick = () => this.zoom(.5);
    find('contourExpand').onclick = () => this.zoom(2);
    this.element.querySelector('.contour-range').addEventListener('wheel', event => {
      event.preventDefault(); if (event.deltaY) this.zoom(event.deltaY < 0 ? .8 : 1.25);
    }, { passive: false });
    this.reverse.onchange = () => { this.current.reverse = this.reverse.checked; this.changed(); };
    this.element.querySelectorAll('[data-palette]').forEach(button => button.onclick = () => { this.current.palette = button.dataset.palette; this.changed(); });
  }
  find(id) { return this.element.querySelector(`[data-control-id="${id}"]`); }
  zoom(factor) {
    const d = this.current.domain, min = this.min.valueAsNumber, max = this.max.valueAsNumber;
    const center = min / 2 + max / 2;
    const span = Math.max((d.max - d.min) * factor, (max - min) * 1.05);
    const domain = { min: center - span / 2, max: center + span / 2 };
    if (!validRange(domain.min, domain.max)) return;
    this.current.domain = domain; this.changed();
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
    this.find('contourAutoMode').value = this.current.autoMode ?? 'quartile';
    this.current.domain ??= sliderDomain(Math.min(view.dataMin, view.min), Math.max(view.dataMax, view.max));
    const d = this.current.domain;
    // Keep the slider scale stable while dragging, including live calculation updates.
    d.min = Math.min(d.min, view.min); d.max = Math.max(d.max, view.max);
    for (const input of [this.min, this.max]) { input.min = d.min; input.max = d.max; input.step = 'any'; }
    this.min.value = view.min; this.max.value = view.max;
    for (const [input, value] of [[this.minNumber, view.min], [this.maxNumber, view.max]]) if (document.activeElement !== input) { input.value = value; input.setCustomValidity(''); }
    this.element.querySelector('.contour-range').style.setProperty('--range-low', `${100 * (view.min - d.min) / (d.max - d.min)}%`);
    this.element.querySelector('.contour-range').style.setProperty('--range-high', `${100 * (view.max - d.min) / (d.max - d.min)}%`);
    const [lowLabel, highLabel] = rangeLabels(view.min, view.max);
    this.find('contourLow').textContent = lowLabel;
    this.find('contourHigh').textContent = highLabel;
    this.min.setAttribute('aria-valuetext', format(view.min)); this.max.setAttribute('aria-valuetext', format(view.max));
    this.find('contourDomain').textContent = `${format(d.min)} ～ ${format(d.max)}`;
    this.find('contourUnit').textContent = view.label ?? view.canvas.ownerDocument.getElementById('legendTitle').textContent;
    this.caption.textContent = this.find('contourUnit').textContent;
    this.find('contourPreview').style.background = `linear-gradient(90deg,${view.palette().join(',')})`;
    if (!this.element.querySelector('.nan-key')) {
      const key = document.createElement('span'); key.className = 'nan-key'; key.innerHTML = '<i></i>欠測'; key.title = '有効な数値データがない海セル'; this.element.append(key);
    }
    this.element.querySelector('.nan-key').hidden = !view.missingCount;
    this.element.querySelector('[data-palette="default"] span').style.background = `linear-gradient(90deg,${view.palette(view.variable ?? variable, null).join(',')})`;
    this.element.querySelectorAll('[data-palette]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.palette === this.current.palette)));
    this.position();
  }
}
