import { NextResponse } from "next/server";

import type { ApiErrorShape } from "../../../../../../../shared/contracts";
import { createApiError } from "../../../../../../lib/api-error";
import { reorderReusableListItems } from "../../../../../../lib/lists-service";

interface ReorderListItemsBody {
  orderedIds: string[];
}

export async function POST(
  request: Request,
  context: { params: Promise<{ listId: string }> },
): Promise<NextResponse> {
  const { listId } = await context.params;
  let body: ReorderListItemsBody;
  try {
    body = (await request.json()) as ReorderListItemsBody;
  } catch {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_JSON", "Invalid JSON request body"),
      { status: 400 },
    );
  }

  if (!Array.isArray(body.orderedIds) || body.orderedIds.length < 1) {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_PAYLOAD", "Field `orderedIds` is required"),
      { status: 400 },
    );
  }

  try {
    await reorderReusableListItems({
      listId,
      orderedIds: body.orderedIds,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError("LIST_ITEM_REORDER_FAILED", "Failed to reorder list items", message),
      { status: 400 },
    );
  }
}
