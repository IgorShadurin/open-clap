import { NextResponse } from "next/server";

import type {
  AcknowledgeImmediateActionRequest,
  AcknowledgeImmediateActionResponse,
  ApiErrorShape,
} from "../../../../../../shared/contracts";
import { createApiError } from "../../../../../lib/api-error";
import { acknowledgeImmediateAction } from "../../../../../lib/daemon-api";

export async function POST(request: Request): Promise<NextResponse> {
  let body: AcknowledgeImmediateActionRequest;
  try {
    body = (await request.json()) as AcknowledgeImmediateActionRequest;
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

  const acknowledged = await acknowledgeImmediateAction(body.actionId);
  return NextResponse.json<AcknowledgeImmediateActionResponse>(
    { acknowledged },
    { status: 200 },
  );
}
