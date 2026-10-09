import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BIO_MODELS } from './biology-catalog.js';
import { SectionView, fieldValue } from './view-section.js';
import { COLOR_MAPS, validRange } from './contour-settings.js';

export const LABELS = { h: '水深 / m', temp: '水温 / °C', salt: '塩分', zeta: '海面高度 / m', u: '東向き流速 U / m s⁻¹', v: '北向き流速 V / m s⁻¹', NO3: '硝酸塩 / mmol N m⁻³', NH4: 'アンモニウム / mmol N m⁻³', phytoplankton: '植物プランクトン / mmol N m⁻³', zooplankton: '動物プランクトン / mmol N m⁻³', LDeN: '大型デトリタス / mmol N m⁻³', SDeN: '小型デトリタス / mmol N m⁻³', chlorophyll: 'クロロフィル / mg Chl m⁻³' };
const palettes = { h: ['#d9efca', '#68b9af', '#245d96'], temp: ['#387ba8', '#72c7b1', '#f0ce73', '#d56b50'], salt: ['#eee2a8', '#57b7a1', '#465983'], zeta: ['#527db6', '#f2f5ee', '#d77960'], u: ['#466eaa', '#eef1df', '#c45c45'], v: ['#466eaa', '#eef1df', '#c45c45'], NO3: ['#e8f2d2', '#7abd8c', '#176b68'], NH4: ['#f5e7bd', '#e49a58', '#a84247'], phytoplankton: ['#e7f1bc', '#62ae67', '#145b50'], zooplankton: ['#e9d7b7', '#c76b55', '#6b415c'], LDeN: ['#ede3c2', '#b28a4b', '#5f5940'], SDeN: ['#e8e7c7', '#7fae83', '#426e70'], chlorophyll: ['#f3e8a7', '#67b999', '#3472a0'] };
export function color(value, min, max, field, colors) {
  const palette = colors ?? palettes[field] ?? palettes.NO3, t = Math.max(0, Math.min(1, (value - min) / (max - min || 1))) * (palette.length - 1), i = Math.min(palette.length - 2, Math.floor(t));
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
        if (this.mode === '3d' && this.editing && (event.buttons & 3)) this.paint3d(event);
        else if (this.mode === '3d') { const hit = this.hitAt3d(event); if (hit) this.onPick(hit.p, false, false, undefined, hit); }
      });
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) this.renderer.domElement.addEventListener(type, () => this.onPick(null, false, true));
      this.renderer.domElement.addEventListener('contextmenu', event => { if (this.editing) event.preventDefault(); });
    }
    this.group = new THREE.Group(); this.scene.add(this.group);
    this.primarySection = new SectionView(canvas, this, (...args) => this.color(...args), LABELS, false);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(container.parentElement);
    canvas.addEventListener('pointerdown', event => {
      if (this.mode !== '3d' && (!this.editing || event.shiftKey || event.button === 1)) { this.panDrag = { x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); return; }
      this.paint(event); canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointerup', () => { this.panDrag = undefined; this.onPick(null, false, true); });
    canvas.addEventListener('pointercancel', () => { this.panDrag = undefined; this.onPick(null, false, true); });
    canvas.addEventListener('lostpointercapture', () => { this.panDrag = undefined; });
    canvas.addEventListener('pointermove', event => {
      if (this.panDrag) {
        const dx = event.clientX - this.panDrag.x, dy = event.clientY - this.panDrag.y;
        if (this.mode === 'section') { this.primarySection.offsetX += dx; this.primarySection.offsetY += dy; }
        else { this.mapPanX += dx * devicePixelRatio; this.mapPanY += dy * devicePixelRatio; }
        this.panDrag = { x: event.clientX, y: event.clientY }; this.draw(); return;
      }
      this.emitPick(event, Boolean(event.buttons));
    });
    canvas.addEventListener('wheel', event => { if (this.mode !== '3d') { event.preventDefault(); this.zoom(event.deltaY < 0 ? 1 : -1); } }, { passive: false });
  }
  home() { this.mapZoom = 1; this.mapPanX = 0; this.mapPanY = 0; if (this.primarySection) { this.primarySection.scale = 1; this.primarySection.offsetX = this.primarySection.offsetY = 0; } this.camera.position.set(12, 12, 15); this.controls?.target.set(0, -1.1, 0); this.controls?.update(); this.draw(); }
  zoomMap(delta) { this.mapZoom = Math.max(1, Math.min(8, this.mapZoom * (delta > 0 ? 1.25 : 0.8))); this.draw(); }
  zoom(delta) {
    if (this.mode === 'section') { this.primarySection.zoom(delta); return; }
    if (this.mode !== '3d' || !this.controls) { this.zoomMap(delta); return; }
    const offset = this.camera.position.clone().sub(this.controls.target);
    offset.setLength(Math.max(this.controls.minDistance, Math.min(this.controls.maxDistance, offset.length() * (delta > 0 ? 0.8 : 1.25))));
    this.camera.position.copy(this.controls.target).add(offset); this.controls.update(); this.draw();
  }
  resize() {
    const bounds = this.container.parentElement.getBoundingClientRect(), width = Math.max(1, bounds.width), height = Math.max(1, bounds.height);
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
    this.renderer?.setSize(width, height); this.canvas.width = Math.round(width * devicePixelRatio); this.canvas.height = Math.round(height * devicePixelRatio);
    if (this.fields) this.draw();
  }
  set(fields, variable, layer, mode, slice, vectors = false) {
    this.fields = fields; this.variable = variable; this.layer = layer; this.mode = mode === '3d' && !this.renderer ? 'map' : mode; this.slice = slice; this.vectors = vectors;
    this.layer = Math.max(0, Math.min(fields.nz - 1, Math.floor(layer)));
    this.slice = Math.max(0, Math.min(fields.ny - 1, Math.floor(slice)));
    const size = fields.nx * fields.ny, values = Float64Array.from({ length: size }, (_, p) => fieldValue(fields, variable, p, this.layer));
    this.values = values; this.min = Infinity; this.max = -Infinity;
    for (let p = 0; p < size; p++) if (fields.mask[p] && Number.isFinite(values[p])) { this.min = Math.min(this.min, values[p]); this.max = Math.max(this.max, values[p]); }
    if (this.companionMode === 'section' && !['h', 'zeta'].includes(variable)) {
      for (let k = 0; k < fields.nz; k++) for (let p = 0; p < size; p++) if (fields.mask[p]) {
        const value = fieldValue(fields, variable, p, k);
        if (Number.isFinite(value)) { this.min = Math.min(this.min, value); this.max = Math.max(this.max, value); }
      }
    }
    if (!Number.isFinite(this.min)) { this.min = 0; this.max = 1; }
    if (this.colorSettings?.auto === false && validRange(this.colorSettings.min, this.colorSettings.max)) { this.min = this.colorSettings.min; this.max = this.colorSettings.max; }
    this.container.hidden = this.mode !== '3d'; this.canvas.hidden = this.mode === '3d';
    const doc = this.canvas.ownerDocument;
    for (const [id, value] of [['legendTitle', LABELS[variable] ?? variable], ['legendMin', this.min.toPrecision(3)], ['legendMax', this.max.toPrecision(3)]]) { const node = doc.getElementById(id); if (node) node.textContent = value; }
    const gradient = doc.getElementById('legendGradient'); if (gradient) gradient.style.background = `linear-gradient(90deg,${this.palette().join(',')})`;
    this.rebuild(); this.draw();
  }
  setNavigation(pan) {
    this.navigationPan = pan;
    if (this.controls) {
      this.controls.mouseButtons.LEFT = pan ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
      this.controls.touches.ONE = pan ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
      this.controls.screenSpacePanning = true;
    }
    this.setEditing(this.requestedEditing);
  }
  palette(variable = this.variable) {
    const colors = COLOR_MAPS[this.colorSettings?.palette]?.colors ?? palettes[variable] ?? palettes.NO3;
    return this.colorSettings?.reverse ? [...colors].reverse() : colors;
  }
  color(value, min, max, variable) { return color(value, min, max, variable, this.palette(variable)); }
  setEditing(enabled) {
    this.requestedEditing = enabled;
    this.editing = Boolean(enabled && !this.navigationPan);
    const cursor = this.editing ? 'crosshair' : 'grab';
    this.canvas.style.cursor = cursor;
    if (this.companion) this.companion.canvas.style.cursor = cursor;
    if (this.renderer) { this.renderer.domElement.style.cursor = cursor; this.controls.enabled = !this.editing; }
  }
  setRivers(rivers = []) {
    this.rivers = rivers;
    if (this.fields) { this.rebuild(); this.draw(); }
  }
  setBoundaryEdit(side, boundary, variable) {
    this.setCompanion(side ? 'boundary' : null, { side, boundary, variable });
  }
  setCompanion(mode, options = {}) {
    const previousSide = this.boundaryEdit;
    this.companionMode = mode; this.companionOptions = options;
    this.boundaryFace = mode === 'boundary' ? options : null;
    this.boundaryEdit = this.boundaryFace?.side ?? null;
    const canvas = this.canvas.ownerDocument.getElementById('sectionCanvas');
    if (canvas && this.companion?.canvas !== canvas) {
      this.companion = new SectionView(canvas, this, (...args) => this.color(...args), LABELS);
      this.observer.observe(canvas.parentElement);
    }
    if (canvas) { canvas.hidden = !mode; canvas.parentElement.hidden = !mode; canvas.style.cursor = this.editing ? 'crosshair' : ''; }
    if (this.fields) { if (previousSide !== this.boundaryEdit) this.rebuild(); this.resize(); }
  }
  cellAt3d(event) {
    return this.hitAt3d(event)?.p ?? null;
  }
  closedEdge(p) {
    if (this.boundaryFace?.boundary?.mode !== 'closed') return false;
    const { nx, ny } = this.fields, i = p % nx, j = Math.floor(p / nx);
    return this.boundaryEdit === 'west' ? i === 0 : this.boundaryEdit === 'east' ? i === nx - 1 : this.boundaryEdit === 'south' ? j === 0 : j === ny - 1;
  }
  hitAt3d(event) {
    if (!this.renderer || !this.group.children.length) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.group.children[0], false)[0];
    if (!hit) return null;
    const face = this.pickFaces[Math.floor(hit.faceIndex / 2)];
    if (!face) return null;
    // depth is meters below sea level. Normals use Three.js axes: x east, y up, z south.
    return { ...face, depth: Math.max(0, -hit.point.y / this.zscale), source: '3d' };
  }
  paint3d(event) { const hit = this.hitAt3d(event); if (hit) this.onPick(hit.p, true, false, event.button === 2 || (event.buttons & 2) ? 'secondary' : 'primary', hit); }
  rebuild() {
    for (const child of [...this.group.children]) { child.geometry?.dispose(); child.material?.dispose(); this.group.remove(child); }
    const f = this.fields, extent = Math.max(f.nx * f.dx, f.ny * f.dy);
    const width = 10 * f.nx * f.dx / extent, height = 10 * f.ny * f.dy / extent, dx = width / f.nx, dy = height / f.ny;
    this.worldHeight = height;
    const maxH = f.h.reduce((max, value) => Math.max(max, value), 1), zscale = 2.2 / maxH;
    this.zscale = zscale; this.pickFaces = [];
    const elevation = p => !f.mask[p] ? 0.04 : this.variable === 'h' ? -f.h[p] * zscale : this.variable === 'zeta' ? f.zeta[p] * zscale : f.z_r ? f.z_r[this.layer * f.nx * f.ny + p] * zscale : -f.h[p] * (1 - (this.layer + 0.5) / f.nz) * zscale;
    const positions = [], colors = [], lines = [];
    for (let j = 0; j < f.ny; j++) for (let i = 0; i < f.nx; i++) {
      const p = j * f.nx + i, x = i * dx - width / 2, z = height / 2 - j * dy;
      const y = elevation(p);
      const c = this.closedEdge(p) ? new THREE.Color('#aeb5b6') : f.mask[p] ? this.color(this.values[p], this.min, this.max, this.variable) : new THREE.Color('#b8c5b8');
      for (const [a, b] of [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]]) { positions.push(x + a * dx, y, z - b * dy); colors.push(c.r, c.g, c.b); }
      this.pickFaces.push({ p, normal: { x: 0, y: 1, z: 0 } });
      const wall = (x1, z1, x2, z2, neighbor, normal) => {
        const lower = elevation(neighbor), shade = c.clone().multiplyScalar(0.8);
        // The solid on the shallower side owns the exposed face; normal points into water.
        const owner = y >= lower ? p : neighbor, adjacent = owner === p ? neighbor : p;
        this.pickFaces.push({ p: owner, neighbor: adjacent, normal: { x: normal.x * (owner === p ? 1 : -1), y: 0, z: normal.z * (owner === p ? 1 : -1) } });
        for (const vertex of [[x1, y, z1], [x2, y, z2], [x2, lower, z2], [x1, y, z1], [x2, lower, z2], [x1, lower, z1]]) {
          positions.push(...vertex); colors.push(shade.r, shade.g, shade.b);
        }
      };
      if (i + 1 < f.nx) wall(x + dx, z, x + dx, z - dy, p + 1, { x: 1, z: 0 });
      if (j + 1 < f.ny) wall(x, z - dy, x + dx, z - dy, p + f.nx, { x: 0, z: -1 });
      if ((i % 4 === 0 && j % 4 === 0) || !f.mask[p]) lines.push(x, y + 0.006, z, x + dx, y + 0.006, z, x, y + 0.006, z, x, y + 0.006, z - dy);
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.group.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    // Exposed water-column faces retain their own layer values when the camera tilts.
    if (!['h', 'zeta'].includes(this.variable)) {
      const vertices = [], shades = [];
      for (let j = 0; j < f.ny; j++) for (let i = 0; i < f.nx; i++) {
        const p = j * f.nx + i; if (!f.mask[p]) continue;
        const x = i * dx - width / 2, z = height / 2 - j * dy;
        const faces = [];
        if (!i || !f.mask[p - 1]) faces.push([x, z, x, z - dy]);
        if (i === f.nx - 1 || !f.mask[p + 1]) faces.push([x + dx, z, x + dx, z - dy]);
        if (!j || !f.mask[p - f.nx]) faces.push([x, z, x + dx, z]);
        if (j === f.ny - 1 || !f.mask[p + f.nx]) faces.push([x, z - dy, x + dx, z - dy]);
        for (let k = 0; k <= this.layer; k++) for (const [x1, z1, x2, z2] of faces) {
          const top = -f.h[p] * (1 - (k + 1) / f.nz) * zscale, bottom = -f.h[p] * (1 - k / f.nz) * zscale;
          const c = this.closedEdge(p) ? new THREE.Color('#aeb5b6') : this.color(fieldValue(f, this.variable, p, k), this.min, this.max, this.variable);
          for (const vertex of [[x1, top, z1], [x2, top, z2], [x2, bottom, z2], [x1, top, z1], [x2, bottom, z2], [x1, bottom, z1]]) { vertices.push(...vertex); shades.push(c.r, c.g, c.b); }
        }
      }
      const volume = new THREE.BufferGeometry(); volume.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); volume.setAttribute('color', new THREE.Float32BufferAttribute(shades, 3));
      this.group.add(new THREE.Mesh(volume, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    }
    this.container.dataset.sectionRow = this.companionMode === 'section' ? String(this.slice) : '';
    this.canvas.dataset.sectionRow = this.container.dataset.sectionRow;
    if (this.companionMode === 'section') {
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.11), new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide, depthTest: false }));
      halo.rotation.x = -Math.PI / 2; halo.position.set(0, 0.13, height / 2 - (this.slice + 0.5) * dy); halo.renderOrder = 3; this.group.add(halo);
      const trace = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.06), new THREE.MeshBasicMaterial({ color: '#bb3269', side: THREE.DoubleSide, depthTest: false }));
      trace.rotation.x = -Math.PI / 2;
      trace.position.set(0, 0.13, height / 2 - (this.slice + 0.5) * dy);
      trace.renderOrder = 4; this.group.add(trace);
    }
    if (this.boundaryEdit) {
      const edge = [], y = 0.12;
      if (this.boundaryEdit === 'west' || this.boundaryEdit === 'east') {
        const x = this.boundaryEdit === 'west' ? -width / 2 : width / 2;
        for (let j = 0; j < f.ny; j++) { const z = height / 2 - j * dy; edge.push(x, y, z, x, y, z - dy); }
      } else {
        const z = this.boundaryEdit === 'south' ? height / 2 : -height / 2;
        for (let i = 0; i < f.nx; i++) { const x = -width / 2 + i * dx; edge.push(x, y, z, x + dx, y, z); }
      }
      const edgeGeometry = new THREE.BufferGeometry(); edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(edge, 3));
      this.group.add(new THREE.LineSegments(edgeGeometry, new THREE.LineBasicMaterial({ color: '#b44c36', linewidth: 3 })));
    }
    const wire = new THREE.BufferGeometry(); wire.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    this.group.add(new THREE.LineSegments(wire, new THREE.LineBasicMaterial({ color: '#536f64', transparent: true, opacity: 0.2 })));
    const boxGeometry = new THREE.BoxGeometry(width, 2.2, height), box = new THREE.EdgesGeometry(boxGeometry); boxGeometry.dispose();
    const outline = new THREE.LineSegments(box, new THREE.LineBasicMaterial({ color: '#9baea3', transparent: true, opacity: 0.6 })); outline.position.y = -1.1; this.group.add(outline);
    for (const river of this.rivers ?? []) {
      const p = river.landCell ?? river.cell;
      if (!Number.isInteger(p) || p < 0 || p >= f.nx * f.ny) continue;
      const marker = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.24, 12), new THREE.MeshBasicMaterial({ color: this.selectedRiver === p ? '#ef2020' : '#b12d61', depthTest: false }));
      marker.rotation.z = Math.PI; marker.position.set((p % f.nx + 0.5) * dx - width / 2, 0.22, height / 2 - (Math.floor(p / f.nx) + 0.5) * dy); marker.renderOrder = 2; this.group.add(marker);
    }
  }
  render3d() { if (this.renderer) this.renderer.render(this.scene, this.camera); }
  draw() {
    if (!this.fields) return;
    if (this.mode === '3d') this.render3d();
    else if (this.mode === 'section') this.primarySection.draw('section');
    else this.draw2d();
    this.companion?.draw(this.companionMode, this.companionOptions);
  }
  drawBoundaryFace() { this.companion?.draw(this.companionMode, this.companionOptions); }
  draw2d() {
    const ctx = this.canvas.getContext('2d'), f = this.fields, w = this.canvas.width, h = this.canvas.height, dpr = devicePixelRatio;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
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
      const value = fieldValue(f, this.variable, p, k);
      ctx.fillStyle = this.closedEdge(p) ? '#aeb5b6' : f.mask[p] ? this.color(value, this.min, this.max, this.variable).getStyle() : '#b8c5b8';
      const depth = f.h[p] / maxDepth;
      const y = section ? y0 + (1 - (j + 1) / f.nz) * rh * depth : y0 + (f.ny - 1 - j) * rh / f.ny;
      ctx.fillRect(x0 + i * rw / f.nx, y, Math.ceil(rw / f.nx), Math.ceil(section ? rh * depth / f.nz : rh / f.ny));
    }
    if (!section && this.mode === 'map' && rw / f.nx >= 26 * dpr && rh / f.ny >= 18 * dpr) {
      ctx.save(); ctx.font = `${10 * dpr}px ui-monospace, SFMono-Regular, Consolas, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let j = 0; j < f.ny; j++) for (let i = 0; i < f.nx; i++) {
        const p = j * f.nx + i; if (!f.mask[p]) continue;
        const value = fieldValue(f, this.variable, p, this.layer);
        const x = x0 + (i + 0.5) * rw / f.nx, y = y0 + (f.ny - j - 0.5) * rh / f.ny, label = Number.isFinite(value) ? Number(value.toPrecision(3)).toString() : '—';
        ctx.lineWidth = 3 * dpr; ctx.strokeStyle = 'rgba(255,255,255,0.88)'; ctx.strokeText(label, x, y); ctx.fillStyle = '#172a29'; ctx.fillText(label, x, y);
      }
      ctx.restore();
    }
    if (this.vectors && !section && this.mode === 'map') this.drawVectors(ctx, x0, y0, rw, rh, dpr);
    if (!section) for (const river of this.rivers ?? []) {
      const p = river.landCell ?? river.cell; if (!Number.isInteger(p) || p < 0 || p >= f.nx * f.ny) continue;
      const x = x0 + (p % f.nx + 0.5) * rw / f.nx, y = y0 + (f.ny - Math.floor(p / f.nx) - 0.5) * rh / f.ny;
      ctx.beginPath(); ctx.arc(x, y, 5 * dpr, 0, Math.PI * 2); ctx.fillStyle = this.selectedRiver === p ? '#ef2020' : '#b12d61'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 * dpr; ctx.stroke();
    }
    if (!section && this.mode === 'map' && this.boundaryEdit) {
      ctx.save(); ctx.strokeStyle = '#b44c36'; ctx.lineWidth = 4 * dpr;
      ctx.beginPath();
      if (this.boundaryEdit === 'west') { ctx.moveTo(x0, y0); ctx.lineTo(x0, y0 + rh); }
      if (this.boundaryEdit === 'east') { ctx.moveTo(x0 + rw, y0); ctx.lineTo(x0 + rw, y0 + rh); }
      if (this.boundaryEdit === 'south') { ctx.moveTo(x0, y0 + rh); ctx.lineTo(x0 + rw, y0 + rh); }
      if (this.boundaryEdit === 'north') { ctx.moveTo(x0, y0); ctx.lineTo(x0 + rw, y0); }
      ctx.stroke(); ctx.restore();
    }
    if (!section && this.companionMode === 'section') {
      const y = y0 + (f.ny - this.slice - 0.5) * rh / f.ny;
      ctx.save(); ctx.strokeStyle = '#bb3269'; ctx.lineWidth = 3 * dpr;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + rw, y); ctx.stroke();
      ctx.fillStyle = '#bb3269'; ctx.font = `bold ${12 * dpr}px system-ui`; ctx.fillText('A', x0 + 4 * dpr, y - 5 * dpr); ctx.fillText('A′', x0 + rw - 20 * dpr, y - 5 * dpr); ctx.restore();
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
    if (this.mode === 'section') return this.primarySection.hitAt(event);
    if (this.mode !== 'map' || !this.rect) return null;
    const bounds = this.canvas.getBoundingClientRect(), r = this.rect, x = event.clientX - bounds.left, y = event.clientY - bounds.top;
    const i = Math.floor((x - r.x) / r.width * this.fields.nx), j = this.fields.ny - 1 - Math.floor((y - r.y) / r.height * this.fields.ny);
    return i < 0 || j < 0 || i >= this.fields.nx || j >= this.fields.ny ? null : j * this.fields.nx + i;
  }
  emitPick(event, paint) { const hit = this.cellAt(event); if (hit !== null) typeof hit === 'number' ? this.onPick(hit, paint && this.editing) : this.onPick(hit.p, paint && this.editing, false, hit.k); }
  paint(event) { this.emitPick(event, true); }
}
