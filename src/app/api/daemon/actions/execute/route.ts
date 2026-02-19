import { NextResponse } from "next/server";

import type {
  ApiErrorShape,
  CompleteImmediateActionRequest,
  CompleteImmediateActionResponse,
} from "../../../../../../shared/contracts";
import { createApiError } from "../../../../../lib/api-error";
import { completeImmediateAction } from "../../../../../lib/daemon-api";

export async function POST(request: Request): Promise<NextResponse> {
  let body: CompleteImmediateActionRequest;
  try {
    body = (await request.json()) as CompleteImmediateActionRequest;
  } catch {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_JSON", "Invalid JSON request body"),
      { status: 400 },
    );
  }

  if (!body || typeof body.actionId !== "string") {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_ACTION_ID", "Field `actionId` must be a string"),
      { status: 400 },
    );
  }

  const completed = await completeImmediateAction(body.actionId);
  return NextResponse.json<CompleteImmediateActionResponse>(
    { completed },
    { status: 200 },
  );
}
