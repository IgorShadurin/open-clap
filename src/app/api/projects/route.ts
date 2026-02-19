import { NextResponse } from "next/server";

import type { ApiErrorShape, ProjectEntity } from "../../../../shared/contracts";
import { createApiError } from "../../../lib/api-error";
import { createProject, listProjects } from "../../../lib/entities-service";

interface CreateProjectBody {
  metadata?: string;
  name: string;
  path: string;
}

export async function GET(): Promise<NextResponse> {
  const projects = await listProjects();
  return NextResponse.json<ProjectEntity[]>(projects, { status: 200 });
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: CreateProjectBody;
  try {
    body = (await request.json()) as CreateProjectBody;
  } catch {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_JSON", "Invalid JSON request body"),
      { status: 400 },
    );
  }

  if (!body || typeof body.name !== "string" || typeof body.path !== "string") {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_PAYLOAD", "Fields `name` and `path` are required"),
      { status: 400 },
    );
  }

  try {
    const project = await createProject(body);
    return NextResponse.json<ProjectEntity>(project, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError("PROJECT_CREATE_FAILED", "Failed to create project", message),
      { status: 400 },
    );
  }
}
