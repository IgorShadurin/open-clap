import { NextResponse } from "next/server";

import type { ApiErrorShape } from "../../../../../shared/contracts";
import { createApiError } from "../../../../lib/api-error";
import { deleteReusableList } from "../../../../lib/lists-service";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ listId: string }> },
): Promise<NextResponse> {
  const { listId } = await context.params;
  try {
    await deleteReusableList(listId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError("LIST_DELETE_FAILED", "Failed to delete list", message),
      { status: 400 },
    );
  }
}
