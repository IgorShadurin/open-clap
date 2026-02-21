import { NextResponse } from "next/server";

import type { ApiErrorShape } from "../../../../../../shared/contracts";
import { createApiError } from "../../../../../lib/api-error";
import { reorderInstructionTasks } from "../../../../../lib/instructions-service";

interface ReorderInstructionTasksBody {
  instructionSetId: string;
  orderedIds: string[];
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: ReorderInstructionTasksBody;
  try {
    body = (await request.json()) as ReorderInstructionTasksBody;
  } catch {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_JSON", "Invalid JSON request body"),
      { status: 400 },
    );
  }

  if (
    !body ||
    typeof body.instructionSetId !== "string" ||
    !Array.isArray(body.orderedIds) ||
    body.orderedIds.length < 1
  ) {
    return NextResponse.json<ApiErrorShape>(
      createApiError(
        "INVALID_PAYLOAD",
        "Fields `instructionSetId` and `orderedIds` are required",
      ),
      { status: 400 },
    );
  }

  try {
    await reorderInstructionTasks(body.instructionSetId, body.orderedIds);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError(
        "INSTRUCTION_TASK_REORDER_FAILED",
        "Failed to reorder instruction tasks",
        message,
      ),
      { status: 400 },
    );
  }
}
