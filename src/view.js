import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BIO_MODELS } from './biology-catalog.js';

export const LABELS = { h: '水深 / m', temp: '水温 / °C', salt: '塩分', zeta: '海面高度 / m', u: '東向き流速 U / m s⁻¹', v: '北向き流速 V / m s⁻¹', NO3: '硝酸塩 / mmol N m⁻³', NH4: 'アンモニウム / mmol N m⁻³', phytoplankton: '植物プランクトン / mmol N m⁻³', zooplankton: '動物プランクトン / mmol N m⁻³', LDeN: '大型デトリタス / mmol N m⁻³', SDeN: '小型デトリタス / mmol N m⁻³', chlorophyll: 'クロロフィル / mg Chl m⁻³' };
const palettes = { h: ['#d9efca', '#68b9af', '#245d96'], temp: ['#387ba8', '#72c7b1', '#f0ce73', '#d56b50'], salt: ['#eee2a8', '#57b7a1', '#465983'], zeta: ['#527db6', '#f2f5ee', '#d77960'], u: ['#466eaa', '#eef1df', '#c45c45'], v: ['#466eaa', '#eef1df', '#c45c45'], NO3: ['#e8f2d2', '#7abd8c', '#176b68'], NH4: ['#f5e7bd', '#e49a58', '#a84247'], phytoplankton: ['#e7f1bc', '#62ae67', '#145b50'], zooplankton: ['#e9d7b7', '#c76b55', '#6b415c'], LDeN: ['#ede3c2', '#b28a4b', '#5f5940'], SDeN: ['#e8e7c7', '#7fae83', '#426e70'], chlorophyll: ['#f3e8a7', '#67b999', '#3472a0'] };
export function color(value, min, max, field) {
  const palette = palettes[field] ?? palettes.NO3, t = Math.max(0, Math.min(1, (value - min) / (max - min || 1))) * (palette.length - 1), i = Math.min(palette.length - 2, Math.floor(t));
  return new THREE.Color(palette[i]).lerp(new THREE.Color(palette[i + 1]), t - i);
}
for (const model of Object.values(BIO_MODELS)) for (const tracer of model.tracers) { LABELS[tracer.key] = `${tracer.label} / ${tracer.unit}`; palettes[tracer.key] = palettes.NO3; }
export class OceanView {
  constructor(container, canvas, onPick) {
    this.container = container; this.canvas = canvas; this.onPick = onPick; this.mode = '3d';
    this.mapZoom = 1; this.mapPanX = 0; this.mapPanY = 0;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#edf3f1');
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    try { this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); }
    catch { this.mode = 'map'; this.renderer = null; }
    if (this.renderer) {
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); container.append(this.renderer.domElement);
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.minDistance = 5; this.controls.maxDistance = 35; this.controls.maxPolarAngle = Math.PI * 0.49;
      this.controls.addEventListener('change', () => this.render3d()); this.home();
      this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2();
      this.renderer.domElement.addEventListener('pointerdown', event => {
        if (this.mode !== '3d' || !this.editing || (event.button !== 0 && event.button !== 2)) return;
        this.paint3d(event); this.renderer.domElement.setPointerCapture(event.pointerId);
      });
      this.renderer.domElement.addEventListener('pointermove', event => {
        if (this.mode === '3d' && this.editing && event.buttons) this.paint3d(event);
        else if (this.mode === '3d') { const cell = this.cellAt3d(event); if (cell !== null) this.onPick(cell, false); }
      });
      this.renderer.domElement.addEventListener('pointerup', () => this.onPick(null, false, true));
      this.renderer.domElement.addEventListener('contextmenu', event => { if (this.editing) event.preventDefault(); });
    }
    this.group = new THREE.Group(); this.scene.add(this.group);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(container.parentElement);
    canvas.addEventListener('pointerdown', event => {
      if (this.mode === 'map' && (event.shiftKey || event.button === 1)) { this.panDrag = { x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); return; }
      this.paint(event); canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointerup', () => { this.panDrag = undefined; this.onPick(null, false, true); });
    canvas.addEventListener('pointercancel', () => { this.panDrag = undefined; this.onPick(null, false, true); });
    canvas.addEventListener('pointermove', event => {
      if (this.panDrag) { this.mapPanX += event.clientX - this.panDrag.x; this.mapPanY += event.clientY - this.panDrag.y; this.panDrag = { x: event.clientX, y: event.clientY }; this.draw(); return; }
      this.emitPick(event, Boolean(event.buttons));
    });
    canvas.addEventListener('wheel', event => { if (this.mode === 'map') { event.preventDefault(); this.zoomMap(event.deltaY < 0 ? 1 : -1); } }, { passive: false });
  }
  home() { this.mapZoom = 1; this.mapPanX = 0; this.mapPanY = 0; this.camera.position.set(12, 12, 15); this.controls?.target.set(0, -1.1, 0); this.controls?.update(); this.draw(); }
  zoomMap(delta) { this.mapZoom = Math.max(1, Math.min(8, this.mapZoom * (delta > 0 ? 1.25 : 0.8))); this.draw(); }
  resize() {
    const { width, height } = this.container.parentElement.getBoundingClientRect();
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
    this.renderer?.setSize(width, height); this.canvas.width = Math.round(width * devicePixelRatio); this.canvas.height = Math.round(height * devicePixelRatio);
    if (this.fields) this.draw();
  }
  set(fields, variable, layer, mode, slice, vectors = false) {
    this.boundaryFace = null;
    this.fields = fields; this.variable = variable; this.layer = layer; this.mode = mode === '3d' && !this.renderer ? 'map' : mode; this.slice = slice; this.vectors = vectors;
    const size = fields.nx * fields.ny, tracer = Object.hasOwn(fields.biology ?? {}, variable), source = tracer ? fields.biology[variable] : fields[variable];
    const values = ['temp', 'salt'].includes(variable) || tracer ? source.subarray(layer * size, (layer + 1) * size) : source;
    this.values = values; this.min = Infinity; this.max = -Infinity;
    for (let p = 0; p < size; p++) if (fields.mask[p]) { this.min = Math.min(this.min, values[p]); this.max = Math.max(this.max, values[p]); }
    this.container.hidden = this.mode !== '3d'; this.canvas.hidden = this.mode === '3d';
    document.querySelector('#legendTitle').textContent = LABELS[variable];
    document.querySelector('#legendMin').textContent = this.min.toPrecision(3);
    document.querySelector('#legendMax').textContent = this.max.toPrecision(3);
    document.querySelector('#legendGradient').style.background = `linear-gradient(90deg,${palettes[variable].join(',')})`;
    this.rebuild(); this.draw();
  }
  setEditing(enabled) { this.editing = enabled; if (this.renderer) { this.renderer.domElement.style.cursor = enabled ? 'crosshair' : ''; if (this.controls) this.controls.enabled = !enabled; } }
  setBoundaryEdit(side, boundary, variable) {
    this.boundaryFace = side ? { side, boundary, variable } : null;
    if (!this.fields) return;
    this.container.hidden = Boolean(this.boundaryFace) || this.mode !== '3d';
    this.canvas.hidden = !this.boundaryFace && this.mode === '3d';
    this.draw();
  }
  cellAt3d(event) {
    if (!this.renderer || !this.group.children.length) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.group.children[0], false)[0];
    if (!hit) return null;
    const f = this.fields, extent = Math.max(f.nx * f.dx, f.ny * f.dy), width = 10 * f.nx * f.dx / extent, height = 10 * f.ny * f.dy / extent;
    const i = Math.floor((hit.point.x + width / 2) / (width / f.nx)), j = Math.floor((height / 2 - hit.point.z) / (height / f.ny));
    return i < 0 || j < 0 || i >= f.nx || j >= f.ny ? null : j * f.nx + i;
  }
  paint3d(event) { const cell = this.cellAt3d(event); if (cell !== null) this.onPick(cell, true, false, event.button === 2 ? 'secondary' : 'primary'); }
  rebuild() {
    for (const child of [...this.group.children]) { child.geometry?.dispose(); child.material?.dispose(); this.group.remove(child); }
    const f = this.fields, extent = Math.max(f.nx * f.dx, f.ny * f.dy);
    const width = 10 * f.nx * f.dx / extent, height = 10 * f.ny * f.dy / extent, dx = width / f.nx, dy = height / f.ny;
    this.worldHeight = height;
    const maxH = Math.max(...f.h), zscale = 2.2 / maxH;
    const elevation = p => !f.mask[p] ? 0.04 : this.variable === 'h' ? -f.h[p] * zscale : this.variable === 'zeta' ? f.zeta[p] * zscale : f.z_r ? f.z_r[this.layer * f.nx * f.ny + p] * zscale : -f.h[p] * (1 - (this.layer + 0.5) / f.nz) * zscale;
    const positions = [], colors = [], lines = [];
    for (let j = 0; j < f.ny; j++) for (let i = 0; i < f.nx; i++) {
      const p = j * f.nx + i, x = i * dx - width / 2, z = height / 2 - j * dy;
      const y = elevation(p);
      const c = f.mask[p] ? color(this.values[p], this.min, this.max, this.variable) : new THREE.Color('#b8c5b8');
      for (const [a, b] of [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]]) { positions.push(x + a * dx, y, z - b * dy); colors.push(c.r, c.g, c.b); }
      const wall = (x1, z1, x2, z2, neighbor) => {
        const lower = elevation(neighbor), shade = c.clone().multiplyScalar(0.8);
        for (const vertex of [[x1, y, z1], [x2, y, z2], [x2, lower, z2], [x1, y, z1], [x2, lower, z2], [x1, lower, z1]]) {
          positions.push(...vertex); colors.push(shade.r, shade.g, shade.b);
        }
      };
      if (i + 1 < f.nx) wall(x + dx, z, x + dx, z - dy, p + 1);
      if (j + 1 < f.ny) wall(x, z - dy, x + dx, z - dy, p + f.nx);
      if ((i % 4 === 0 && j % 4 === 0) || !f.mask[p]) lines.push(x, y + 0.006, z, x + dx, y + 0.006, z, x, y + 0.006, z, x, y + 0.006, z - dy);
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.group.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    if (this.boundaryEdit) {
      const edge = [], y = 0.12;
      if (this.boundaryEdit === 'west' || this.boundaryEdit === 'east') {
        const x = this.boundaryEdit === 'west' ? -width / 2 : width / 2;
        for (let j = 0; j < f.ny; j++) { const z = height / 2 - j * dy; edge.push(x, y, z, x, y, z - dy); }
      } else {
        const z = this.boundaryEdit === 'south' ? -height / 2 : height / 2;
        for (let i = 0; i < f.nx; i++) { const x = -width / 2 + i * dx; edge.push(x, y, z, x + dx, y, z); }
      }
      const edgeGeometry = new THREE.BufferGeometry(); edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(edge, 3));
      this.group.add(new THREE.LineSegments(edgeGeometry, new THREE.LineBasicMaterial({ color: '#b44c36', linewidth: 3 })));
    }
    const wire = new THREE.BufferGeometry(); wire.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    this.group.add(new THREE.LineSegments(wire, new THREE.LineBasicMaterial({ color: '#536f64', transparent: true, opacity: 0.2 })));
    const box = new THREE.EdgesGeometry(new THREE.BoxGeometry(width, 2.2, height));
    const outline = new THREE.LineSegments(box, new THREE.LineBasicMaterial({ color: '#9baea3', transparent: true, opacity: 0.6 })); outline.position.y = -1.1; this.group.add(outline);
  }
  render3d() { if (this.renderer) this.renderer.render(this.scene, this.camera); }
  draw() { if (this.boundaryFace) { this.drawBoundaryFace(); return; } if (this.mode === '3d') { this.render3d(); return; } this.draw2d(); }
  drawBoundaryFace() {
    const ctx = this.canvas.getContext('2d'), f = this.fields, { side, boundary, variable } = this.boundaryFace;
    const w = this.canvas.width, h = this.canvas.height, dpr = devicePixelRatio, length = side === 'west' || side === 'east' ? f.ny : f.nx, nz = f.nz;
    ctx.fillStyle = '#edf3f1'; ctx.fillRect(0, 0, w, h);
    const padX = 54 * dpr, padY = 48 * dpr, availableW = w - padX * 2, availableH = h - padY * 2;
    const rw = availableW, rh = Math.max(80 * dpr, availableH - 120 * dpr), x0 = padX, y0 = 112 * dpr;
    this.faceRect = { x: x0 / dpr, y: y0 / dpr, width: rw / dpr, height: rh / dpr };
    this.faceLength = length;
    const values = Array.from({ length: nz }, (_, k) => Array.from({ length }, (_, q) => boundary.painted?.[variable]?.[k]?.[q] ?? (variable === 'zeta' ? boundary.zeta : boundary.layers[k]?.[variable] ?? 0)));
    const flat = values.flat(), min = Math.min(...flat), max = Math.max(...flat), cellW = rw / length, cellH = rh / nz;
    document.querySelector('#legendTitle').textContent = LABELS[variable];
    document.querySelector('#legendMin').textContent = min.toPrecision(3);
    document.querySelector('#legendMax').textContent = max.toPrecision(3);
    document.querySelector('#legendGradient').style.background = `linear-gradient(90deg,${palettes[variable].join(',')})`;
    const indexAt = q => side === 'west' ? q * f.nx : side === 'east' ? q * f.nx + f.nx - 1 : side === 'south' ? q : (f.ny - 1) * f.nx + q;
    const wet = Array.from({ length }, (_, q) => f.mask[indexAt(q)]).filter(Boolean).length;
    let notice = document.querySelector('#boundaryNotice');
    if (!notice) { notice = document.createElement('div'); notice.id = 'boundaryNotice'; notice.className = 'boundary-notice'; notice.setAttribute('role', 'status'); this.canvas.parentElement.before(notice); }
    notice.hidden = false;
    notice.textContent = wet ? `水域 ${wet} / ${length} 区間 · 灰色は陸域（編集対象外）` : 'この境界面はすべて陸域です。水域のある境界面を選ぶか、海底地形で境界のセルを水域に変更してください。';
    for (let row = 0; row < nz; row++) for (let q = 0; q < length; q++) {
      const k = nz - row - 1, x = x0 + q * cellW, y = y0 + row * cellH, p = indexAt(q), value = values[k][q];
      ctx.fillStyle = f.mask[p] ? color(value, min, max, variable).getStyle() : '#b8c5b8';
      ctx.fillRect(x, y, Math.ceil(cellW), Math.ceil(cellH));
      ctx.strokeStyle = 'rgba(37,65,55,.4)'; ctx.lineWidth = Math.max(0.7, dpr * 0.65); ctx.strokeRect(x, y, cellW, cellH);
      if (f.mask[p] && cellW >= 30 * dpr && cellH >= 18 * dpr) {
        const label = Number(value.toPrecision(3)).toString(); ctx.save(); ctx.font = `${10 * dpr}px ui-monospace,Consolas,monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3 * dpr; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.strokeText(label, x + cellW / 2, y + cellH / 2); ctx.fillStyle = '#172a29'; ctx.fillText(label, x + cellW / 2, y + cellH / 2); ctx.restore();
      }
      if (k === this.layer) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5 * dpr; ctx.strokeRect(x + 1, y + 1, cellW - 2, cellH - 2); }
    }
    ctx.strokeStyle = '#71877b'; ctx.lineWidth = dpr; ctx.strokeRect(x0, y0, rw, rh);
    ctx.fillStyle = '#52675c'; ctx.font = `${11 * dpr}px system-ui`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('表層', 12 * dpr, y0 + cellH / 2); ctx.fillText('底層', 12 * dpr, y0 + rh - cellH / 2);
    ctx.textAlign = 'right'; ctx.fillText(`${length - 1}`, x0 + rw, y0 + rh + 19 * dpr); ctx.textAlign = 'left'; ctx.fillText('0', x0, y0 + rh + 19 * dpr);
    if (!wet) { ctx.save(); ctx.textAlign = 'center'; ctx.font = `600 ${14 * dpr}px system-ui`; ctx.fillStyle = '#344941'; ctx.fillText('陸域 · 水域セルなし', w / 2, y0 + rh / 2); ctx.restore(); }
    ctx.textAlign = 'center'; ctx.font = `600 ${13 * dpr}px system-ui`; ctx.fillStyle = '#24312f'; ctx.fillText(`${{ west: '西', east: '東', south: '南', north: '北' }[side]}側境界 · ${LABELS[variable] ?? variable}`, w / 2, 20 * dpr);
    ctx.font = `${10 * dpr}px system-ui`; ctx.fillStyle = '#586b61'; ctx.fillText(`${side === 'west' || side === 'east' ? '南 → 北' : '西 → 東'} · 格子番号`, w / 2, y0 + rh + 20 * dpr);
  }
  draw2d() {
    const ctx = this.canvas.getContext('2d'), f = this.fields, w = this.canvas.width, h = this.canvas.height, dpr = devicePixelRatio;
    ctx.fillStyle = '#edf3f1'; ctx.fillRect(0, 0, w, h);
    const pad = 52 * dpr, availableW = w - pad * 2, availableH = h - pad * 2;
    const aspect = f.nx * f.dx / (f.ny * f.dy), mapW = Math.min(availableW, availableH * aspect), mapH = mapW / aspect;
    const section = this.mode === 'section'; let rw = section ? availableW : mapW, rh = section ? availableH : mapH;
    if (!section) { rw *= this.mapZoom; rh *= this.mapZoom; }
    const x0 = (w - rw) / 2 + (section ? 0 : this.mapPanX), y0 = (h - rh) / 2 + (section ? 0 : this.mapPanY);
    this.rect = { x: x0 / dpr, y: y0 / dpr, width: rw / dpr, height: rh / dpr };
    const maxDepth = Math.max(...f.h);
    if (section) { ctx.fillStyle = '#b8c5b8'; ctx.fillRect(x0, y0, rw, rh); }
    if (!section) {
      ctx.strokeStyle = 'rgba(37, 65, 55, 0.28)'; ctx.lineWidth = Math.max(0.6, dpr * 0.55);
      for (let i = 0; i <= f.nx; i++) { const x = x0 + i * rw / f.nx; ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + rh); ctx.stroke(); }
      for (let j = 0; j <= f.ny; j++) { const y = y0 + j * rh / f.ny; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + rw, y); ctx.stroke(); }
    }
    for (let j = 0; j < (section ? f.nz : f.ny); j++) for (let i = 0; i < f.nx; i++) {
      const p = (section ? this.slice : j) * f.nx + i, k = section ? j : this.layer;
      const values = Object.hasOwn(f.biology ?? {}, this.variable) ? f.biology[this.variable] : f[this.variable];
      const tracer = Object.hasOwn(f.biology ?? {}, this.variable);
      const value = ['temp', 'salt'].includes(this.variable) || tracer ? values[k * f.nx * f.ny + p] : values[p];
      ctx.fillStyle = f.mask[p] ? color(value, this.min, this.max, this.variable).getStyle() : '#b8c5b8';
      const depth = f.h[p] / maxDepth;
      const y = section ? y0 + (1 - (j + 1) / f.nz) * rh * depth : y0 + (f.ny - 1 - j) * rh / f.ny;
      ctx.fillRect(x0 + i * rw / f.nx, y, Math.ceil(rw / f.nx), Math.ceil(section ? rh * depth / f.nz : rh / f.ny));
    }
    if (!section && this.mode === 'map' && rw / f.nx >= 26 * dpr && rh / f.ny >= 18 * dpr) {
      ctx.save(); ctx.font = `${10 * dpr}px ui-monospace, SFMono-Regular, Consolas, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let j = 0; j < f.ny; j++) for (let i = 0; i < f.nx; i++) {
        const p = j * f.nx + i; if (!f.mask[p]) continue;
        const bio = Object.hasOwn(f.biology ?? {}, this.variable), source = bio ? f.biology[this.variable] : f[this.variable];
        const value = ['temp', 'salt'].includes(this.variable) || bio ? source[this.layer * f.nx * f.ny + p] : source[p];
        const x = x0 + (i + 0.5) * rw / f.nx, y = y0 + (f.ny - j - 0.5) * rh / f.ny, label = Number.isFinite(value) ? Number(value.toPrecision(3)).toString() : '—';
        ctx.lineWidth = 3 * dpr; ctx.strokeStyle = 'rgba(255,255,255,0.88)'; ctx.strokeText(label, x, y); ctx.fillStyle = '#172a29'; ctx.fillText(label, x, y);
      }
      ctx.restore();
    }
    if (this.vectors && !section && this.mode === 'map') this.drawVectors(ctx, x0, y0, rw, rh, dpr);
    if (!section && this.mode === 'map' && this.boundaryEdit) {
      ctx.save(); ctx.strokeStyle = '#b44c36'; ctx.lineWidth = 4 * dpr;
      ctx.beginPath();
      if (this.boundaryEdit === 'west') { ctx.moveTo(x0, y0); ctx.lineTo(x0, y0 + rh); }
      if (this.boundaryEdit === 'east') { ctx.moveTo(x0 + rw, y0); ctx.lineTo(x0 + rw, y0 + rh); }
      if (this.boundaryEdit === 'south') { ctx.moveTo(x0, y0 + rh); ctx.lineTo(x0 + rw, y0 + rh); }
      if (this.boundaryEdit === 'north') { ctx.moveTo(x0, y0); ctx.lineTo(x0 + rw, y0); }
      ctx.stroke(); ctx.restore();
    }
    if (!section && this.mode === 'map') { ctx.strokeStyle = '#8ba597'; ctx.lineWidth = dpr; ctx.strokeRect(x0, y0, rw, rh); }
    if (section) { ctx.strokeStyle = '#8ba597'; ctx.lineWidth = dpr; ctx.strokeRect(x0, y0, rw, rh); }
  }
  drawVectors(ctx, x0, y0, rw, rh, dpr) {
    const f = this.fields, nx = f.nx, ny = f.ny, layerSizeU = ny * (nx - 1), layerSizeV = (ny - 1) * nx;
    const uOffset = this.layer * layerSizeU, vOffset = this.layer * layerSizeV;
    let maxSpeed = 0;
    for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const p = j * nx + i; if (!f.mask[p]) continue;
      const u = (f.u[uOffset + j * (nx - 1) + i - 1] + f.u[uOffset + j * (nx - 1) + i]) / 2;
      const v = (f.v[vOffset + (j - 1) * nx + i] + f.v[vOffset + j * nx + i]) / 2;
      maxSpeed = Math.max(maxSpeed, Math.hypot(u, v));
    }
    const step = Math.max(1, Math.ceil(Math.max(nx, ny) / (18 * this.mapZoom))), cellW = rw / nx, cellH = rh / ny;
    const maxLength = Math.min(cellW, cellH) * 0.42;
    ctx.save(); ctx.strokeStyle = '#173f37'; ctx.fillStyle = '#173f37'; ctx.lineWidth = Math.max(1.2, dpr * 1.25); ctx.lineCap = 'round';
    if (maxSpeed > 0) for (let j = 1; j < ny - 1; j += step) for (let i = 1; i < nx - 1; i += step) {
      const p = j * nx + i; if (!f.mask[p]) continue;
      const u = (f.u[uOffset + j * (nx - 1) + i - 1] + f.u[uOffset + j * (nx - 1) + i]) / 2;
      const v = (f.v[vOffset + (j - 1) * nx + i] + f.v[vOffset + j * nx + i]) / 2;
      const speed = Math.hypot(u, v); if (speed <= 0) continue;
      const length = maxLength * speed / maxSpeed, cx = x0 + (i + 0.5) * cellW, cy = y0 + (ny - j - 0.5) * cellH;
      const dx = length * u / speed, dy = -length * v / speed, ex = cx + dx * 0.5, ey = cy + dy * 0.5;
      ctx.beginPath(); ctx.moveTo(cx - dx * 0.5, cy - dy * 0.5); ctx.lineTo(ex, ey); ctx.stroke();
      const angle = Math.atan2(dy, dx), head = Math.max(3 * dpr, Math.min(cellW, cellH) * 0.16);
      ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - head * Math.cos(angle - 0.55), ey - head * Math.sin(angle - 0.55)); ctx.lineTo(ex - head * Math.cos(angle + 0.55), ey - head * Math.sin(angle + 0.55)); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = '#173f37'; ctx.font = `${11 * dpr}px system-ui`; ctx.fillText(`流速ベクトル / m s⁻¹   最大 ${maxSpeed.toFixed(3)}`, x0 + 4 * dpr, y0 - 9 * dpr);
  }
  cellAt(event) {
    if (this.boundaryFace && this.faceRect) {
      const bounds = this.canvas.getBoundingClientRect(), r = this.faceRect, x = event.clientX - bounds.left, y = event.clientY - bounds.top;
      const along = Math.floor((x - r.x) / r.width * this.faceLength), row = Math.floor((y - r.y) / r.height * this.fields.nz), k = this.fields.nz - 1 - row;
      if (along < 0 || along >= this.faceLength || row < 0 || row >= this.fields.nz) return null;
      const { side } = this.boundaryFace, f = this.fields, p = side === 'west' ? along * f.nx : side === 'east' ? along * f.nx + f.nx - 1 : side === 'south' ? along : (f.ny - 1) * f.nx + along;
      return { p, k };
    }
    if (this.mode !== 'map' || !this.rect) return null;
    const bounds = this.canvas.getBoundingClientRect(), r = this.rect, x = event.clientX - bounds.left, y = event.clientY - bounds.top;
    const i = Math.floor((x - r.x) / r.width * this.fields.nx), j = this.fields.ny - 1 - Math.floor((y - r.y) / r.height * this.fields.ny);
    return i < 0 || j < 0 || i >= this.fields.nx || j >= this.fields.ny ? null : j * this.fields.nx + i;
  }
  emitPick(event, paint) { const hit = this.cellAt(event); if (hit !== null) typeof hit === 'number' ? this.onPick(hit, paint) : this.onPick(hit.p, paint && this.editing, false, hit.k); }
  paint(event) { this.emitPick(event, true); }
}
