import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import { DELETE as deleteList } from "../../src/app/api/lists/[listId]/route";
import { PATCH as updateListItem, DELETE as deleteListItem } from "../../src/app/api/lists/[listId]/items/[itemId]/route";
import { POST as createListItem } from "../../src/app/api/lists/[listId]/items/route";
import { POST as reorderListItems } from "../../src/app/api/lists/[listId]/items/reorder/route";
import { GET as listLists, POST as createList } from "../../src/app/api/lists/route";
import { prisma } from "../../src/lib/prisma";

async function resetDatabase(): Promise<void> {
  await prisma.reusableListItem.deleteMany();
  await prisma.reusableList.deleteMany();
}

test.after(async () => {
  await resetDatabase();
});

test("lists API supports create/item edit/reorder/delete", async () => {
  await resetDatabase();

  const createResponse = await createList(
    new Request("http://localhost/api/lists", {
      body: JSON.stringify({
        id: "country-codes",
        itemsText: "ar-SA\n\n ca \ncs\n",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
  assert.equal(createResponse.status, 201);
  const created = (await createResponse.json()) as { items: Array<{ id: string; value: string }> };
  assert.deepEqual(
    created.items.map((item) => item.value),
    ["ar-SA", "ca", "cs"],
  );

  const createItemResponse = await createListItem(
    new Request("http://localhost/api/lists/country-codes/items", {
      body: JSON.stringify({ value: "de" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
    { params: Promise.resolve({ listId: "country-codes" }) },
  );
  assert.equal(createItemResponse.status, 201);
  const createdItem = (await createItemResponse.json()) as { id: string };

  const secondItemId = created.items[1]!.id;
  const updateItemResponse = await updateListItem(
    new Request(`http://localhost/api/lists/country-codes/items/${secondItemId}`, {
      body: JSON.stringify({ value: "ca-ES" }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    }),
    { params: Promise.resolve({ itemId: secondItemId, listId: "country-codes" }) },
  );
  assert.equal(updateItemResponse.status, 200);

  const reorderResponse = await reorderListItems(
    new Request("http://localhost/api/lists/country-codes/items/reorder", {
      body: JSON.stringify({
        orderedIds: [createdItem.id, created.items[0]!.id, secondItemId, created.items[2]!.id],
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
    { params: Promise.resolve({ listId: "country-codes" }) },
  );
  assert.equal(reorderResponse.status, 204);

  const rowsAfterReorder = await prisma.reusableListItem.findMany({
    orderBy: [{ priority: "asc" }],
    where: { listId: "country-codes" },
  });
  assert.deepEqual(
    rowsAfterReorder.map((item) => item.value),
    ["de", "ar-SA", "ca-ES", "cs"],
  );

  const deleteItemResponse = await deleteListItem(
    new Request(`http://localhost/api/lists/country-codes/items/${secondItemId}`, {
      method: "DELETE",
    }),
    { params: Promise.resolve({ itemId: secondItemId, listId: "country-codes" }) },
  );
  assert.equal(deleteItemResponse.status, 204);

  const rowsAfterDelete = await prisma.reusableListItem.findMany({
    orderBy: [{ priority: "asc" }],
    where: { listId: "country-codes" },
  });
  assert.deepEqual(
    rowsAfterDelete.map((item) => item.priority),
    [0, 1, 2],
  );

  const listResponse = await listLists();
  assert.equal(listResponse.status, 200);
  const listed = (await listResponse.json()) as Array<{ id: string; items: Array<{ value: string }> }>;
  assert.equal(listed.length, 1);
  assert.equal(listed[0]!.id, "country-codes");

  const deleteResponse = await deleteList(
    new Request("http://localhost/api/lists/country-codes", {
      method: "DELETE",
    }),
    { params: Promise.resolve({ listId: "country-codes" }) },
  );
  assert.equal(deleteResponse.status, 204);

  const remaining = await prisma.reusableList.findMany();
  assert.equal(remaining.length, 0);
});

test("lists API validates list id and reorder payload", async () => {
  await resetDatabase();

  const numericIdResponse = await createList(
    new Request("http://localhost/api/lists", {
      body: JSON.stringify({
        id: "ios-langs-2026",
        itemsText: "en-US",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
  assert.equal(numericIdResponse.status, 201);

  const invalidIdResponse = await createList(
    new Request("http://localhost/api/lists", {
      body: JSON.stringify({
        id: "CountryCodes",
        itemsText: "a",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
  assert.equal(invalidIdResponse.status, 400);

  await prisma.reusableList.create({
    data: {
      id: "alphabet",
      items: {
        create: [
          { priority: 0, value: "a" },
          { priority: 1, value: "b" },
        ],
      },
    },
  });

  const badReorderResponse = await reorderListItems(
    new Request("http://localhost/api/lists/alphabet/items/reorder", {
      body: JSON.stringify({ orderedIds: ["missing-id"] }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
    { params: Promise.resolve({ listId: "alphabet" }) },
  );
  assert.equal(badReorderResponse.status, 400);
});
