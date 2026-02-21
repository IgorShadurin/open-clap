import { NextResponse } from "next/server";

import type {
  ApiErrorShape,
  InstructionSetEntity,
  InstructionSetTreeItem,
} from "../../../../shared/contracts";
import { createApiError } from "../../../lib/api-error";
import {
  createInstructionSet,
  listInstructionSetsTree,
} from "../../../lib/instructions-service";

interface CreateInstructionSetBody {
  description?: string;
  name: string;
}

export async function GET(): Promise<NextResponse> {
  const sets = await listInstructionSetsTree();
  return NextResponse.json<InstructionSetTreeItem[]>(sets, { status: 200 });
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: CreateInstructionSetBody;
  try {
    body = (await request.json()) as CreateInstructionSetBody;
  } catch {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_JSON", "Invalid JSON request body"),
      { status: 400 },
    );
  }

  if (!body || typeof body.name !== "string" || body.name.trim().length < 1) {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_PAYLOAD", "Field `name` is required"),
      { status: 400 },
    );
  }

  try {
    const set = await createInstructionSet({
      description: body.description,
      name: body.name,
    });
    return NextResponse.json<InstructionSetEntity>(set, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError("INSTRUCTION_SET_CREATE_FAILED", "Failed to create instruction set", message),
      { status: 400 },
    );
  }
}
