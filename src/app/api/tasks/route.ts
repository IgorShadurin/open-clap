import { NextResponse } from "next/server";

import type { ApiErrorShape, TaskEntity } from "../../../../shared/contracts";
import { createApiError } from "../../../lib/api-error";
import { createTask, listTasks } from "../../../lib/entities-service";

interface CreateTaskBody {
  includePreviousContext?: boolean;
  model?: string;
  metadata?: string;
  previousContextMessages?: number;
  projectId: string;
  reasoning?: string;
  subprojectId?: string | null;
  text: string;
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId") ?? undefined;
  const subprojectRaw = url.searchParams.get("subprojectId");
  const subprojectId =
    subprojectRaw === null
      ? undefined
      : subprojectRaw === "null"
        ? null
        : subprojectRaw;
  const tasks = await listTasks({
    projectId,
    subprojectId,
  });
  return NextResponse.json<TaskEntity[]>(tasks, { status: 200 });
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: CreateTaskBody;
  try {
    body = (await request.json()) as CreateTaskBody;
  } catch {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_JSON", "Invalid JSON request body"),
      { status: 400 },
    );
  }

      if (
        !body ||
        typeof body.projectId !== "string" ||
        typeof body.text !== "string"
      ) {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_PAYLOAD", "Fields `projectId` and `text` are required"),
      { status: 400 },
    );
  }

  try {
      const task = await createTask(body);
    return NextResponse.json<TaskEntity>(task, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError("TASK_CREATE_FAILED", "Failed to create task", message),
      { status: 400 },
    );
  }
}
