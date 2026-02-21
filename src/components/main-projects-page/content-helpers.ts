"use client";

import type {
  CodexUsageApiResponse,
  CodexUsageModelSummary,
  ProjectEntity,
  SubprojectEntity,
  TaskEntity,
} from "../../../shared/contracts";
import { getTaskModelDisplayLabel } from "@/lib/task-reasoning";

export type SubprojectWithTasks = SubprojectEntity & { tasks: TaskEntity[] };

export type ProjectTree = ProjectEntity & {
  subprojects: SubprojectWithTasks[];
  tasks: TaskEntity[];
};

export interface CodexUsageModelDisplay extends CodexUsageModelSummary {
  displayLabel: string;
}

export const CODEX_USAGE_POLL_INTERVAL_MS = 5 * 60 * 1000;
export const DEFAULT_CODEX_AUTH_FILE = "~/.codex/auth.json";
export const CODex_INFO_OPEN_CARD_MODEL = "legacy-single";

export function normalizePercent(percent: number): number {
  return Math.max(0, Math.min(100, Math.floor(percent)));
}

export function progressWidth(percent: number): string {
  const normalized = normalizePercent(percent);
  return `${normalized}%`;
}

export function limitProgressClass(percent: number): string {
  if (percent <= 3) {
    return "bg-red-500";
  }

  if (percent <= 10) {
    return "bg-orange-500";
  }

  return "bg-zinc-700";
}

export function resolveCodexModelLabel(model: string): string {
  if (model === "default") {
    return "⚙️ Classic";
  }

  if (model === "gpt-5.3-codex-spark") {
    return "⚙️ Classic";
  }

  const labeled = getTaskModelDisplayLabel(model);
  if (labeled !== model) {
    return labeled;
  }

  return model;
}

export function resolveCodexModelDisplayLabel(model: string, sourceLabel?: string): string {
  const resolved = resolveCodexModelLabel(model);
  const trimmedSourceLabel = sourceLabel?.trim();
  if (!trimmedSourceLabel || trimmedSourceLabel === model) {
    return resolved;
  }

  if (trimmedSourceLabel.includes("_")) {
    return resolved;
  }

  const normalizedSourceLabel = trimmedSourceLabel.replace(/\s+limit$/iu, "").trim();
  if (!normalizedSourceLabel) {
    return resolved;
  }

  if (normalizedSourceLabel.startsWith(resolved)) {
    return normalizedSourceLabel;
  }

  const hasEmoji = /^\p{Emoji_Presentation}|\p{Emoji}/u.test(resolved);
  if (!hasEmoji) {
    return resolved;
  }

  if (normalizedSourceLabel.startsWith("gpt-") || normalizedSourceLabel.startsWith("GPT-")) {
    return `${resolved.split(" ")[0]} ${normalizedSourceLabel}`;
  }

  return `${resolved.split(" ")[0]} ${normalizedSourceLabel}`;
}

export interface LimitResetLabel {
  suffix?: string;
  text: string;
}

export function formatLimitReset(value: string | null): LimitResetLabel {
  if (!value || value === "n/a") {
    return { text: "resets n/a" };
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { text: `resets ${value}` };
  }

  const now = new Date();
  const isToday =
    parsed.getFullYear() === now.getFullYear() &&
    parsed.getMonth() === now.getMonth() &&
    parsed.getDate() === now.getDate();
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  const compactTime = `${hours}:${minutes}`;

  if (isToday) {
    const remainingMinutes = Math.max(
      0,
      Math.ceil((parsed.getTime() - now.getTime()) / (60 * 1000)),
    );
    const remainingHours = Math.floor(remainingMinutes / 60);
    const remainingMins = String(remainingMinutes % 60).padStart(2, "0");
    return {
      suffix: `in ${remainingHours}:${remainingMins}`,
      text: `resets ${compactTime} -`,
    };
  }

  const monthShort = new Intl.DateTimeFormat(undefined, { month: "short" }).format(parsed);
  return { text: `resets ${compactTime} on ${parsed.getDate()} ${monthShort}` };
}

export const TASK_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formatTaskDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "unknown";
  }
  return TASK_DATE_FORMATTER.format(parsed);
}

export function truncateTaskPreview(text: string, limit = 100): string {
  const normalized = text.trim();
  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit).trimEnd()}...`;
}

export function isFinishedTask(task: TaskEntity): boolean {
  return task.status === "done" || task.status === "failed" || task.status === "stopped";
}

export function findTaskInProjects(projects: ProjectTree[], taskId: string): TaskEntity | null {
  for (const project of projects) {
    const projectTask = project.tasks.find((task) => task.id === taskId);
    if (projectTask) {
      return projectTask;
    }

    for (const subproject of project.subprojects) {
      const subprojectTask = subproject.tasks.find((task) => task.id === taskId);
      if (subprojectTask) {
        return subprojectTask;
      }
    }
  }

  return null;
}

export function getTaskComposerScopeKey(projectId: string, subprojectId?: string | null): string {
  return subprojectId ? `${projectId}:subproject:${subprojectId}` : `${projectId}:project`;
}

export function isProjectTasksVisibleOnMainPage(project: ProjectTree): boolean {
  return project.mainPageTasksVisible;
}

export function isProjectSubprojectsVisibleOnMainPage(project: ProjectTree): boolean {
  return project.mainPageSubprojectsVisible;
}

export function isProjectCollapsedOnMainPage(project: ProjectTree): boolean {
  return project.mainPageCollapsed;
}

export function resolveModelCardSortRank(model: string): number {
  if (model === "default") {
    return 0;
  }
  if (model === "gpt-5.3-codex-spark") {
    return 0;
  }
  if (model.toLowerCase().includes("spark")) {
    return 1;
  }
  return 2;
}

export type DeleteTaskTarget = {
  id: string;
  text: string;
};

export type StopTaskTarget = {
  id: string;
  text: string;
};

export type DeleteProjectTarget = {
  id: string;
  name: string;
};

export type DeleteSubprojectTarget = {
  id: string;
  name: string;
};

export type CodexUsageLoadResult = {
  modelSummaries: CodexUsageModelDisplay[];
  usageCheckedAt: string;
  weeklyUsedPercent: number;
  fiveHourUsedPercent: number;
  weeklyResetAt: string | null;
  fiveHourResetAt: string | null;
  connected: boolean;
  endpoint: string | null;
  authFile: string;
  connectionError: string | null;
};

export type TaskQuickAddFormData = {
  includeContext: boolean;
  contextCount: number;
  model: string;
  reasoning: string;
  text: string;
};

export type { CodexUsageApiResponse };
