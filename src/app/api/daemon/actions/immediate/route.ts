import { NextResponse } from "next/server";

import type { FetchImmediateActionsResponse } from "../../../../../../shared/contracts";
import { fetchPendingImmediateActions } from "../../../../../lib/daemon-api";

export async function GET(): Promise<NextResponse> {
  const actions = await fetchPendingImmediateActions();
  return NextResponse.json<FetchImmediateActionsResponse>(
    { actions },
    { status: 200 },
  );
}
