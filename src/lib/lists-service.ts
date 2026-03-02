import { prisma } from "./prisma";
import { publishAppSync } from "./live-sync";
import {
  extractListIdsFromText,
  getTaskListTypeValidationError,
  replaceListTokensInText,
} from "./list-tokens";
import type { ReusableListEntity, ReusableListItemEntity } from "../../shared/contracts";

const LIST_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function toListItemEntity(input: {
  createdAt: Date;
  id: string;
  listId: string;
  priority: number;
  updatedAt: Date;
  value: string;
}): ReusableListItemEntity {
  return {
    createdAt: input.createdAt.toISOString(),
    id: input.id,
    listId: input.listId,
    priority: input.priority,
    updatedAt: input.updatedAt.toISOString(),
    value: input.value,
  };
}

function toListEntity(input: {
  createdAt: Date;
  id: string;
  items: Array<{
    createdAt: Date;
    id: string;
    listId: string;
    priority: number;
    updatedAt: Date;
    value: string;
  }>;
  updatedAt: Date;
}): ReusableListEntity {
  return {
    createdAt: input.createdAt.toISOString(),
    id: input.id,
    items: input.items.map(toListItemEntity),
    updatedAt: input.updatedAt.toISOString(),
  };
}

function normalizeListId(listId: string): string {
  return listId.trim();
}

function assertValidListId(listId: string): void {
  if (!LIST_ID_PATTERN.test(listId)) {
    throw new Error("List id must contain only lowercase letters, numbers, and single hyphens");
  }
}

function normalizeListItemValue(value: string): string {
  return value.trim();
}

function assertListItemValue(value: string): void {
  if (value.length < 1) {
    throw new Error("List item cannot be empty");
  }
}

export function parseListItemsFromTextarea(value: string): string[] {
  return value
    .split(/\r?\n/u)
    .map((line) => normalizeListItemValue(line))
    .filter((line) => line.length > 0);
}

function deduplicateMissingListIds(
  referencedListIds: readonly string[],
  existingListIds: readonly string[],
): string[] {
  const existing = new Set(existingListIds);
  return referencedListIds.filter((id, index) => !existing.has(id) && referencedListIds.indexOf(id) === index);
}

async function getListItemValuesByListIds(
  listIds: readonly string[],
): Promise<Map<string, string[]>> {
  if (listIds.length < 1) {
    return new Map<string, string[]>();
  }

  const rows = await prisma.reusableListItem.findMany({
    orderBy: [{ listId: "asc" }, { priority: "asc" }, { createdAt: "asc" }],
    select: { listId: true, value: true },
    where: { listId: { in: [...listIds] } },
  });

  const valuesByListId = new Map<string, string[]>();
  for (const row of rows) {
    const existing = valuesByListId.get(row.listId);
    if (existing) {
      existing.push(row.value);
      continue;
    }
    valuesByListId.set(row.listId, [row.value]);
  }

  return valuesByListId;
}

export async function assertTaskTextListReferencesExist(taskText: string): Promise<void> {
  const listTypeValidationError = getTaskListTypeValidationError(taskText);
  if (listTypeValidationError) {
    throw new Error(listTypeValidationError);
  }

  const referencedListIds = extractListIdsFromText(taskText);
  if (referencedListIds.length < 1) {
    return;
  }

  const existing = await prisma.reusableList.findMany({
    select: { id: true },
    where: { id: { in: referencedListIds } },
  });
  const missing = deduplicateMissingListIds(
    referencedListIds,
    existing.map((row) => row.id),
  );

  if (missing.length > 0) {
    throw new Error(`Unknown list reference(s): ${missing.map((id) => `$list-${id}`).join(", ")}`);
  }
}

export async function replaceTaskTextListReferences(taskText: string): Promise<string> {
  const referencedListIds = extractListIdsFromText(taskText);
  if (referencedListIds.length < 1) {
    return taskText;
  }

  const valuesByListId = await getListItemValuesByListIds(referencedListIds);
  return replaceListTokensInText(taskText, valuesByListId);
}

