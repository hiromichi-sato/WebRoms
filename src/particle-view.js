import * as THREE from 'three';

export function visibleParticles(view) {
  const data = view.particles;
  if (!data) return [];
  const sources = data.sources ?? [], last = data.records?.at(-1), result = [];
  if (last) {
    for (let l = 0; l < last.positions.length / 4; l++) {
      const p = last.positions.subarray(l * 4, l * 4 + 4);
      if (p[3] === 2 || ![p[0], p[1], p[2]].every(Number.isFinite)) continue;
      result.push({ position: p, color: sources[(data.sourceIndex?.[l] ?? 1) - 1]?.color ?? '#c52c64' });
    }
  }
  return result;
}

export function buildParticleScene(view) {
  const { width, height, dx, dy } = view.vectorLayout, markers = [], colors = [];
  for (const { position: p, color } of visibleParticles(view)) {
    markers.push(new THREE.Vector3((p[0] + .5) * dx - width / 2, -p[2] * view.zscale + .02, height / 2 - (p[1] + .5) * dy));
    const c = new THREE.Color(color); colors.push(c.r, c.g, c.b);
  }
  if (markers.length) {
    const geometry = new THREE.BufferGeometry().setFromPoints(markers);
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const dots = new THREE.Points(geometry, new THREE.PointsMaterial({ vertexColors: true, size: 6, sizeAttenuation: false, depthTest: false }));
    dots.name = 'particle-markers'; dots.renderOrder = 10; view.group.add(dots);
  }
  view.container.dataset.particleCount = String(markers.length);
  view.container.dataset.particleVerticalSpan = String(markers.length ? Math.max(...markers.map(p => p.y)) - Math.min(...markers.map(p => p.y)) : 0);
  let pinCount = 0;
  for (const [index, source] of (view.particles?.sources ?? []).entries()) {
    if (!Number.isInteger(source.cell) || source.cell < 0 || source.cell >= view.fields.nx * view.fields.ny) continue;
    pinCount++;
    const p = source.cell, x = (p % view.fields.nx + .5) * dx - width / 2, z = height / 2 - (Math.floor(p / view.fields.nx) + .5) * dy;
    const material = new THREE.MeshBasicMaterial({ color: source.color, depthTest: false });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .24, 8), material); stem.position.set(x, .18, z); stem.renderOrder = 11; stem.userData.releaseCell = p; view.group.add(stem);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = source.color; ctx.beginPath(); ctx.arc(32, 32, 29, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = 'bold 30px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(index + 1), 32, 33);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
    head.scale.set(.2, .2, 1); head.position.set(x, .34, z); head.renderOrder = 12; head.name = 'particle-release-pin'; head.userData.releaseCell = p; view.group.add(head);
  }
  view.container.dataset.releasePinCount = String(pinCount);
}

export function drawParticles2d(view, ctx, x0, y0, width, height, dpr) {
  const { nx, ny } = view.fields;
  ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, width, height); ctx.clip();
  for (const { position: p, color } of visibleParticles(view)) {
    ctx.beginPath(); ctx.arc(x0 + (p[0] + .5) * width / nx, y0 + (ny - p[1] - .5) * height / ny, 3 * dpr, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  }
  for (const [index, source] of (view.particles?.sources ?? []).entries()) {
    if (!Number.isInteger(source.cell) || source.cell < 0 || source.cell >= nx * ny) continue;
    const x = x0 + (source.cell % nx + .5) * width / nx, y = y0 + (ny - Math.floor(source.cell / nx) - .5) * height / ny;
    ctx.strokeStyle = source.color; ctx.lineWidth = 2 * dpr; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 14 * dpr); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y - 18 * dpr, 7 * dpr, 0, Math.PI * 2); ctx.fillStyle = source.color; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `bold ${10 * dpr}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(index + 1), x, y - 18 * dpr);
  }
  ctx.restore();
}
