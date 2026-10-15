export function addPaneResizer(parent, before, { id, label, property, ratio = false, axis = 'x' }) {
  const vertical = axis === 'y';
  const handle = document.createElement('div');
  handle.id = id; handle.className = 'pane-resizer' + (vertical ? ' pane-resizer-horizontal' : ''); handle.tabIndex = 0;
  handle.setAttribute('role', 'separator'); handle.setAttribute('aria-orientation', vertical ? 'horizontal' : 'vertical');
  handle.setAttribute('aria-label', label); handle.title = label;
  handle.setAttribute('aria-valuemin', ratio ? '28' : '260');
  handle.setAttribute('aria-valuemax', ratio ? '72' : '660');
  handle.setAttribute('aria-valuenow', ratio ? '50' : '340');
  before.before(handle);
  const apply = position => {
    const rect = parent.getBoundingClientRect();
    const offset = position - (vertical ? rect.top : rect.left), size = vertical ? rect.height : rect.width;
    const value = ratio ? Math.max(28, Math.min(72, offset / size * 100))
      : Math.max(260, Math.min(Math.min(660, size - 330), offset));
    parent.style.setProperty(property, `${value}${ratio ? '%' : 'px'}`);
    handle.setAttribute('aria-valuenow', String(Math.round(value)));
  };
  let dragging = false;
  handle.onpointerdown = event => {
    if (event.button !== 0) return;
    event.preventDefault(); dragging = true; handle.setPointerCapture(event.pointerId);
    document.body.classList.add(vertical ? 'resizing-panes-vertical' : 'resizing-panes');
  };
  handle.onpointermove = event => { if (dragging) apply(vertical ? event.clientY : event.clientX); };
  handle.onpointerup = handle.onpointercancel = handle.onlostpointercapture = () => {
    dragging = false; document.body.classList.remove('resizing-panes', 'resizing-panes-vertical');
  };
  handle.ondblclick = () => { parent.style.removeProperty(property); handle.setAttribute('aria-valuenow', ratio ? '50' : '340'); };
  handle.onkeydown = event => {
    const backward = vertical ? 'ArrowUp' : 'ArrowLeft', forward = vertical ? 'ArrowDown' : 'ArrowRight';
    if (![backward, forward, 'Home'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') handle.ondblclick();
    else apply((vertical ? handle.getBoundingClientRect().top : handle.getBoundingClientRect().left) + (event.key === forward ? 20 : -20));
  };
  return handle;
}
