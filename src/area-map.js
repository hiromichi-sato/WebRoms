const TILE = 256;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const mercatorY = lat => {
  const radians = clamp(lat, -85, 85) * Math.PI / 180;
  return (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2;
};
const fromMercatorY = y => Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI;

export class AreaMap {
  constructor(canvas, onBounds) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.onBounds = onBounds;
    this.center = { lon: 138, lat: 36 }; this.zoom = 5; this.bounds = null; this.mode = 'select'; this.tiles = new Map();
    canvas.addEventListener('pointerdown', event => this.pointerDown(event));
    canvas.addEventListener('pointermove', event => this.pointerMove(event));
    canvas.addEventListener('pointerup', event => this.pointerUp(event));
    canvas.addEventListener('pointercancel', () => { this.drag = undefined; });
    canvas.addEventListener('wheel', event => { event.preventDefault(); this.changeZoom(event.deltaY < 0 ? 1 : -1); }, { passive: false });
    new ResizeObserver(() => this.draw()).observe(canvas.parentElement);
  }
  world(lon, lat, zoom = this.zoom) {
    const scale = TILE * 2 ** zoom;
    return { x: (lon + 180) / 360 * scale, y: mercatorY(lat) * scale };
  }
  geographic(x, y, zoom = this.zoom) {
    const scale = TILE * 2 ** zoom;
    return { lon: x / scale * 360 - 180, lat: fromMercatorY(y / scale) };
  }
  getPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  pointerDown(event) {
    const point = this.getPoint(event); this.drag = { start: point, last: point, mode: this.mode };
    this.canvas.setPointerCapture(event.pointerId);
  }
  pointerMove(event) {
    if (!this.drag) return;
    const point = this.getPoint(event);
    if (this.drag.mode === 'pan') {
      const center = this.world(this.center.lon, this.center.lat);
      center.x -= point.x - this.drag.last.x; center.y -= point.y - this.drag.last.y;
      this.center = this.geographic(center.x, center.y); this.drag.last = point;
    } else this.selectionPixel = { a: this.drag.start, b: point };
    this.draw();
  }
  pointerUp(event) {
    if (!this.drag) return;
    if (this.drag.mode === 'select') {
      const point = this.getPoint(event), start = this.drag.start;
      if (Math.hypot(point.x - start.x, point.y - start.y) > 12) {
        const center = this.world(this.center.lon, this.center.lat), rect = this.canvas.getBoundingClientRect();
        const a = this.geographic(center.x + start.x - rect.width / 2, center.y + start.y - rect.height / 2);
        const b = this.geographic(center.x + point.x - rect.width / 2, center.y + point.y - rect.height / 2);
        this.bounds = { west: Math.min(a.lon, b.lon), east: Math.max(a.lon, b.lon), south: Math.min(a.lat, b.lat), north: Math.max(a.lat, b.lat) };
        this.onBounds(this.bounds);
      }
    }
    this.drag = undefined; this.selectionPixel = undefined; this.draw();
  }
  setMode(mode) { this.mode = mode; this.canvas.style.cursor = mode === 'pan' ? 'grab' : 'crosshair'; }
  setBounds(bounds) { this.bounds = bounds; this.draw(); }
  changeZoom(delta) {
    this.zoom = clamp(this.zoom + delta, 2, 15);
    this.draw();
  }
  draw() {
    const rect = this.canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    const dpr = Math.min(devicePixelRatio || 1, 2), width = rect.width, height = rect.height;
    if (this.canvas.width !== Math.round(width * dpr) || this.canvas.height !== Math.round(height * dpr)) { this.canvas.width = width * dpr; this.canvas.height = height * dpr; }
    const ctx = this.ctx; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#e8f0ed'; ctx.fillRect(0, 0, width, height);
    const center = this.world(this.center.lon, this.center.lat), left = center.x - width / 2, top = center.y - height / 2, scale = 2 ** this.zoom;
    const minX = Math.floor(left / TILE), maxX = Math.floor((left + width) / TILE), minY = Math.floor(top / TILE), maxY = Math.floor((top + height) / TILE);
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const wrappedX = ((x % scale) + scale) % scale;
      if (y < 0 || y >= scale) continue;
      const key = `${this.zoom}/${wrappedX}/${y}`;
      if (!this.tiles.has(key)) {
        const image = new Image(); image.onload = () => this.draw(); image.onerror = () => this.tiles.delete(key);
        image.src = `https://tile.openstreetmap.org/${key}.png`; this.tiles.set(key, image);
      }
      const image = this.tiles.get(key);
      if (image.complete && image.naturalWidth) ctx.drawImage(image, x * TILE - left, y * TILE - top, TILE, TILE);
    }
    ctx.fillStyle = '#33483e'; ctx.font = '12px system-ui';
    if (this.bounds) {
      const a = this.world(this.bounds.west, this.bounds.north), b = this.world(this.bounds.east, this.bounds.south);
      const x = a.x - left, y = a.y - top;
      ctx.fillStyle = '#087c6930'; ctx.strokeStyle = '#087c69'; ctx.lineWidth = 2;
      ctx.fillRect(x, y, b.x - a.x, b.y - a.y); ctx.strokeRect(x, y, b.x - a.x, b.y - a.y);
    }
    if (this.selectionPixel) {
      const { a, b } = this.selectionPixel, x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
      ctx.fillStyle = '#087c6930'; ctx.strokeStyle = '#087c69'; ctx.lineWidth = 2;
      ctx.fillRect(x, y, Math.abs(a.x - b.x), Math.abs(a.y - b.y)); ctx.strokeRect(x, y, Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    }
  }
}
