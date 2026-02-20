import { NextResponse } from "next/server";

import type { FetchDaemonSettingsResponse } from "../../../../../shared/contracts";
import { getDaemonRuntimeSettingsSnapshot } from "../../../../lib/daemon-settings";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const knownRevision = url.searchParams.get("revision")?.trim() ?? "";
  const snapshot = await getDaemonRuntimeSettingsSnapshot();

  const changed = knownRevision !== snapshot.revision;
  const response: FetchDaemonSettingsResponse = changed
    ? {
        changed: true,
        revision: snapshot.revision,
        settings: snapshot.settings,
      }
    : {
        changed: false,
        revision: snapshot.revision,
      };

  return NextResponse.json<FetchDaemonSettingsResponse>(response, { status: 200 });
}
