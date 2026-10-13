const icons = { dig: 'Shovel', fill: 'Blocks', paint: 'Paintbrush', erase: 'Eraser', 'river-add': 'GitMerge', 'river-delete': 'GitMerge' };
const cache = new Map();

export function editCursor(tool) {
  if (!icons[tool]) return 'crosshair';
  if (cache.has(tool)) return cache.get(tool);
  const lucide = globalThis.lucide, icon = lucide?.icons?.[icons[tool]];
  if (!icon) return 'crosshair';
  const svg = lucide.createElement(icon, { width: 40, height: 40, stroke: '#335d69', 'stroke-width': 1.8, fill: 'none' });
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const halo = svg.cloneNode(true); halo.setAttribute('stroke', '#ffffff'); halo.setAttribute('stroke-width', '5');
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.setAttribute('stroke', '#ffffff'); group.setAttribute('stroke-width', '5');
  group.append(...halo.childNodes); svg.prepend(group);
  const background = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  background.setAttribute('cx', '12'); background.setAttribute('cy', '12'); background.setAttribute('r', '11.5');
  background.setAttribute('fill', ['dig', 'fill', 'land'].includes(tool) ? '#fff0cc' : '#dff5ef'); background.setAttribute('stroke', '#ffffff'); background.setAttribute('stroke-width', '1');
  svg.prepend(background);
  const cursor = `url("data:image/svg+xml,${encodeURIComponent(svg.outerHTML)}") 20 20, crosshair`;
  cache.set(tool, cursor); return cursor;
}
