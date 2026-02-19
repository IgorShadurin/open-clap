import { NextResponse } from "next/server";

import type {
  ApiErrorShape,
  ClaimTasksRequest,
  ClaimTasksResponse,
} from "../../../../../../shared/contracts";
import { createApiError } from "../../../../../lib/api-error";
import { claimNextTasks } from "../../../../../lib/daemon-api";

export async function POST(request: Request): Promise<NextResponse> {
  let body: ClaimTasksRequest;
  try {
    body = (await request.json()) as ClaimTasksRequest;
  } catch {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_JSON", "Invalid JSON request body"),
      { status: 400 },
    );
  }

  if (!body || typeof body.limit !== "number") {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_LIMIT", "Field `limit` must be a number"),
      { status: 400 },
    );
  }

  const tasks = await claimNextTasks(body.limit);
  return NextResponse.json<ClaimTasksResponse>({ tasks }, { status: 200 });
}
