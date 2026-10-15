export function zoomScale(current, direction) {
  return Math.max(.25, Math.min(32, current * (direction > 0 ? 1.25 : .8)));
}
export function zoomOffset(offset, anchor, origin, ratio) {
  return anchor - origin - (anchor - origin - offset) * ratio;
}
