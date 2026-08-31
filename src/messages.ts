export const MESSAGE_PAGE_SIZE = 50;

export function regenerationIndex(
  messages: readonly { id: string; role: string }[],
  messageId?: string,
): number {
  if (messageId)
    return messages.findIndex((message) => message.id === messageId && message.role === "user");
  for (let index = messages.length - 1; index >= 0; index--)
    if (messages[index].role === "user") return index;
  return -1;
}
