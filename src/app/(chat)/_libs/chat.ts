export const conversationIdFromPath = (pathname: string): string | null =>
  pathname.match(/^\/chat\/([\w-]+)$/)?.[1] || null;

export const chatUrl = (path: string, temporary: boolean) =>
  `${path}${temporary ? "?temporary=1" : ""}`;
