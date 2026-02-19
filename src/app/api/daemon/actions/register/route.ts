import { NextResponse } from "next/server";

import type {
  ApiErrorShape,
  RegisterImmediateActionRequest,
  RegisterImmediateActionResponse,
} from "../../../../../../shared/contracts";
import { createApiError } from "../../../../../lib/api-error";
import { registerImmediateAction } from "../../../../../lib/daemon-api";

export async function POST(request: Request): Promise<NextResponse> {
  let body: RegisterImmediateActionRequest;
  try {
    body = (await request.json()) as RegisterImmediateActionRequest;
  } catch {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_JSON", "Invalid JSON request body"),
      { status: 400 },
    );
  }

  if (!body || typeof body.taskId !== "string") {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_TASK_ID", "Field `taskId` must be a string"),
      { status: 400 },
    );
  }

  const result = await registerImmediateAction(body.taskId, body.type ?? "force_stop");
  return NextResponse.json<RegisterImmediateActionResponse>(result, {
    status: 200,
  });
}
