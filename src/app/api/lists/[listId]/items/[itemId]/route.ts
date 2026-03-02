import { NextResponse } from "next/server";

import type { ApiErrorShape, ReusableListItemEntity } from "../../../../../../../shared/contracts";
import { createApiError } from "../../../../../../lib/api-error";
import { deleteReusableListItem, updateReusableListItem } from "../../../../../../lib/lists-service";

interface UpdateListItemBody {
  value?: string;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ itemId: string; listId: string }> },
): Promise<NextResponse> {
  const { itemId, listId } = await context.params;

  let body: UpdateListItemBody;
  try {
    body = (await request.json()) as UpdateListItemBody;
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
    const item = await updateReusableListItem({
      itemId,
      listId,
      value: body.value,
    });
    return NextResponse.json<ReusableListItemEntity>(item, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError("LIST_ITEM_UPDATE_FAILED", "Failed to update list item", message),
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ itemId: string; listId: string }> },
): Promise<NextResponse> {
  const { itemId, listId } = await context.params;
  try {
    await deleteReusableListItem({
      itemId,
      listId,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError("LIST_ITEM_DELETE_FAILED", "Failed to delete list item", message),
      { status: 400 },
    );
  }
}
