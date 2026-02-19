import type { ApiErrorShape } from "../../shared/contracts/path";

export function createApiError(
  code: string,
  message: string,
  details?: string,
): ApiErrorShape {
  return {
    details,
    error: {
      code,
      message,
    },
  };
}
