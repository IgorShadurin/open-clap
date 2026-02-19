import { NextResponse } from "next/server";

import type {
  ApiErrorShape,
  TaskResponseEntity,
} from "../../../../../../shared/contracts";
import { createApiError } from "../../../../../lib/api-error";
import { listTaskResponses } from "../../../../../lib/entities-service";

interface ListTaskResponsesResponse {
  responses: TaskResponseEntity[];
}

export async function GET(
  request: Request,
  context: { params: Promise<{ taskId: string }> },
): Promise<NextResponse> {
  const { taskId } = await context.params;
  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit ? Number.parseInt(rawLimit, 10) : 20;

  if (Number.isNaN(limit) || limit < 1) {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_LIMIT", "Query parameter `limit` must be a positive integer"),
      { status: 400 },
    );
  }

  try {
    const responses = await listTaskResponses(taskId, limit);
    return NextResponse.json<ListTaskResponsesResponse>(
      { responses },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError("TASK_RESPONSE_LIST_FAILED", "Failed to list task responses", message),
      { status: 400 },
    );
  }
}
