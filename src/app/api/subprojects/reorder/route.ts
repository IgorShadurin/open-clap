import { NextResponse } from "next/server";

import type { ApiErrorShape } from "../../../../../shared/contracts";
import { createApiError } from "../../../../lib/api-error";
import {
  moveSubproject,
  reorderSubprojects,
} from "../../../../lib/entities-service";

interface ReorderSubprojectsBody {
  direction?: "down" | "up";
  orderedIds?: string[];
  projectId?: string;
  subprojectId?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: ReorderSubprojectsBody;
  try {
    body = (await request.json()) as ReorderSubprojectsBody;
  } catch {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_JSON", "Invalid JSON request body"),
      { status: 400 },
    );
  }

  try {
    if (
      Array.isArray(body.orderedIds) &&
      typeof body.projectId === "string" &&
      body.orderedIds.length > 0
    ) {
      await reorderSubprojects(body.projectId, body.orderedIds);
      return new NextResponse(null, { status: 204 });
    }

    if (body.subprojectId && body.direction) {
      await moveSubproject(body.subprojectId, body.direction);
      return new NextResponse(null, { status: 204 });
    }

    return NextResponse.json<ApiErrorShape>(
      createApiError(
        "INVALID_PAYLOAD",
        "Provide `orderedIds` + `projectId` or `subprojectId` + `direction`",
      ),
      { status: 400 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError(
        "SUBPROJECT_REORDER_FAILED",
        "Failed to reorder subprojects",
        message,
      ),
      { status: 400 },
    );
  }
}
