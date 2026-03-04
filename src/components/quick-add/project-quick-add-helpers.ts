export type PathValidationState =
  | {
      message: string;
      normalizedPath: string;
      status: "idle";
      validatedFrom: string;
    }
  | {
      message: string;
      normalizedPath: string;
      status: "validating";
      validatedFrom: string;
    }
  | {
      message: string;
      normalizedPath: string;
      status: "valid";
      validatedFrom: string;
    }
  | {
      message: string;
      normalizedPath: string;
      status: "invalid";
      validatedFrom: string;
    };

export const PROJECT_QUICK_ADD_SKILL_STORAGE_KEY = "openclap.project-quick-add.skill-id";
export const PATH_VALIDATION_DEBOUNCE_MS = 300;

export function formatProjectNameFromPath(projectPath: string): string {
  const normalizedPath = projectPath.trim().replace(/[\\/]+$/g, "");
  const directoryName = normalizedPath.split(/[\\/]/).filter(Boolean).pop() ?? "";
  const normalized = directoryName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "";
  }

  const words = normalized.split(" ");
  return words
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(" ");
}
