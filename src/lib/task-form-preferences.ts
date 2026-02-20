import { DEFAULT_TASK_MODEL, DEFAULT_TASK_REASONING, TASK_REASONING_OPTIONS } from "./task-reasoning";

export interface TaskFormPreferences {
  contextCount: number;
  includeContext: boolean;
  model: string;
  reasoning: string;
}

interface StorageLike {
  getItem: (key: string) => string | null;
  removeItem: (key: string) => void;
  setItem: (key: string, value: string) => void;
}

export const TASK_FORM_PREFERENCES_STORAGE_KEY = "openclap.task-form-preferences";
const TASK_FORM_PREFERENCES_PROJECT_STORAGE_KEY_PREFIX = `${TASK_FORM_PREFERENCES_STORAGE_KEY}.project`;
export const TASK_FORM_PREFERENCES_UPDATED_EVENT = "openclap:task-form-preferences-updated";

export const DEFAULT_TASK_FORM_PREFERENCES: TaskFormPreferences = {
  contextCount: 0,
  includeContext: false,
  model: DEFAULT_TASK_MODEL,
  reasoning: DEFAULT_TASK_REASONING,
};

export interface TaskFormPreferencesUpdatedEventDetail {
  preferences: TaskFormPreferences;
  projectId: string;
}

const KNOWN_REASONING_VALUES: ReadonlySet<string> = new Set(
  TASK_REASONING_OPTIONS.map((option) => option.value),
);

function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function toModel(value: unknown): string {
  if (typeof value !== "string") {
    return DEFAULT_TASK_FORM_PREFERENCES.model;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : DEFAULT_TASK_FORM_PREFERENCES.model;
}

function toReasoning(value: unknown): string {
  if (typeof value !== "string") {
    return DEFAULT_TASK_FORM_PREFERENCES.reasoning;
  }

  const normalized = value.trim();
  return KNOWN_REASONING_VALUES.has(normalized)
    ? normalized
    : DEFAULT_TASK_FORM_PREFERENCES.reasoning;
}

function toIncludeContext(value: unknown): boolean {
  return value === true;
}

function toContextCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_TASK_FORM_PREFERENCES.contextCount;
  }

  return Math.max(0, Math.floor(value));
}

function normalizeTaskFormPreferences(value: unknown): TaskFormPreferences {
  if (!value || typeof value !== "object") {
    return DEFAULT_TASK_FORM_PREFERENCES;
  }

  const candidate = value as Record<string, unknown>;
  return {
    contextCount: toContextCount(candidate.contextCount),
    includeContext: toIncludeContext(candidate.includeContext),
    model: toModel(candidate.model),
    reasoning: toReasoning(candidate.reasoning),
  };
}

function normalizeProjectId(projectId: string): string | null {
  const normalized = projectId.trim();
  if (!normalized) {
    return null;
  }

  return normalized;
}

export function getTaskFormPreferencesStorageKey(projectId: string): string | null {
  const normalizedProjectId = normalizeProjectId(projectId);
  if (!normalizedProjectId) {
    return null;
  }

  return `${TASK_FORM_PREFERENCES_PROJECT_STORAGE_KEY_PREFIX}.${normalizedProjectId}`;
}

export function loadTaskFormPreferences(
  projectId: string,
  storage = getBrowserStorage(),
): TaskFormPreferences {
  const storageKey = getTaskFormPreferencesStorageKey(projectId);
  if (!storage || !storageKey) {
    return DEFAULT_TASK_FORM_PREFERENCES;
  }

  try {
    const raw = storage.getItem(storageKey);
    if (!raw) {
      return DEFAULT_TASK_FORM_PREFERENCES;
    }

    return normalizeTaskFormPreferences(JSON.parse(raw));
  } catch {
    return DEFAULT_TASK_FORM_PREFERENCES;
  }
}

export function clearTaskFormPreferences(projectId: string, storage = getBrowserStorage()): void {
  const storageKey = getTaskFormPreferencesStorageKey(projectId);
  if (!storage || !storageKey) {
    return;
  }

  try {
    storage.removeItem(storageKey);
  } catch {
    // Ignore storage write failures (e.g., disabled or quota exceeded).
  }
}

export function saveTaskFormPreferences(
  projectId: string,
  preferences: TaskFormPreferences,
  storage = getBrowserStorage(),
): TaskFormPreferences {
  const storageKey = getTaskFormPreferencesStorageKey(projectId);
  const normalized = normalizeTaskFormPreferences(preferences);
  if (!storage || !storageKey) {
    return normalized;
  }

  try {
    storage.setItem(storageKey, JSON.stringify(normalized));
  } catch {
    // Ignore storage write failures (e.g., disabled or quota exceeded).
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<TaskFormPreferencesUpdatedEventDetail>(TASK_FORM_PREFERENCES_UPDATED_EVENT, {
        detail: {
          preferences: normalized,
          projectId: projectId.trim(),
        },
      }),
    );
  }

  return normalized;
}
