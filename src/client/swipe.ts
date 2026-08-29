export function horizontalSwipe(start: { x: number; y: number }, end: { x: number; y: number }) {
  const x = end.x - start.x;
  const y = end.y - start.y;
  return Math.abs(x) >= 60 && Math.abs(x) > Math.abs(y) * 1.2 ? Math.sign(x) : 0;
}
