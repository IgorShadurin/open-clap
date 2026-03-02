export interface ListTokenQueryMatch {
  end: number;
  query: string;
  start: number;
}

const LIST_ITEM_CHARS = /^[a-z0-9-]*$/u;
const LIST_ITEM_CHAR = /[a-z0-9-]/u;
const LIST_PREFIX = "$list-";

export function findListTokenQueryAtCursor(
  text: string,
  cursor: number,
): ListTokenQueryMatch | null {
  const safeCursor = Math.max(0, Math.min(cursor, text.length));
  let tokenStart = text.lastIndexOf(LIST_PREFIX, safeCursor);

  while (tokenStart >= 0) {
    const queryStart = tokenStart + LIST_PREFIX.length;
    const leftQuery = text.slice(queryStart, safeCursor);
    if (!LIST_ITEM_CHARS.test(leftQuery)) {
      tokenStart = text.lastIndexOf(LIST_PREFIX, tokenStart - 1);
      continue;
    }

    let tokenEnd = safeCursor;
    while (tokenEnd < text.length && LIST_ITEM_CHAR.test(text[tokenEnd] ?? "")) {
      tokenEnd += 1;
    }

    return {
      end: tokenEnd,
      query: leftQuery,
      start: tokenStart,
    };
  }

  return null;
}

export function filterListIdsForQuery(
  listIds: readonly string[],
  query: string,
): string[] {
  const normalized = query.trim().toLowerCase();
  const unique = Array.from(new Set(listIds.map((id) => id.trim()).filter((id) => id.length > 0)));

  if (!normalized) {
    return unique;
  }

  const startsWith = unique.filter((id) => id.toLowerCase().startsWith(normalized));
  const contains = unique.filter(
    (id) => !id.toLowerCase().startsWith(normalized) && id.toLowerCase().includes(normalized),
  );

  return [...startsWith, ...contains];
}

export function replaceRangeWithListToken(
  text: string,
  match: ListTokenQueryMatch,
  listId: string,
): string {
  const insertion = `$list-${listId}`;
  return `${text.slice(0, match.start)}${insertion}${text.slice(match.end)}`;
}
