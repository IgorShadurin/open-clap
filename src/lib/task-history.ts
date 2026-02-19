export interface HistoryMessage {
  createdAt: Date;
  text: string;
}

export function selectRecentMessages(
  messages: HistoryMessage[],
  limit: number,
): HistoryMessage[] {
  if (!Number.isFinite(limit) || limit < 1) {
    return [];
  }

  return messages
    .slice()
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, Math.floor(limit))
    .reverse();
}

export function buildHistoryBundle(messages: HistoryMessage[]): string {
  if (messages.length < 1) {
    return "";
  }

  return messages
    .map(
      (message, index) =>
        `Message ${index + 1} (${message.createdAt.toISOString()}):\n${message.text}`,
    )
    .join("\n\n---\n\n");
}
