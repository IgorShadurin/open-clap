import { loadPromptTemplate } from "./prompt-templates";

export interface HistoryMessage {
  createdAt: Date;
  text: string;
}

const PLACEHOLDER_REGEX = /\{\{([a-zA-Z0-9_]+)\}\}/g;

const HISTORY_NOTICE = loadPromptTemplate("prompts/history-context-notice.md");
const HISTORY_ENTRY_TEMPLATE = loadPromptTemplate("prompts/history-entry-template.md");
const HISTORY_SEPARATOR = loadPromptTemplate("prompts/history-separator.md");

function renderTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replaceAll(PLACEHOLDER_REGEX, (_match, key: string) => values[key] ?? "");
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

  const renderedMessages = messages
    .map(
      (message, index) =>
        renderTemplate(HISTORY_ENTRY_TEMPLATE, {
          createdAt: message.createdAt.toISOString(),
          index: String(index + 1),
          text: message.text,
        }),
    )
    .join(`\n\n${HISTORY_SEPARATOR}\n\n`);

  return `${HISTORY_NOTICE}\n\n${renderedMessages}`;
}
