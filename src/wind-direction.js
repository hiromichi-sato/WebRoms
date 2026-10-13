export function bindWindDirection(root, preview) {
  const input = root.querySelector('[data-path="wind.direction"]'), canvas = root.querySelector('#windDirectionDial');
  if (!input || !canvas) return;
  const draw = angle => {
    const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, 180, 180);
    ctx.strokeStyle = '#a8bec2'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(90, 90, 62, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#35535b'; ctx.font = '12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [text, x, y] of [['北', 90, 12], ['東', 168, 90], ['南', 90, 168], ['西', 12, 90]]) ctx.fillText(text, x, y);
    const theta = angle * Math.PI / 180, ux = Math.sin(theta), uy = -Math.cos(theta), x = 90 + ux * 52, y = 90 + uy * 52;
    ctx.strokeStyle = ctx.fillStyle = '#087668'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(90 - ux * 30, 90 - uy * 30); ctx.lineTo(x, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - ux * 14 - uy * 8, y - uy * 14 + ux * 8); ctx.lineTo(x - ux * 14 + uy * 8, y - uy * 14 - ux * 8); ctx.closePath(); ctx.fill();
    canvas.setAttribute('aria-valuenow', angle); canvas.setAttribute('aria-valuetext', `吹いていく向き ${angle}度`);
  };
  const set = angle => { const value = (Math.round(angle) + 360) % 360; input.value = value; draw(value); preview(value); };
  const point = event => { const r = canvas.getBoundingClientRect(); set(Math.atan2(event.clientX - r.left - r.width / 2, r.top + r.height / 2 - event.clientY) * 180 / Math.PI); };
  const commit = () => input.dispatchEvent(new Event('change', { bubbles: true }));
  canvas.onpointerdown = event => { if (event.button !== 0) return; event.preventDefault(); canvas.setPointerCapture(event.pointerId); point(event); };
  canvas.onpointermove = event => { if (canvas.hasPointerCapture(event.pointerId)) point(event); };
  canvas.onpointerup = event => { if (canvas.hasPointerCapture(event.pointerId)) { point(event); canvas.releasePointerCapture(event.pointerId); commit(); } };
  canvas.onpointercancel = commit;
  canvas.onkeydown = event => { const delta = { ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5 }[event.key]; if (delta !== undefined || event.key === 'Home') { event.preventDefault(); set(event.key === 'Home' ? 0 : Number(input.value) + delta); commit(); } };
  draw(Number(input.value));
}
