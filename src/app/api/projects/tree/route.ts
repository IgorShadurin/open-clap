import { NextResponse } from "next/server";

import { listProjectTree } from "../../../../lib/entities-service";

export async function GET(): Promise<NextResponse> {
  const tree = await listProjectTree();
  return NextResponse.json(tree, { status: 200 });
}
