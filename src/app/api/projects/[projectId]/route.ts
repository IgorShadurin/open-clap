import { NextResponse } from "next/server";

import type { ApiErrorShape, ProjectEntity } from "../../../../../shared/contracts";
import { createApiError } from "../../../../lib/api-error";
import { deleteProject, updateProject } from "../../../../lib/entities-service";

interface UpdateProjectBody {
  mainPageCollapsed?: boolean;
  mainPageSubprojectsVisible?: boolean;
  mainPageTasksVisible?: boolean;
  metadata?: string;
  name?: string;
  path?: string;
  paused?: boolean;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
): Promise<NextResponse> {
  const { projectId } = await context.params;
  let body: UpdateProjectBody;
  try {
    body = (await request.json()) as UpdateProjectBody;
  } catch {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_JSON", "Invalid JSON request body"),
      { status: 400 },
    );
  }

  try {
    const project = await updateProject(projectId, body);
    return NextResponse.json<ProjectEntity>(project, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError("PROJECT_UPDATE_FAILED", "Failed to update project", message),
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
): Promise<NextResponse> {
  const { projectId } = await context.params;

  try {
    await deleteProject(projectId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError("PROJECT_DELETE_FAILED", "Failed to delete project", message),
      { status: 400 },
    );
  }
}
