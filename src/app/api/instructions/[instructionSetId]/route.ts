import { NextResponse } from "next/server";

import type {
  ApiErrorShape,
  InstructionSetEntity,
  InstructionSetTreeItem,
} from "../../../../../shared/contracts";
import { createApiError } from "../../../../lib/api-error";
import {
  deleteInstructionSet,
  getInstructionSetById,
  updateInstructionSet,
} from "../../../../lib/instructions-service";

interface UpdateInstructionSetBody {
  description?: string | null;
  mainPageTasksVisible?: boolean;
  linkedInstructionSetIds?: string[];
  name?: string;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ instructionSetId: string }> },
): Promise<NextResponse> {
  const { instructionSetId } = await context.params;
  const set = await getInstructionSetById(instructionSetId);
  if (!set) {
    return new NextResponse(null, { status: 404 });
  }

  return NextResponse.json<InstructionSetTreeItem>(set, { status: 200 });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ instructionSetId: string }> },
): Promise<NextResponse> {
  const { instructionSetId } = await context.params;
  let body: UpdateInstructionSetBody;
  try {
    body = (await request.json()) as UpdateInstructionSetBody;
  } catch {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_JSON", "Invalid JSON request body"),
      { status: 400 },
    );
  }

  if (
    body.linkedInstructionSetIds !== undefined &&
    !Array.isArray(body.linkedInstructionSetIds)
  ) {
    return NextResponse.json<ApiErrorShape>(
      createApiError(
        "INVALID_PAYLOAD",
        "Field `linkedInstructionSetIds` must be an array of string IDs",
      ),
      { status: 400 },
    );
  }

  const hasInvalidLinkedId =
    body.linkedInstructionSetIds !== undefined &&
    !body.linkedInstructionSetIds.every((id) => typeof id === "string");
  if (hasInvalidLinkedId) {
    return NextResponse.json<ApiErrorShape>(
      createApiError(
        "INVALID_PAYLOAD",
        "All values in `linkedInstructionSetIds` must be strings",
      ),
      { status: 400 },
    );
  }

  try {
    const set = await updateInstructionSet(instructionSetId, body);
    return NextResponse.json<InstructionSetEntity>(set, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError("INSTRUCTION_SET_UPDATE_FAILED", "Failed to update instruction set", message),
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ instructionSetId: string }> },
): Promise<NextResponse> {
  const { instructionSetId } = await context.params;
  try {
    await deleteInstructionSet(instructionSetId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError("INSTRUCTION_SET_DELETE_FAILED", "Failed to delete instruction set", message),
      { status: 400 },
    );
  }
}
