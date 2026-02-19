import { NextResponse } from "next/server";

import type { ApiErrorShape, SettingRecord } from "../../../../shared/contracts";
import { createApiError } from "../../../lib/api-error";
import { getSettingsRecords, upsertSetting } from "../../../lib/settings-store";

interface UpsertSettingBody {
  key: string;
  value: string;
}

export async function GET(): Promise<NextResponse> {
  const settings = await getSettingsRecords();
  return NextResponse.json<SettingRecord[]>(settings, { status: 200 });
}

export async function PUT(request: Request): Promise<NextResponse> {
  let body: UpsertSettingBody;
  try {
    body = (await request.json()) as UpsertSettingBody;
  } catch {
    return NextResponse.json<ApiErrorShape>(
      createApiError("INVALID_JSON", "Invalid JSON request body"),
      { status: 400 },
    );
  }

  if (!body || typeof body.key !== "string" || typeof body.value !== "string") {
    return NextResponse.json<ApiErrorShape>(
      createApiError(
        "INVALID_PAYLOAD",
        "Fields `key` and `value` are required strings",
      ),
      { status: 400 },
    );
  }

  try {
    const updated = await upsertSetting(body.key, body.value);
    return NextResponse.json<SettingRecord>(updated, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError("SETTING_UPDATE_FAILED", "Failed to update setting", message),
      { status: 400 },
    );
  }
}
