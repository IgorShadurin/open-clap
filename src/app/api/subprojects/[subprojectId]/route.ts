import { NextResponse } from "next/server";

import type { ApiErrorShape, SubprojectEntity } from "../../../../../shared/contracts";
import { createApiError } from "../../../../lib/api-error";
import {
  deleteSubproject,
  updateSubproject,
} from "../../../../lib/entities-service";

interface UpdateSubprojectBody {
  metadata?: string;
  name?: string;
  path?: string;
  paused?: boolean;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ subprojectId: string }> },
): Promise<NextResponse> {
  const { subprojectId } = await context.params;
  let body: UpdateSubprojectBody;
  try {
    body = (await request.json()) as UpdateSubprojectBody;
  } catch {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_JSON", "Invalid JSON request body"),
      { status: 400 },
    );
  }

  try {
    const subproject = await updateSubproject(subprojectId, body);
    return NextResponse.json<SubprojectEntity>(subproject, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError(
        "SUBPROJECT_UPDATE_FAILED",
        "Failed to update subproject",
        message,
      ),
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ subprojectId: string }> },
): Promise<NextResponse> {
  const { subprojectId } = await context.params;
  try {
    await deleteSubproject(subprojectId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError(
        "SUBPROJECT_DELETE_FAILED",
        "Failed to delete subproject",
        message,
      ),
      { status: 400 },
    );
  }
}
