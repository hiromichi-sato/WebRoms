// Transfer only standalone snapshot buffers, never the live WASM heap.
export function stateTransfers(state) {
  const buffers = new Set();
  for (const value of Object.values(state ?? {})) {
    if (ArrayBuffer.isView(value)) buffers.add(value.buffer);
    else if (value && typeof value === 'object') for (const buffer of stateTransfers(value)) buffers.add(buffer);
  }
  return [...buffers];
}

export class RunPacing {
  constructor(now = performance.now()) { this.lastDisplay = now - 250; this.lastYield = now; }
  displayDue(now, pending) { return !pending && now - this.lastDisplay >= 250; }
  displayed(now) { this.lastDisplay = now; }
  yieldDue(now) { return now - this.lastYield >= 50; }
  yielded(now) { this.lastYield = now; }
}
