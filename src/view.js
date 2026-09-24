import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const LABELS = { h: '水深 / m', temp: '水温 / °C', salt: '塩分', zeta: '海面高度 / m' };
const palettes = { h: ['#d9efca', '#68b9af', '#245d96'], temp: ['#387ba8', '#72c7b1', '#f0ce73', '#d56b50'], salt: ['#eee2a8', '#57b7a1', '#465983'], zeta: ['#527db6', '#f2f5ee', '#d77960'] };
export function color(value, min, max, field) {
  const palette = palettes[field], t = Math.max(0, Math.min(1, (value - min) / (max - min || 1))) * (palette.length - 1), i = Math.min(palette.length - 2, Math.floor(t));
  return new THREE.Color(palette[i]).lerp(new THREE.Color(palette[i + 1]), t - i);
}
export class OceanView {
  constructor(container, canvas, onPick) {
    this.container = container; this.canvas = canvas; this.onPick = onPick; this.mode = '3d';
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#edf3f1');
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    try { this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); }
    catch { this.mode = 'map'; this.renderer = null; }
    if (this.renderer) {
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); container.append(this.renderer.domElement);
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.minDistance = 5; this.controls.maxDistance = 35; this.controls.maxPolarAngle = Math.PI * 0.49;
      this.controls.addEventListener('change', () => this.render3d()); this.home();
    }
    this.group = new THREE.Group(); this.scene.add(this.group);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(container.parentElement);
    canvas.addEventListener('pointerdown', event => { this.paint(event); canvas.setPointerCapture(event.pointerId); });
    canvas.addEventListener('pointermove', event => {
      const cell = this.cellAt(event); if (cell !== null) this.onPick(cell, Boolean(event.buttons));
    });
  }
  home() { this.camera.position.set(10, 10, 12); this.controls?.target.set(0, -0.6, 0); this.controls?.update(); this.render3d(); }
  resize() {
    const { width, height } = this.container.parentElement.getBoundingClientRect();
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
    this.renderer?.setSize(width, height); this.canvas.width = Math.round(width * devicePixelRatio); this.canvas.height = Math.round(height * devicePixelRatio);
    if (this.fields) this.draw();
  }
  set(fields, variable, layer, mode, slice) {
    this.fields = fields; this.variable = variable; this.layer = layer; this.mode = mode === '3d' && !this.renderer ? 'map' : mode; this.slice = slice;
    const size = fields.nx * fields.ny, values = ['temp', 'salt'].includes(variable) ? fields[variable].subarray(layer * size, (layer + 1) * size) : fields[variable];
    this.values = values; this.min = Infinity; this.max = -Infinity;
    for (let p = 0; p < size; p++) if (fields.mask[p]) { this.min = Math.min(this.min, values[p]); this.max = Math.max(this.max, values[p]); }
    this.container.hidden = this.mode !== '3d'; this.canvas.hidden = this.mode === '3d';
    document.querySelector('#legendTitle').textContent = LABELS[variable];
    document.querySelector('#legendMin').textContent = this.min.toFixed(variable === 'zeta' ? 3 : 1);
    document.querySelector('#legendMax').textContent = this.max.toFixed(variable === 'zeta' ? 3 : 1);
    document.querySelector('#legendGradient').style.background = `linear-gradient(90deg,${palettes[variable].join(',')})`;
    this.rebuild(); this.draw();
  }
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
    const wire = new THREE.BufferGeometry(); wire.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    this.group.add(new THREE.LineSegments(wire, new THREE.LineBasicMaterial({ color: '#536f64', transparent: true, opacity: 0.2 })));
    const box = new THREE.EdgesGeometry(new THREE.BoxGeometry(width, 2.2, height));
    const outline = new THREE.LineSegments(box, new THREE.LineBasicMaterial({ color: '#9baea3', transparent: true, opacity: 0.6 })); outline.position.y = -1.1; this.group.add(outline);
  }
  render3d() { if (this.renderer) this.renderer.render(this.scene, this.camera); }
  draw() { if (this.mode === '3d') { this.render3d(); return; } this.draw2d(); }
  draw2d() {
    const ctx = this.canvas.getContext('2d'), f = this.fields, w = this.canvas.width, h = this.canvas.height, dpr = devicePixelRatio;
    ctx.fillStyle = '#edf3f1'; ctx.fillRect(0, 0, w, h);
    const pad = 52 * dpr, availableW = w - pad * 2, availableH = h - pad * 2;
    const aspect = f.nx * f.dx / (f.ny * f.dy), mapW = Math.min(availableW, availableH * aspect), mapH = mapW / aspect;
    const section = this.mode === 'section', rw = section ? availableW : mapW, rh = section ? availableH : mapH;
    const x0 = (w - rw) / 2, y0 = (h - rh) / 2;
    this.rect = { x: x0 / dpr, y: y0 / dpr, width: rw / dpr, height: rh / dpr };
    const maxDepth = Math.max(...f.h);
    if (section) { ctx.fillStyle = '#b8c5b8'; ctx.fillRect(x0, y0, rw, rh); }
    for (let j = 0; j < (section ? f.nz : f.ny); j++) for (let i = 0; i < f.nx; i++) {
      const p = (section ? this.slice : j) * f.nx + i, k = section ? j : this.layer;
      const value = ['temp', 'salt'].includes(this.variable) ? f[this.variable][k * f.nx * f.ny + p] : f[this.variable][p];
      ctx.fillStyle = f.mask[p] ? color(value, this.min, this.max, this.variable).getStyle() : '#b8c5b8';
      const depth = f.h[p] / maxDepth;
      const y = section ? y0 + (1 - (j + 1) / f.nz) * rh * depth : y0 + (f.ny - 1 - j) * rh / f.ny;
      ctx.fillRect(x0 + i * rw / f.nx, y, Math.ceil(rw / f.nx), Math.ceil(section ? rh * depth / f.nz : rh / f.ny));
    }
    ctx.strokeStyle = '#8ba597'; ctx.lineWidth = dpr; ctx.strokeRect(x0, y0, rw, rh);
  }
  cellAt(event) {
    if (this.mode !== 'map' || !this.rect) return null;
    const bounds = this.canvas.getBoundingClientRect(), r = this.rect, x = event.clientX - bounds.left, y = event.clientY - bounds.top;
    const i = Math.floor((x - r.x) / r.width * this.fields.nx), j = this.fields.ny - 1 - Math.floor((y - r.y) / r.height * this.fields.ny);
    return i < 0 || j < 0 || i >= this.fields.nx || j >= this.fields.ny ? null : j * this.fields.nx + i;
  }
  paint(event) { const cell = this.cellAt(event); if (cell !== null) this.onPick(cell, true); }
}
