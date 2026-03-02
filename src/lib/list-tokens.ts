const LIST_TOKEN_PATTERN = /\$list-([a-z0-9]+(?:-[a-z0-9]+)*)\b/g;

export function toListToken(listId: string): string {
  return `$list-${listId}`;
}

export function extractListIdsFromText(text: string): string[] {
  const matcher = new RegExp(LIST_TOKEN_PATTERN);
  const found = new Set<string>();
  let match = matcher.exec(text);

  while (match) {
    const id = match[1];
    if (id) {
      found.add(id);
    }
    match = matcher.exec(text);
  }

  return [...found];
}

export function getTaskListTypeValidationError(taskText: string): string | null {
  const referencedListIds = extractListIdsFromText(taskText);
  if (referencedListIds.length <= 1) {
    return null;
  }

  return `Task can reference only one list type. Found: ${referencedListIds
    .map((id) => toListToken(id))
    .join(", ")}`;
}

function formatListItems(items: readonly string[]): string {
  return items.join(", ");
}

export function replaceListTokensInText(
  text: string,
  itemValuesByListId: ReadonlyMap<string, readonly string[]>,
): string {
  return text.replaceAll(LIST_TOKEN_PATTERN, (fullToken, listId: string) => {
    const values = itemValuesByListId.get(listId);
    if (!values || values.length < 1) {
      return fullToken;
    }

    return formatListItems(values);
  });
}