export async function listReusableLists(): Promise<ReusableListEntity[]> {
  const rows = await prisma.reusableList.findMany({
    include: {
      items: {
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: [{ id: "asc" }],
  });
  return rows.map(toListEntity);
}

export async function createReusableList(input: {
  id: string;
  items: string[];
}): Promise<ReusableListEntity> {
  const normalizedId = normalizeListId(input.id);
  assertValidListId(normalizedId);

  if (input.items.length < 1) {
    throw new Error("List must include at least one item");
  }

  const normalizedItems = input.items.map((item) => normalizeListItemValue(item));
  if (normalizedItems.some((item) => item.length < 1)) {
    throw new Error("List item cannot be empty");
  }

  const created = await prisma.reusableList.create({
    data: {
      id: normalizedId,
      items: {
        create: normalizedItems.map((item, index) => ({
          priority: index,
          value: item,
        })),
      },
    },
    include: {
      items: {
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  publishAppSync("list.created");
  return toListEntity(created);
}

export async function deleteReusableList(listId: string): Promise<void> {
  await prisma.reusableList.delete({
    where: { id: normalizeListId(listId) },
  });
  publishAppSync("list.deleted");
}

export async function createReusableListItem(input: {
  listId: string;
  value: string;
}): Promise<ReusableListItemEntity> {
  const normalizedValue = normalizeListItemValue(input.value);
  assertListItemValue(normalizedValue);
  const normalizedListId = normalizeListId(input.listId);

  const maxPriority = await prisma.reusableListItem.findFirst({
    orderBy: [{ priority: "desc" }],
    select: { priority: true },
    where: { listId: normalizedListId },
  });

  const item = await prisma.reusableListItem.create({
    data: {
      listId: normalizedListId,
      priority: maxPriority ? maxPriority.priority + 1 : 0,
      value: normalizedValue,
    },
  });
  publishAppSync("list.item_created");
  return toListItemEntity(item);
}

async function assertListItemBelongsToList(input: {
  itemId: string;
  listId: string;
}): Promise<void> {
  const item = await prisma.reusableListItem.findUnique({
    select: { listId: true },
    where: { id: input.itemId },
  });

  if (!item || item.listId !== input.listId) {
    throw new Error("List item not found");
  }
}

export async function updateReusableListItem(input: {
  itemId: string;
  listId: string;
  value: string;
}): Promise<ReusableListItemEntity> {
  const normalizedValue = normalizeListItemValue(input.value);
  assertListItemValue(normalizedValue);
  const normalizedListId = normalizeListId(input.listId);
  await assertListItemBelongsToList({
    itemId: input.itemId,
    listId: normalizedListId,
  });

  const item = await prisma.reusableListItem.update({
    data: {
      value: normalizedValue,
    },
    where: { id: input.itemId },
  });
  publishAppSync("list.item_updated");
  return toListItemEntity(item);
}

export async function deleteReusableListItem(input: {
  itemId: string;
  listId: string;
}): Promise<void> {
  const normalizedListId = normalizeListId(input.listId);
  await assertListItemBelongsToList({
    itemId: input.itemId,
    listId: normalizedListId,
  });

  await prisma.$transaction(async (tx) => {
    await tx.reusableListItem.delete({
      where: { id: input.itemId },
    });

    const remaining = await tx.reusableListItem.findMany({
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      select: { id: true },
      where: { listId: normalizedListId },
    });

    for (let index = 0; index < remaining.length; index += 1) {
      await tx.reusableListItem.update({
        data: { priority: index },
        where: { id: remaining[index]!.id },
      });
    }
  });

  publishAppSync("list.item_deleted");
}

export async function reorderReusableListItems(input: {
  listId: string;
  orderedIds: string[];
}): Promise<void> {
  const normalizedListId = normalizeListId(input.listId);
  const existing = await prisma.reusableListItem.findMany({
    select: { id: true },
    where: {
      id: { in: input.orderedIds },
      listId: normalizedListId,
    },
  });
  if (existing.length !== input.orderedIds.length) {
    throw new Error("One or more list items were not found");
  }

  await prisma.$transaction(
    input.orderedIds.map((itemId, index) =>
      prisma.reusableListItem.update({
        data: { priority: index },
        where: { id: itemId },
      }),
    ),
  );
  publishAppSync("list.item_reordered");
}
