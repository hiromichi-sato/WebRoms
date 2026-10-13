import { DIAGNOSTICS, diagnosticAvailable } from './diagnostics.js';

export class DiagnosticControls {
  constructor(normal, onChange) {
    this.root = document.createElement('label'); this.root.className = 'diagnostic-control'; this.root.hidden = true;
    this.root.innerHTML = '<span>高度な表示</span><select id="diagnosticSelect" aria-label="高度な表示項目"><option value="">選択なし</option></select>';
    normal.after(this.root); this.select = this.root.querySelector('select');
    for (const [label, bio] of [['物理', false], ['生物（NPZD・瞬間反応）', true]]) {
      const group = document.createElement('optgroup'); group.label = label;
      for (const [key, d] of Object.entries(DIAGNOSTICS)) if (!!d.rate === bio) {
        const option = new Option(d.label, key); option.title = `${d.formula} / ${d.unit}`; group.append(option);
      }
      this.select.append(group);
    }
    this.select.onchange = () => onChange(this.select.value || normal.value);
  }
  update(active, config, field, fields) {
    this.root.hidden = !active;
    for (const option of this.select.options) if (option.value) {
      option.disabled = !diagnosticAvailable(option.value, config, fields);
      option.title = option.value === 'diagKv' && option.disabled ? 'GLSの鉛直拡散係数は計算開始後に表示できます。' : `${DIAGNOSTICS[option.value].formula} / ${DIAGNOSTICS[option.value].unit}`;
    }
    const selected = DIAGNOSTICS[field] ? field : '';
    if (this.select.value !== selected) this.select.value = selected;
    this.select.title = DIAGNOSTICS[field] ? `${DIAGNOSTICS[field].formula} / ${DIAGNOSTICS[field].unit}` : '物理・生物の診断量';
  }
}
