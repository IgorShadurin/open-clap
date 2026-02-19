import { NextResponse } from "next/server";

import type {
  ApiErrorShape,
  ValidatePathRequest,
} from "../../../../../shared/contracts/path";
import { createApiError } from "../../../../lib/api-error";
import { validatePathExists } from "../../../../lib/path-validation";

export async function POST(request: Request): Promise<NextResponse> {
  let body: ValidatePathRequest;

  try {
    body = (await request.json()) as ValidatePathRequest;
  } catch {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_JSON", "Invalid JSON request body"),
      { status: 400 },
    );
  }

  if (!body || typeof body.path !== "string") {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_PATH", "Field `path` must be a string"),
      { status: 400 },
    );
  }

  try {
    const result = await validatePathExists(body.path);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError(
        "PATH_VALIDATION_FAILED",
        "Path validation failed",
        message,
      ),
      { status: 400 },
    );
  }
}
