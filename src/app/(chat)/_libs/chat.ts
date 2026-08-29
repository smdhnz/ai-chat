export function horizontalSwipe(start: { x: number; y: number }, end: { x: number; y: number }) {
  const x = end.x - start.x;
  const y = end.y - start.y;
  return Math.abs(x) >= 60 && Math.abs(x) > Math.abs(y) * 1.2 ? Math.sign(x) : 0;
}

export const conversationIdFromPath = (pathname: string): string | null =>
  pathname.match(/^\/chat\/([\w-]+)$/)?.[1] || null;

export const chatUrl = (path: string, temporary: boolean) =>
  `${path}${temporary ? "?temporary=1" : ""}`;
