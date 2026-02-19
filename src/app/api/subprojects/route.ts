import { NextResponse } from "next/server";

import type { ApiErrorShape, SubprojectEntity } from "../../../../shared/contracts";
import { createApiError } from "../../../lib/api-error";
import { createSubproject, listSubprojects } from "../../../lib/entities-service";

interface CreateSubprojectBody {
  metadata?: string;
  name: string;
  path: string;
  projectId: string;
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId") ?? undefined;
  const subprojects = await listSubprojects(projectId);
  return NextResponse.json<SubprojectEntity[]>(subprojects, { status: 200 });
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: CreateSubprojectBody;
  try {
    body = (await request.json()) as CreateSubprojectBody;
  } catch {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_JSON", "Invalid JSON request body"),
      { status: 400 },
    );
  }

  if (
    !body ||
    typeof body.name !== "string" ||
    typeof body.path !== "string" ||
    typeof body.projectId !== "string"
  ) {
    return NextResponse.json<ApiErrorShape>(
      createApiError(
        "INVALID_PAYLOAD",
        "Fields `name`, `path`, and `projectId` are required",
      ),
      { status: 400 },
    );
  }

  try {
    const subproject = await createSubproject(body);
    return NextResponse.json<SubprojectEntity>(subproject, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError(
        "SUBPROJECT_CREATE_FAILED",
        "Failed to create subproject",
        message,
      ),
      { status: 400 },
    );
  }
}
