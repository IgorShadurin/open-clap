import { NextResponse } from "next/server";

import type { ApiErrorShape } from "../../../../../shared/contracts";
import { createApiError } from "../../../../../lib/api-error";
import { clearProjectTasks } from "../../../../../lib/entities-service";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
): Promise<NextResponse> {
  const { projectId } = await context.params;

  try {
    await clearProjectTasks(projectId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError("PROJECT_TASKS_DELETE_FAILED", "Failed to clear project tasks", message),
      { status: 400 },
    );
  }
}
