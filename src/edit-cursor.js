const icons = { dig: 'Shovel', fill: 'Blocks', land: 'Mountain', water: 'Waves', paint: 'Paintbrush', erase: 'Eraser', 'river-add': 'Droplets', 'river-delete': 'Eraser' };
const cache = new Map();

export function editCursor(tool) {
  if (!icons[tool]) return 'crosshair';
  if (cache.has(tool)) return cache.get(tool);
  const lucide = globalThis.lucide, icon = lucide?.icons?.[icons[tool]];
  if (!icon) return 'crosshair';
  const svg = lucide.createElement(icon, { width: 32, height: 32, stroke: '#17675b', 'stroke-width': 2, fill: 'none' });
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const halo = svg.cloneNode(true); halo.setAttribute('stroke', '#ffffff'); halo.setAttribute('stroke-width', '5');
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.setAttribute('stroke', '#ffffff'); group.setAttribute('stroke-width', '5');
  group.append(...halo.childNodes); svg.prepend(group);
  const cursor = `url("data:image/svg+xml,${encodeURIComponent(svg.outerHTML)}") 16 16, crosshair`;
  cache.set(tool, cursor); return cursor;
}
