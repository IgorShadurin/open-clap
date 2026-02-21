import { NextResponse } from "next/server";

import type { ApiErrorShape } from "../../../../../shared/contracts";
import { createApiError } from "../../../../lib/api-error";
import { reorderInstructionSets } from "../../../../lib/instructions-service";

interface ReorderInstructionSetsBody {
  orderedIds: string[];
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: ReorderInstructionSetsBody;
  try {
    body = (await request.json()) as ReorderInstructionSetsBody;
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
    await reorderInstructionSets(body.orderedIds);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError(
        "INSTRUCTION_SET_REORDER_FAILED",
        "Failed to reorder instruction sets",
        message,
      ),
      { status: 400 },
    );
  }
}
