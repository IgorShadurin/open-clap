import { NextResponse } from "next/server";

import type { ApiErrorShape, ReusableListEntity } from "../../../../shared/contracts";
import { createApiError } from "../../../lib/api-error";
import {
  createReusableList,
  listReusableLists,
  parseListItemsFromTextarea,
} from "../../../lib/lists-service";

interface CreateListBody {
  id?: string;
  items?: string[];
  itemsText?: string;
}

function normalizeItemsInput(body: CreateListBody): string[] {
  if (Array.isArray(body.items)) {
    return body.items
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => item.length > 0);
  }

  if (typeof body.itemsText === "string") {
    return parseListItemsFromTextarea(body.itemsText);
  }

  return [];
}

export async function GET(): Promise<NextResponse> {
  const lists = await listReusableLists();
  return NextResponse.json<ReusableListEntity[]>(lists, { status: 200 });
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: CreateListBody;
  try {
    body = (await request.json()) as CreateListBody;
  } catch {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_JSON", "Invalid JSON request body"),
      { status: 400 },
    );
  }

  const listId = typeof body.id === "string" ? body.id.trim() : "";
  const items = normalizeItemsInput(body);
  if (!listId || items.length < 1) {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_PAYLOAD", "Fields `id` and at least one list item are required"),
      { status: 400 },
    );
  }

  try {
    const created = await createReusableList({
      id: listId,
      items,
    });
    return NextResponse.json<ReusableListEntity>(created, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError("LIST_CREATE_FAILED", "Failed to create list", message),
      { status: 400 },
    );
  }
}
