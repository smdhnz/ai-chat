export const ASSISTANT_CONTINUE_MARKER = "<<<CONTINUE_ASSISTANT_MESSAGE>>>";
export const MESSAGE_PAGE_SIZE = 50;

export function newestMessagePage<T>(rows: readonly T[]) {
  return {
    messages: rows.slice(0, MESSAGE_PAGE_SIZE).reverse(),
    hasMore: rows.length > MESSAGE_PAGE_SIZE,
  };
}

export function parseAssistantReply(text: string): {
  content: string;
  continueGeneration: boolean;
} {
  const lines = text.trim().split("\n");
  const continueGeneration = lines.at(-1)?.trim() === ASSISTANT_CONTINUE_MARKER;
  return {
    content: (continueGeneration ? lines.slice(0, -1).join("\n") : text).trim(),
    continueGeneration,
  };
}

export function lastUserIndex(messages: readonly { role: string }[]): number {
  for (let index = messages.length - 1; index >= 0; index--)
    if (messages[index].role === "user") return index;
  return -1;
}

export function regenerationIndex(
  messages: readonly { id: string; role: string }[],
  messageId?: string,
): number {
  return messageId
    ? messages.findIndex((message) => message.id === messageId && message.role === "user")
    : lastUserIndex(messages);
}
