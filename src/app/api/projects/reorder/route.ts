import { NextResponse } from "next/server";

import type { ApiErrorShape } from "../../../../../shared/contracts";
import { createApiError } from "../../../../lib/api-error";
import { moveProject, reorderProjects } from "../../../../lib/entities-service";

interface ReorderBody {
  direction?: "down" | "up";
  orderedIds?: string[];
  projectId?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: ReorderBody;
  try {
    body = (await request.json()) as ReorderBody;
  } catch {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_JSON", "Invalid JSON request body"),
      { status: 400 },
    );
  }

  try {
    if (Array.isArray(body.orderedIds) && body.orderedIds.length > 0) {
      await reorderProjects(body.orderedIds);
      return new NextResponse(null, { status: 204 });
    }

    if (body.projectId && body.direction) {
      await moveProject(body.projectId, body.direction);
      return new NextResponse(null, { status: 204 });
    }

    return NextResponse.json<ApiErrorShape>(
      createApiError(
        "INVALID_PAYLOAD",
        "Provide `orderedIds` or both `projectId` + `direction`",
      ),
      { status: 400 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError("PROJECT_REORDER_FAILED", "Failed to reorder projects", message),
      { status: 400 },
    );
  }
}
