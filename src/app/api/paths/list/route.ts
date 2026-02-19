import { NextResponse } from "next/server";

import type {
  ApiErrorShape,
  PathSortMode,
} from "../../../../../shared/contracts";
import { createApiError } from "../../../../lib/api-error";
import { listDirectories } from "../../../../lib/path-listing";
import { getSettingValue } from "../../../../lib/settings-store";

interface ListPathsBody {
  basePath?: string;
  sort?: PathSortMode;
}

interface ListPathsResponse {
  basePath: string;
  directories: Array<{
    modifiedAt: string;
    name: string;
    path: string;
  }>;
  sort: PathSortMode;
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: ListPathsBody = {};
  try {
    body = (await request.json()) as ListPathsBody;
  } catch {
    body = {};
  }

  try {
    const effectiveSort = (body.sort ??
      (await getSettingValue("project_path_sort_mode"))) as PathSortMode;
    const defaultBasePath = await getSettingValue("default_project_base_path");
    const basePath = body.basePath?.trim() ? body.basePath : defaultBasePath;

    if (effectiveSort !== "modified" && effectiveSort !== "name") {
      throw new Error("Sort mode must be `modified` or `name`");
    }

    const directories = await listDirectories({
      basePath,
      sort: effectiveSort,
    });

    return NextResponse.json<ListPathsResponse>(
      {
        basePath,
        directories,
        sort: effectiveSort,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json<ApiErrorShape>(
      createApiError("PATH_LIST_FAILED", "Failed to list directories", message),
      { status: 400 },
    );
  }
}
