import { NextResponse } from "next/server";

import type { ApiErrorShape, ReusableListItemEntity } from "../../../../../../shared/contracts";
import { createApiError } from "../../../../../lib/api-error";
import { createReusableListItem } from "../../../../../lib/lists-service";

interface CreateListItemBody {
  value?: string;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ listId: string }> },
): Promise<NextResponse> {
  const { listId } = await context.params;
  let body: CreateListItemBody;
  try {
    body = (await request.json()) as CreateListItemBody;
  } catch {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_JSON", "Invalid JSON request body"),
      { status: 400 },
    );
  }

  if (!body || typeof body.value !== "string" || body.value.trim().length < 1) {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_PAYLOAD", "Field `value` is required"),
      { status: 400 },
    );
  }

  try {
    const item = await createReusableListItem({
      listId,
      value: body.value,
    });
    return NextResponse.json<ReusableListItemEntity>(item, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError("LIST_ITEM_CREATE_FAILED", "Failed to create list item", message),
      { status: 400 },
    );
  }
}
