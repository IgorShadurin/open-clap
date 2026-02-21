"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  BookText,
  ChevronDown,
  ChevronUp,
  EllipsisVertical,
  EyeOff,
  FolderGit2,
  GripVertical,
  Hand,
  Info,
  ListTodo,
  Pause,
  Pencil,
  Play,
  Save,
  Settings,
  Square,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  DEFAULT_TASK_MODEL,
  DEFAULT_TASK_REASONING,
  getTaskModelDisplayLabel,
} from "@/lib/task-reasoning";
import type {
  CodexUsageApiResponse,
  CodexUsageModelSummary,
} from "../../shared/contracts";
import { clearTaskFormPreferences } from "@/lib/task-form-preferences";
import {
  buildMetadataForResolvedSkillTask,
  parseSkillTaskMetadata,
  resolveSkillSetTasks,
} from "@/lib/skill-set-links";
import {
  createDraggableContainerHandlers,
  moveItemInList,
  preventControlDragStart,
  stopDragPropagation,
} from "../lib/drag-drop";

import type { ProjectEntity, SkillSetTreeItem, SubprojectEntity, TaskEntity } from "../../shared/contracts";
import { buildTaskScopeHref, canEditTask, requestJson } from "./app-dashboard-helpers";
import {
  ProjectQuickAdd,
  type ProjectQuickAddPayload,
} from "./project-quick-add";
import { buildProjectAvatar } from "./project-avatar";
import {
  SubprojectQuickAdd,
  type SubprojectQuickAddPayload,
} from "./subproject-quick-add";
import { TaskInlineRow } from "./task-inline-row";
import { TaskQuickAdd, type TaskQuickAddPayload } from "./task-quick-add";
import { usePreventUnhandledFileDrop } from "./use-prevent-unhandled-file-drop";
import { useRealtimeSync } from "./use-realtime-sync";
import { TaskDeleteConfirmationDialog } from "./task-delete-confirmation-dialog";
import { Checkbox } from "./ui/checkbox";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Select } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { TaskModelSelect, TaskReasoningSelect } from "./task-select-dropdowns";

type SubprojectWithTasks = SubprojectEntity & { tasks: TaskEntity[] };
type ProjectTree = ProjectEntity & {
  subprojects: SubprojectWithTasks[];
  tasks: TaskEntity[];
};

const CODEX_USAGE_POLL_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_CODEX_AUTH_FILE = "~/.codex/auth.json";

interface CodexUsageModelDisplay extends CodexUsageModelSummary {
  displayLabel: string;
}

function normalizePercent(percent: number): number {
  return Math.max(0, Math.min(100, Math.floor(percent)));
}

function progressWidth(percent: number): string {
  const normalized = normalizePercent(percent);
  return `${normalized}%`;
}

function limitProgressClass(percent: number): string {
  if (percent <= 3) {
    return "bg-red-500";
  }

  if (percent <= 10) {
    return "bg-orange-500";
  }

  return "bg-zinc-700";
}

function resolveCodexModelLabel(model: string): string {
  if (model === "default") {
    return "⚙️ Classic";
  }

  if (model === DEFAULT_TASK_MODEL) {
    return "⚙️ Classic";
  }

  const labeled = getTaskModelDisplayLabel(model);
  if (labeled !== model) {
    return labeled;
  }

  return model;
}

function resolveCodexModelDisplayLabel(model: string, sourceLabel?: string): string {
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

interface LimitResetLabel {
  suffix?: string;
  text: string;
}

function formatLimitReset(value: string | null): LimitResetLabel {
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

const TASK_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function formatTaskDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "unknown";
  }
  return TASK_DATE_FORMATTER.format(parsed);
}

function truncateTaskPreview(text: string, limit = 100): string {
  const normalized = text.trim();
  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit).trimEnd()}...`;
}

function isFinishedTask(task: TaskEntity): boolean {
  return task.status === "done" || task.status === "failed" || task.status === "stopped";
}

function findTaskInProjects(projects: ProjectTree[], taskId: string): TaskEntity | null {
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

function getTaskComposerScopeKey(projectId: string, subprojectId?: string | null): string {
  return subprojectId ? `${projectId}:subproject:${subprojectId}` : `${projectId}:project`;
}

function isProjectTasksVisibleOnMainPage(project: ProjectTree): boolean {
  return project.mainPageTasksVisible;
}

function isProjectSubprojectsVisibleOnMainPage(project: ProjectTree): boolean {
  return project.mainPageSubprojectsVisible;
}

function isProjectCollapsedOnMainPage(project: ProjectTree): boolean {
  return project.mainPageCollapsed;
}

export function MainProjectsPage() {
  usePreventUnhandledFileDrop();

  const [projects, setProjects] = useState<ProjectTree[]>([]);
  const [loading, setLoading] = useState(true);
  const [instructionSets, setInstructionSets] = useState<SkillSetTreeItem[]>([]);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedInstructionSetByComposer, setSelectedInstructionSetByComposer] = useState<
    Record<string, string>
  >({});
  const [quickAddClearSignalByScope, setQuickAddClearSignalByScope] = useState<Record<string, number>>(
    {},
  );
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null);
  const [draggingSubproject, setDraggingSubproject] = useState<{
    projectId: string;
    subprojectId: string;
  } | null>(null);
  const [draggingProjectTask, setDraggingProjectTask] = useState<{
    projectId: string;
    taskId: string;
  } | null>(null);
  const [deleteTaskTarget, setDeleteTaskTarget] = useState<{
    id: string;
    text: string;
  } | null>(null);
  const [stopTaskTarget, setStopTaskTarget] = useState<{
    id: string;
    text: string;
  } | null>(null);
  const [deleteProjectTarget, setDeleteProjectTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [openProjectMenuId, setOpenProjectMenuId] = useState<string | null>(null);
  const [openProjectIconMenuId, setOpenProjectIconMenuId] = useState<string | null>(null);
  const [projectIconPickerProjectId, setProjectIconPickerProjectId] = useState<string | null>(
    null,
  );
  const [projectIconUploadProjectId, setProjectIconUploadProjectId] = useState<string | null>(
    null,
  );
  const [projectIconDeleteProjectId, setProjectIconDeleteProjectId] = useState<string | null>(
    null,
  );
  const [deleteSubprojectTarget, setDeleteSubprojectTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState("");
  const [editingProjectSubmitting, setEditingProjectSubmitting] = useState(false);
  const [editingSubprojectId, setEditingSubprojectId] = useState<string | null>(null);
  const [editingSubprojectName, setEditingSubprojectName] = useState("");
  const [editingSubprojectSubmitting, setEditingSubprojectSubmitting] = useState(false);
  const [expandedSubprojectTasks, setExpandedSubprojectTasks] = useState<
    Record<string, boolean>
  >({});
  const [taskDetailsTarget, setTaskDetailsTarget] = useState<{
    projectName: string;
    task: TaskEntity;
  } | null>(null);
  const [taskDetailsText, setTaskDetailsText] = useState("");
  const [taskDetailsModel, setTaskDetailsModel] = useState("");
  const [taskDetailsReasoning, setTaskDetailsReasoning] = useState("");
  const [taskDetailsIncludeContext, setTaskDetailsIncludeContext] = useState(false);
  const [taskDetailsContextCount, setTaskDetailsContextCount] = useState(0);
  const [taskDetailsSubmitting, setTaskDetailsSubmitting] = useState(false);
  const [codexConnected, setCodexConnected] = useState(false);
  const [codexUsageLoaded, setCodexUsageLoaded] = useState(false);
  const [codexWeeklyLimitUsedPercent, setCodexWeeklyLimitUsedPercent] = useState(0);
  const [codexFiveHourLimitUsedPercent, setCodexFiveHourLimitUsedPercent] = useState(0);
  const [codexConnectionError, setCodexConnectionError] = useState<string | null>(null);
  const [codexResolvedAuthFilePath, setCodexResolvedAuthFilePath] = useState(
    DEFAULT_CODEX_AUTH_FILE,
  );
  const [codexFiveHourResetAt, setCodexFiveHourResetAt] = useState<string | null>(null);
  const [codexWeeklyResetAt, setCodexWeeklyResetAt] = useState<string | null>(null);
  const [codexUsageModelSummaries, setCodexUsageModelSummaries] = useState<
    CodexUsageModelDisplay[]
  >([]);
  const [codexUsageEndpoint, setCodexUsageEndpoint] = useState<string | null>(null);
  const [codexUsageCheckedAt, setCodexUsageCheckedAt] = useState<string | null>(null);
  const [codexInfoOpenModel, setCodexInfoOpenModel] = useState<string | null>(null);
  const [projectIconLoadErrors, setProjectIconLoadErrors] = useState<Record<string, boolean>>(
    {},
  );
  const [projectIconCacheBustByProjectId, setProjectIconCacheBustByProjectId] = useState<
    Record<string, number>
  >({});
  const projectIconInputRef = useRef<HTMLInputElement | null>(null);
  const codexInfoOpenCardModel = "legacy-single";

  const sortedInstructionSets = useMemo(
    () =>
      [...instructionSets].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    [instructionSets],
  );

  const getComposerInstructionSetId = (scopeKey: string): string =>
    selectedInstructionSetByComposer[scopeKey] ?? "";

  const setComposerInstructionSet = (scopeKey: string, instructionSetId: string) => {
    setSelectedInstructionSetByComposer((current) => ({
      ...current,
      [scopeKey]: instructionSetId,
    }));
    setQuickAddClearSignalByScope((current) => ({
      ...current,
      [scopeKey]: (current[scopeKey] ?? 0) + 1,
    }));
  };

  const getTaskSourceLabel = (task: TaskEntity): string | undefined => {
    const sourceMetadata = parseSkillTaskMetadata(task.metadata);
    return sourceMetadata?.instructionSetName;
  };

  const isInstructionSetAddedToProject = (project: ProjectTree, instructionSetId: string): boolean => {
    const normalizedInstructionSetId = instructionSetId.trim();
    if (!normalizedInstructionSetId) {
      return false;
    }

    const allTasks = project.tasks.concat(
      project.subprojects.flatMap((subproject) => subproject.tasks),
    );
    return allTasks.some((task) => {
      const metadata = parseSkillTaskMetadata(task.metadata);
      return metadata?.instructionSetId === normalizedInstructionSetId;
    });
  };

  const renderTaskComposerInstructionAddon = (scopeKey: string) => {
    const selectedInstructionSetId = getComposerInstructionSetId(scopeKey);

    return (
      <Select
        className="h-9 w-52 shrink-0 text-sm"
        onChange={(event) => setComposerInstructionSet(scopeKey, event.target.value)}
        value={selectedInstructionSetId}
      >
        <option value="">Custom task</option>
        {sortedInstructionSets.length < 1 ? null : (
          <>
            <option disabled value="">
              --------------------
            </option>
            {sortedInstructionSets.map((instructionSet) => (
              <option key={instructionSet.id} value={instructionSet.id}>
                {instructionSet.name}
              </option>
            ))}
          </>
        )}
      </Select>
    );
  };

  const renderTaskComposer = (
    project: ProjectTree,
    scopeKey: string,
    options: {
      placeholder: string;
      submitAriaLabel: string;
      submitTitle: string;
    },
    onSubmit: (payload: TaskQuickAddPayload, instructionSetId: string) => Promise<void> | void,
  ) => {
    const selectedInstructionSetId = getComposerInstructionSetId(scopeKey);

    return (
      <TaskQuickAdd
        allowEmptyText={Boolean(selectedInstructionSetId)}
        clearInputSignal={quickAddClearSignalByScope[scopeKey]}
        disableTextInput={Boolean(selectedInstructionSetId)}
        onSubmit={(payload) =>
          onSubmit(payload, selectedInstructionSetId)
        }
        placeholder={options.placeholder}
        projectId={project.id}
        rightAddon={renderTaskComposerInstructionAddon(scopeKey)}
        stopPropagation
        submitAriaLabel={options.submitAriaLabel}
        submitTitle={options.submitTitle}
      />
    );
  };

  const shouldBlockContainerDragStart = (event: {
    target: EventTarget | null;
  }): boolean => {
    if (!(event.target instanceof Element)) {
      return false;
    }

    return Boolean(
      event.target.closest(
        "input, textarea, select, button, a, [contenteditable=''], [contenteditable='true']",
      ),
    );
  };

  const bumpProjectIconCacheBust = (projectId: string) => {
    setProjectIconCacheBustByProjectId((previous) => ({
      ...previous,
      [projectId]: (previous[projectId] ?? 0) + 1,
    }));
  };

  const loadProjects = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }

    try {
      const tree = await requestJson<ProjectTree[]>("/api/projects/tree", {
        cache: "no-store",
      });
      setProjects(tree);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load projects");
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
      setHasLoadedOnce(true);
    }
  }, []);

  const loadInstructionSets = useCallback(async () => {
    try {
      const result = await requestJson<SkillSetTreeItem[]>("/api/skills", {
        cache: "no-store",
      });
      setInstructionSets(result);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load skill sets");
    }
  }, []);

  const loadCodexUsage = useCallback(async () => {
    try {
      const usageResponse = await requestJson<CodexUsageApiResponse>("/api/codex/usage", {
        body: JSON.stringify({}),
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      const result = usageResponse.results[0];
      if (!result) {
        throw new Error("Usage API returned an empty result");
      }

      setCodexResolvedAuthFilePath(result.authFile || DEFAULT_CODEX_AUTH_FILE);

      if (!result.ok || !result.usage) {
        const rawError = result.error?.trim() ?? "Unknown usage API error";
        const compactError = rawError.replace(/\s+/g, " ").slice(0, 220);
      setCodexConnected(false);
      setCodexConnectionError(compactError);
      setCodexUsageModelSummaries([]);
      setCodexWeeklyLimitUsedPercent(0);
      setCodexFiveHourLimitUsedPercent(0);
      setCodexFiveHourResetAt(null);
      setCodexWeeklyResetAt(null);
      setCodexUsageEndpoint(null);
        setCodexUsageCheckedAt(new Date().toISOString());
        return;
      }

      setCodexConnected(true);
      setCodexConnectionError(null);
      setCodexUsageModelSummaries(
        (result.usage.models ?? [])
          .map((model) => ({
            ...model,
            displayLabel: resolveCodexModelDisplayLabel(model.model, model.modelLabel),
          }))
          .sort((first, second) =>
            resolveModelCardSortRank(first.model) - resolveModelCardSortRank(second.model),
          ),
      );
      setCodexWeeklyLimitUsedPercent(result.usage.weeklyUsedPercent ?? 0);
      setCodexFiveHourLimitUsedPercent(result.usage.fiveHourUsedPercent);
      setCodexFiveHourResetAt(result.usage.fiveHourResetAt ?? null);
      setCodexWeeklyResetAt(result.usage.weeklyResetAt ?? null);
      setCodexUsageEndpoint(result.endpoint ?? null);
      setCodexUsageCheckedAt(new Date().toISOString());
    } catch (error) {
      const message = (error instanceof Error ? error.message : "Failed to check Codex usage")
        .replace(/\s+/g, " ")
        .slice(0, 220);
      setCodexConnected(false);
      setCodexConnectionError(message);
      setCodexUsageModelSummaries([]);
      setCodexWeeklyLimitUsedPercent(0);
      setCodexFiveHourLimitUsedPercent(0);
      setCodexFiveHourResetAt(null);
      setCodexWeeklyResetAt(null);
      setCodexUsageEndpoint(null);
      setCodexUsageCheckedAt(new Date().toISOString());
    } finally {
      setCodexUsageLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    void loadInstructionSets();
  }, [loadInstructionSets]);

  useEffect(() => {
    void loadCodexUsage();

    const intervalId = window.setInterval(() => {
      void loadCodexUsage();
    }, CODEX_USAGE_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadCodexUsage]);

  useRealtimeSync(() => {
    void loadProjects({ silent: true });
    void loadInstructionSets();
  });

  useEffect(() => {
    setTaskDetailsTarget((current) => {
      if (!current) {
        return current;
      }

      const latestTask = findTaskInProjects(projects, current.task.id);
      if (!latestTask) {
        return null;
      }

      if (latestTask === current.task) {
        return current;
      }

      return {
        ...current,
        task: latestTask,
      };
    });
  }, [projects]);

  useEffect(() => {
    if (!openProjectMenuId && !openProjectIconMenuId) {
      return;
    }
    if (openProjectMenuId && !projects.some((project) => project.id === openProjectMenuId)) {
      setOpenProjectMenuId(null);
    }
    if (
      openProjectIconMenuId &&
      !projects.some((project) => project.id === openProjectIconMenuId)
    ) {
      setOpenProjectIconMenuId(null);
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) {
        return;
      }
      if (event.target.closest("[data-project-actions-menu]")) {
        return;
      }
      if (event.target.closest("[data-project-icon-menu]")) {
        return;
      }
      setOpenProjectMenuId(null);
      setOpenProjectIconMenuId(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenProjectMenuId(null);
        setOpenProjectIconMenuId(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [openProjectIconMenuId, openProjectMenuId, projects]);

  useEffect(() => {
    if (!codexInfoOpenModel) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) {
        return;
      }

      if (
        event.target instanceof Element &&
        event.target.closest("[data-codex-usage-info-card]")
      ) {
        return;
      }

      setCodexInfoOpenModel(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCodexInfoOpenModel(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [codexInfoOpenModel]);

  const isCodexInfoOpen = (model: string): boolean => codexInfoOpenModel === model;
  const toggleCodexInfo = (model: string) =>
    setCodexInfoOpenModel((current) => (current === model ? null : model));

  const handleQuickProjectCreate = async (payload: ProjectQuickAddPayload) => {
    try {
      await requestJson("/api/projects", {
        body: JSON.stringify({
          metadata: payload.metadata || undefined,
          name: payload.name,
          path: payload.path,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await loadProjects();
      toast.success("Project created");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create project");
    }
  };

  const startProjectNameEdit = (project: ProjectTree) => {
    setEditingProjectId(project.id);
    setEditingProjectName(project.name);
  };

  const cancelProjectNameEdit = () => {
    setEditingProjectId(null);
    setEditingProjectName("");
  };

  const saveProjectNameEdit = async () => {
    if (!editingProjectId) {
      return;
    }

    const nextName = editingProjectName.trim();
    if (nextName.length < 1) {
      setErrorMessage("Project name is required");
      return;
    }

    setEditingProjectSubmitting(true);
    try {
      await requestJson(`/api/projects/${editingProjectId}`, {
        body: JSON.stringify({ name: nextName }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      cancelProjectNameEdit();
      await loadProjects();
      toast.success("Project renamed");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to rename project");
    } finally {
      setEditingProjectSubmitting(false);
    }
  };

  const startSubprojectNameEdit = (subproject: SubprojectWithTasks) => {
    setEditingSubprojectId(subproject.id);
    setEditingSubprojectName(subproject.name);
  };

  const cancelSubprojectNameEdit = () => {
    setEditingSubprojectId(null);
    setEditingSubprojectName("");
  };

  const saveSubprojectNameEdit = async () => {
    if (!editingSubprojectId) {
      return;
    }

    const nextName = editingSubprojectName.trim();
    if (nextName.length < 1) {
      setErrorMessage("Subproject name is required");
      return;
    }

    setEditingSubprojectSubmitting(true);
    try {
      await requestJson(`/api/subprojects/${editingSubprojectId}`, {
        body: JSON.stringify({ name: nextName }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      cancelSubprojectNameEdit();
      await loadProjects();
      toast.success("Subproject renamed");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to rename subproject");
    } finally {
      setEditingSubprojectSubmitting(false);
    }
  };

  const handleProjectDrop = async (targetProjectId: string) => {
    if (!draggingProjectId || draggingProjectId === targetProjectId) {
      return;
    }

    const currentOrder = projects.map((project) => project.id);
    const reordered = moveItemInList(currentOrder, draggingProjectId, targetProjectId);
    if (!reordered) {
      return;
    }

    try {
      await requestJson("/api/projects/reorder", {
        body: JSON.stringify({ orderedIds: reordered }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await loadProjects();
      toast.success("Project priority updated");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to reorder projects");
    } finally {
      setDraggingProjectId(null);
    }
  };

  const handleProjectPauseToggle = async (project: ProjectTree) => {
    try {
      await requestJson(`/api/projects/${project.id}`, {
        body: JSON.stringify({ paused: !project.paused }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      await loadProjects();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update project status");
    }
  };

  const handleProjectCollapsedToggle = async (project: ProjectTree) => {
    const collapsedNow = isProjectCollapsedOnMainPage(project);
    const nextCollapsed = !collapsedNow;

    try {
      await requestJson(`/api/projects/${project.id}`, {
        body: JSON.stringify({ mainPageCollapsed: nextCollapsed }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      await loadProjects();
      toast.success(nextCollapsed ? "Project collapsed" : "Project expanded");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update project settings");
    }
  };

  const handleProjectIconUpload = async (projectId: string, file: File) => {
    setProjectIconUploadProjectId(projectId);
    try {
      const formData = new FormData();
      formData.set("file", file);

      const response = await fetch(`/api/projects/${projectId}/icon`, {
        body: formData,
        method: "POST",
      });

      if (!response.ok) {
        let message = `Project icon upload failed with HTTP ${response.status}`;
        try {
          const payload = (await response.json()) as {
            details?: string;
            error?: { message?: string };
          };
          message = payload.error?.message?.trim() || payload.details?.trim() || message;
        } catch {
          // no-op
        }
        throw new Error(message);
      }

      await loadProjects({ silent: true });
      bumpProjectIconCacheBust(projectId);
      setProjectIconLoadErrors((previous) => {
        const next = { ...previous };
        delete next[projectId];
        return next;
      });
      toast.success("Project icon uploaded");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to upload project icon");
    } finally {
      setProjectIconUploadProjectId(null);
    }
  };

  const handleProjectIconDelete = async (projectId: string) => {
    setProjectIconDeleteProjectId(projectId);
    try {
      await requestJson(`/api/projects/${projectId}/icon`, { method: "DELETE" });
      await loadProjects({ silent: true });
      bumpProjectIconCacheBust(projectId);
      setProjectIconLoadErrors((previous) => {
        const next = { ...previous };
        delete next[projectId];
        return next;
      });
      toast.success("Uploaded project icon deleted");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete uploaded project icon");
    } finally {
      setProjectIconDeleteProjectId(null);
    }
  };

  const handleSubprojectPauseToggle = async (subproject: SubprojectWithTasks) => {
    try {
      await requestJson(`/api/subprojects/${subproject.id}`, {
        body: JSON.stringify({ paused: !subproject.paused }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      await loadProjects();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update subproject status");
    }
  };

  const handleProjectTaskPauseToggle = async (task: TaskEntity) => {
    if (!canEditTask(task)) {
      setErrorMessage("Running tasks cannot be edited");
      return;
    }

    try {
      await requestJson(`/api/tasks/${task.id}/action`, {
        body: JSON.stringify({ action: task.paused ? "resume" : "pause" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await loadProjects();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update task status");
    }
  };

  const handleProjectTaskRemove = async (task: TaskEntity) => {
    if (!canEditTask(task)) {
      setErrorMessage("Running tasks cannot be edited");
      return;
    }

    try {
      await requestJson(`/api/tasks/${task.id}/action`, {
        body: JSON.stringify({ action: "remove" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await loadProjects();
      toast.success("Task removed");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to remove task");
    }
  };

  const openTaskDetails = (project: ProjectTree, task: TaskEntity) => {
    if (!canEditTask(task)) {
      setErrorMessage("Running tasks cannot be edited");
      return;
    }

    setTaskDetailsTarget({
      projectName: project.name,
      task,
    });
    setTaskDetailsText(task.text);
    setTaskDetailsModel(task.model);
    setTaskDetailsReasoning(task.reasoning);
    setTaskDetailsIncludeContext(task.includePreviousContext);
    setTaskDetailsContextCount(task.previousContextMessages);
  };

  const handleTaskDetailsSave = async () => {
    if (!taskDetailsTarget) {
      return;
    }

    if (!canEditTask(taskDetailsTarget.task)) {
      setErrorMessage("Running tasks cannot be edited");
      return;
    }

    setTaskDetailsSubmitting(true);
    try {
      await requestJson(`/api/tasks/${taskDetailsTarget.task.id}`, {
        body: JSON.stringify({
          includePreviousContext: taskDetailsIncludeContext,
          model: taskDetailsModel.trim() || DEFAULT_TASK_MODEL,
          previousContextMessages: taskDetailsIncludeContext ? taskDetailsContextCount : 0,
          reasoning: taskDetailsReasoning.trim() || DEFAULT_TASK_REASONING,
          text: taskDetailsText.trim(),
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      await loadProjects();
      setTaskDetailsTarget(null);
      toast.success("Task updated");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update task");
    } finally {
      setTaskDetailsSubmitting(false);
    }
  };

  const handleQuickTaskCreate = async (
    project: ProjectTree,
    payload: TaskQuickAddPayload,
    subprojectId: string | null = null,
    sourceInstructionSetId: string = "",
  ) => {
    const trimmedSourceInstructionSetId = sourceInstructionSetId.trim();
    const selectedInstructionSet = instructionSets.find(
      (instructionSet) => instructionSet.id === trimmedSourceInstructionSetId,
    );

    if (trimmedSourceInstructionSetId.length > 0) {
      const resolvedTasks = resolveSkillSetTasks(instructionSets, trimmedSourceInstructionSetId);
      if (resolvedTasks.length < 1) {
        setErrorMessage("Selected skill set has no tasks to add.");
        return;
      }
      if (isInstructionSetAddedToProject(project, trimmedSourceInstructionSetId)) {
        setErrorMessage("Skill set already added to this project");
        return;
      }

      try {
        let isFirstResolvedTask = true;
        for (const resolvedTask of resolvedTasks) {
          const sourceInstructionSetName = selectedInstructionSet?.name?.trim() || resolvedTask.sourceInstructionSetName;
          const payloadMetadata = buildMetadataForResolvedSkillTask({
            composerInstructionSetId: trimmedSourceInstructionSetId,
            composerInstructionSetName: sourceInstructionSetName,
            resolvedTask,
          });
          await requestJson("/api/tasks", {
            body: JSON.stringify({
              includePreviousContext: resolvedTask.includePreviousContext,
              model: resolvedTask.model,
              metadata: payloadMetadata,
              skipInstructionSetDuplicateCheck: !isFirstResolvedTask,
              previousContextMessages: resolvedTask.includePreviousContext
                ? resolvedTask.previousContextMessages
                : 0,
              projectId: project.id,
              reasoning: resolvedTask.reasoning,
              subprojectId,
              text: resolvedTask.text,
            }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          });
          isFirstResolvedTask = false;
        }

        await loadProjects();
        toast.success("Skill set tasks added");
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to add skill set tasks");
      }

      return;
    }

    try {
      await requestJson("/api/tasks", {
        body: JSON.stringify({
          includePreviousContext: payload.includeContext,
          model: payload.model.trim() || DEFAULT_TASK_MODEL,
          previousContextMessages: payload.includeContext ? payload.contextCount : 0,
          projectId: project.id,
          reasoning: payload.reasoning.trim() || DEFAULT_TASK_REASONING,
          subprojectId,
          text: payload.text.trim(),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await loadProjects();
      toast.success("Task created");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create task");
    }
  };

  const getSubprojectTasksKey = (projectId: string, subprojectId: string): string =>
    `${projectId}:${subprojectId}`;

  const toggleSubprojectTasks = (projectId: string, subprojectId: string) => {
    const key = getSubprojectTasksKey(projectId, subprojectId);
    setExpandedSubprojectTasks((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const handleQuickSubprojectCreate = async (
    project: ProjectTree,
    payload: SubprojectQuickAddPayload,
  ) => {
    try {
      await requestJson("/api/subprojects", {
        body: JSON.stringify({
          metadata: payload.metadata || undefined,
          name: payload.name,
          path: payload.path || project.path,
          projectId: project.id,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await loadProjects();
      toast.success("Subproject created");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create subproject");
    }
  };

  const handleProjectTasksListToggle = async (project: ProjectTree) => {
    const visibleNow = isProjectTasksVisibleOnMainPage(project);
    const nextVisible = !visibleNow;

    try {
      await requestJson(`/api/projects/${project.id}`, {
        body: JSON.stringify({
          mainPageTasksVisible: nextVisible,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      await loadProjects();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update project settings");
    }
  };

  const handleProjectSubprojectsListToggle = async (project: ProjectTree) => {
    const visibleNow = isProjectSubprojectsVisibleOnMainPage(project);
    const nextVisible = !visibleNow;

    try {
      await requestJson(`/api/projects/${project.id}`, {
        body: JSON.stringify({
          mainPageSubprojectsVisible: nextVisible,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      await loadProjects();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update project settings");
    }
  };

  const handleSubprojectDrop = async (projectId: string, targetSubprojectId: string) => {
    if (!draggingSubproject || draggingSubproject.subprojectId === targetSubprojectId) {
      return;
    }
    if (draggingSubproject.projectId !== projectId) {
      return;
    }

    const project = projects.find((item) => item.id === projectId);
    if (!project) {
      return;
    }

    const currentOrder = project.subprojects.map((subproject) => subproject.id);
    const reordered = moveItemInList(currentOrder, draggingSubproject.subprojectId, targetSubprojectId);
    if (!reordered) {
      return;
    }

    try {
      await requestJson("/api/subprojects/reorder", {
        body: JSON.stringify({ orderedIds: reordered, projectId }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await loadProjects();
      toast.success("Subproject priority updated");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to reorder subprojects");
    } finally {
      setDraggingSubproject(null);
    }
  };

  const handleProjectTaskDrop = async (projectId: string, targetTaskId: string) => {
    if (!draggingProjectTask || draggingProjectTask.taskId === targetTaskId) {
      return;
    }
    if (draggingProjectTask.projectId !== projectId) {
      return;
    }

    const project = projects.find((item) => item.id === projectId);
    if (!project) {
      return;
    }

    const currentOrder = project.tasks
      .filter((task) => !isFinishedTask(task))
      .map((task) => task.id);
    const reordered = moveItemInList(currentOrder, draggingProjectTask.taskId, targetTaskId);
    if (!reordered) {
      return;
    }

    try {
      await requestJson("/api/tasks/reorder", {
        body: JSON.stringify({ orderedIds: reordered }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await loadProjects();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to reorder tasks");
    } finally {
      setDraggingProjectTask(null);
    }
  };

  const handleConfirmSubprojectDelete = async () => {
    if (!deleteSubprojectTarget) {
      return;
    }

    try {
      await requestJson(`/api/subprojects/${deleteSubprojectTarget.id}`, { method: "DELETE" });
      setDeleteSubprojectTarget(null);
      await loadProjects();
      toast.success("Subproject removed");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete subproject");
    }
  };

  const handleConfirmTaskDelete = async () => {
    if (!deleteTaskTarget) {
      return;
    }

    const latestTask = findTaskInProjects(projects, deleteTaskTarget.id);
    if (!latestTask) {
      setDeleteTaskTarget(null);
      return;
    }

    await handleProjectTaskRemove(latestTask);
    setDeleteTaskTarget(null);
  };

  const handleConfirmTaskStop = async () => {
    if (!stopTaskTarget) {
      return;
    }

    const latestTask = findTaskInProjects(projects, stopTaskTarget.id);
    if (!latestTask) {
      setStopTaskTarget(null);
      return;
    }

    if (latestTask.status !== "in_progress") {
      setStopTaskTarget(null);
      toast.info("Task is no longer running");
      return;
    }

    try {
      await requestJson(`/api/tasks/${latestTask.id}/action`, {
        body: JSON.stringify({ action: "stop" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      setStopTaskTarget(null);
      await loadProjects();
      toast.success("Stop requested");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to stop task");
    }
  };

  const deleteTaskTargetCurrent = deleteTaskTarget
    ? findTaskInProjects(projects, deleteTaskTarget.id)
    : null;
  const deleteTaskTargetLocked = deleteTaskTargetCurrent ? !canEditTask(deleteTaskTargetCurrent) : false;
  const stopTaskTargetCurrent = stopTaskTarget ? findTaskInProjects(projects, stopTaskTarget.id) : null;
  const stopTaskTargetRunning = stopTaskTargetCurrent?.status === "in_progress";

  const handleConfirmProjectDelete = async () => {
    if (!deleteProjectTarget) {
      return;
    }

    const projectId = deleteProjectTarget.id;
    try {
      await requestJson(`/api/projects/${projectId}`, {
        method: "DELETE",
      });
      clearTaskFormPreferences(projectId);
      setDeleteProjectTarget(null);
      await loadProjects();
      toast.success("Project removed");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete project");
    }
  };

  const codexConnectionInfo = [
    `Auth file: ${codexResolvedAuthFilePath}`,
    `Endpoint: ${codexUsageEndpoint ?? "n/a"}`,
    `Checked: ${
      codexUsageCheckedAt ? new Date(codexUsageCheckedAt).toLocaleString() : "n/a"
    }`,
  ].join("\n");
  const codexConnectionStateLabel = codexUsageLoaded
    ? codexConnected
      ? "Connected"
      : "Disconnected"
    : "Checking";
  const codexConnectionStateTitle = codexUsageLoaded
    ? codexConnected
      ? "Codex status: Connected"
      : codexConnectionError
        ? `Codex status: Disconnected: ${codexConnectionError}`
        : "Codex status: Disconnected"
    : "Codex status: Checking";
  const codexConnectionDotClass = codexUsageLoaded
    ? codexConnected
      ? "bg-emerald-500"
      : "bg-red-500"
    : "bg-zinc-400";
  const fiveHourResetLabel = formatLimitReset(codexFiveHourResetAt);
  const weeklyResetLabel = formatLimitReset(codexWeeklyResetAt);
  const showPerModelLimits = codexUsageModelSummaries.length > 1;
  const resolveModelCardSortRank = (model: string): number => {
    if (model === "default") {
      return 0;
    }
    if (model === DEFAULT_TASK_MODEL) {
      return 0;
    }
    if (model.toLowerCase().includes("spark")) {
      return 1;
    }
    return 2;
  };

  const renderUsageLimits = (label: string, usedPercent: number, resetLabel: LimitResetLabel) => {
    const remainingPercent = codexConnected ? normalizePercent(100 - usedPercent) : 0;

    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm font-medium text-zinc-700">
          <span>{label}</span>
          <span>{remainingPercent}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded bg-zinc-200">
          <div
            className={`h-full ${limitProgressClass(remainingPercent)}`}
            style={{ width: progressWidth(remainingPercent) }}
          />
        </div>
        <div className="text-[11px] text-zinc-500">
          {resetLabel.text}{" "}
          {resetLabel.suffix ? <span className="font-semibold">{resetLabel.suffix}</span> : null}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-zinc-100 p-4 md:p-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div className="space-y-4">
          <Link
            className="inline-flex items-center gap-2 text-xl font-semibold transition-opacity hover:opacity-80"
            href="/"
          >
            <Hand className="h-5 w-5" />
            OpenClap
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-2">
            {showPerModelLimits ? (
              <div className="flex flex-wrap gap-3">
                {codexUsageModelSummaries.map((summary) => (
                  <div
                    key={summary.model}
                    data-codex-usage-info-card
                    className="relative w-[320px] space-y-3 rounded-md border border-black/10 bg-white/70 p-4"
                  >
                    <div className="absolute right-3 top-3">
                      <button
                        aria-label={`Codex limits details (${summary.displayLabel})`}
                        className="text-zinc-500 transition-colors hover:text-zinc-800"
                        onClick={() => toggleCodexInfo(summary.model)}
                        title={codexConnectionInfo}
                        type="button"
                      >
                        <Info className="h-4 w-4" />
                      </button>
                      {isCodexInfoOpen(summary.model) ? (
                        <div className="absolute right-0 z-30 mt-2 w-[300px] space-y-1 rounded-md border border-black/10 bg-white p-3 text-xs text-zinc-700 shadow-lg">
                          <div>Auth file: {codexResolvedAuthFilePath}</div>
                          <div>Endpoint: {codexUsageEndpoint ?? "n/a"}</div>
                          <div>
                            Checked:{" "}
                            {codexUsageCheckedAt
                              ? new Date(codexUsageCheckedAt).toLocaleString()
                              : "n/a"}
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex items-center text-sm font-medium">
                      <div className="flex items-center gap-2">
                        <span
                          aria-label={codexConnectionStateLabel}
                          title={codexConnectionStateTitle}
                          className={`h-2.5 w-2.5 rounded-full ${codexConnectionDotClass}`}
                        />
                        <span>{summary.displayLabel}</span>
                      </div>
                    </div>
                    {renderUsageLimits(
                      "5h limit",
                      summary.fiveHourUsedPercent,
                      formatLimitReset(summary.fiveHourResetAt),
                    )}
                    {renderUsageLimits(
                      "Weekly limit",
                      summary.weeklyUsedPercent ?? 0,
                      formatLimitReset(summary.weeklyResetAt),
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div
                className="relative w-[320px] space-y-3 rounded-md border border-black/10 bg-white/70 p-4"
                data-codex-usage-info-card
              >
                <div className="absolute right-3 top-3">
                  <button
                    aria-label="Codex limits details"
                    className="text-zinc-500 transition-colors hover:text-zinc-800"
                    onClick={() => toggleCodexInfo(codexInfoOpenCardModel)}
                    title={codexConnectionInfo}
                    type="button"
                  >
                    <Info className="h-4 w-4" />
                  </button>
                  {isCodexInfoOpen(codexInfoOpenCardModel) ? (
                    <div className="absolute right-0 z-30 mt-2 w-[300px] space-y-1 rounded-md border border-black/10 bg-white p-3 text-xs text-zinc-700 shadow-lg">
                      <div>Auth file: {codexResolvedAuthFilePath}</div>
                      <div>Endpoint: {codexUsageEndpoint ?? "n/a"}</div>
                      <div>
                        Checked:{" "}
                        {codexUsageCheckedAt
                          ? new Date(codexUsageCheckedAt).toLocaleString()
                          : "n/a"}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center text-sm font-medium">
                  <div className="flex items-center gap-2">
                    <span
                      aria-label={codexConnectionStateLabel}
                      title={codexConnectionStateTitle}
                      className={`h-2.5 w-2.5 rounded-full ${codexConnectionDotClass}`}
                    />
                    <span>Codex connection</span>
                  </div>
                </div>
                {renderUsageLimits("5h limit", codexFiveHourLimitUsedPercent, fiveHourResetLabel)}
                {renderUsageLimits("Weekly limit", codexWeeklyLimitUsedPercent, weeklyResetLabel)}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Button asChild type="button" variant="outline">
                <Link href="/skills">
                  <BookText className="h-4 w-4" />
                  <span className="sr-only">Skills</span>
                </Link>
              </Button>
              <Button asChild type="button" variant="outline">
                <Link href="/settings">
                  <Settings className="h-4 w-4" />
                  <span className="sr-only">Settings</span>
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <ProjectQuickAdd
          onError={(message) => setErrorMessage(message)}
          onSubmit={handleQuickProjectCreate}
          placeholder="Create project"
          submitAriaLabel="Create project"
          submitTitle="Create project"
        />
        <input
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            const projectId = projectIconPickerProjectId;
            event.target.value = "";
            setProjectIconPickerProjectId(null);
            if (!file || !projectId) {
              return;
            }
            void handleProjectIconUpload(projectId, file);
          }}
          ref={projectIconInputRef}
          type="file"
        />

        {!hasLoadedOnce && loading ? (
          <div className="grid gap-4" role="status">
            <Card className="animate-pulse">
              <CardContent className="space-y-3 py-6">
                <div className="h-6 w-52 rounded bg-zinc-200" />
                <div className="h-4 w-72 rounded bg-zinc-200" />
                <div className="h-20 rounded bg-zinc-200" />
              </CardContent>
            </Card>
            <Card className="animate-pulse">
              <CardContent className="space-y-3 py-6">
                <div className="h-6 w-44 rounded bg-zinc-200" />
                <div className="h-4 w-64 rounded bg-zinc-200" />
                <div className="h-14 rounded bg-zinc-200" />
              </CardContent>
            </Card>
          </div>
        ) : null}

        {hasLoadedOnce && projects.length < 1 ? (
          <Card>
            <CardContent className="py-10 text-sm text-zinc-600">
              No projects yet. Use the create project input above.
            </CardContent>
          </Card>
        ) : null}

        {projects.map((project) => {
          const projectCollapsed = isProjectCollapsedOnMainPage(project);
          const projectTasksVisible = isProjectTasksVisibleOnMainPage(project);
          const projectSubprojectsVisible = isProjectSubprojectsVisibleOnMainPage(project);
          const projectAvatar = buildProjectAvatar(project.name);
          const hasUploadedIcon = Boolean(project.iconPath);
          const projectIconCacheBust = projectIconCacheBustByProjectId[project.id] ?? 0;
          const projectIconVersion = `${project.updatedAt}:${hasUploadedIcon ? "uploaded" : "project"}:${projectIconCacheBust}`;
          const projectIconSource = `/api/projects/${project.id}/icon?v=${encodeURIComponent(projectIconVersion)}`;
          const showFallbackAvatar = projectIconLoadErrors[project.id] ?? false;
          const visibleProjectTasks = project.tasks.filter((task) => !isFinishedTask(task));
          return (
            <div
              className="cursor-grab active:cursor-grabbing"
              draggable
              key={project.id}
              onDragEnd={() => setDraggingProjectId(null)}
              onDragOver={(event) => event.preventDefault()}
              onDragStart={(event) => {
                if (shouldBlockContainerDragStart(event)) {
                  event.preventDefault();
                  return;
                }

                setDraggingProjectId(project.id);
              }}
              onDrop={() => void handleProjectDrop(project.id)}
            >
              <Card>
                <CardHeader className={projectCollapsed ? "py-4" : undefined}>
                  <CardTitle className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Button
                        aria-label={project.paused ? "Resume project" : "Pause project"}
                        className={`h-9 w-9 rounded-full p-0 ${
                          project.paused
                            ? "border-amber-300 text-amber-700 hover:bg-amber-50"
                            : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                        }`}
                        draggable={false}
                        onDragStart={preventControlDragStart}
                        onMouseDown={stopDragPropagation}
                        onPointerDown={stopDragPropagation}
                        onClick={() => void handleProjectPauseToggle(project)}
                        size="sm"
                        title={project.paused ? "Resume project" : "Pause project"}
                        type="button"
                        variant="outline"
                      >
                        {project.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                        <span className="sr-only">{project.paused ? "Resume project" : "Pause project"}</span>
                      </Button>
                      <div className="relative" data-project-icon-menu>
                        <button
                          aria-expanded={openProjectIconMenuId === project.id}
                          aria-haspopup="menu"
                          aria-label={`Project icon options for ${project.name}`}
                          className="rounded-full"
                          draggable={false}
                          onDragStart={preventControlDragStart}
                          onMouseDown={stopDragPropagation}
                          onPointerDown={stopDragPropagation}
                          onClick={() => {
                            setOpenProjectMenuId(null);
                            setOpenProjectIconMenuId((current) =>
                              current === project.id ? null : project.id,
                            );
                          }}
                          type="button"
                        >
                          {showFallbackAvatar ? (
                            <div
                              aria-hidden="true"
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tracking-wide shadow-sm ring-1 ring-black/10"
                              style={{
                                backgroundColor: projectAvatar.backgroundColor,
                                borderColor: projectAvatar.borderColor,
                                color: projectAvatar.textColor,
                              }}
                            >
                              {projectAvatar.initials}
                            </div>
                          ) : (
                            <div
                              aria-hidden="true"
                              className={`h-9 w-9 shrink-0 overflow-hidden ${
                                hasUploadedIcon
                                  ? "rounded-full border border-zinc-300 bg-zinc-100 shadow-sm ring-1 ring-black/10"
                                  : "rounded-none border-0 bg-transparent shadow-none ring-0"
                              }`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                alt=""
                                aria-hidden="true"
                                className={`h-full w-full ${hasUploadedIcon ? "object-cover" : "object-contain"}`}
                                decoding="async"
                                draggable={false}
                                height={36}
                                loading="eager"
                                onError={() => {
                                  setProjectIconLoadErrors((previous) => ({
                                    ...previous,
                                    [project.id]: true,
                                  }));
                                }}
                                onLoad={() => {
                                  setProjectIconLoadErrors((previous) => {
                                    if (!previous[project.id]) {
                                      return previous;
                                    }

                                    const next = { ...previous };
                                    delete next[project.id];
                                    return next;
                                  });
                                }}
                                src={projectIconSource}
                                width={36}
                              />
                            </div>
                          )}
                        </button>
                        {openProjectIconMenuId === project.id ? (
                          <div
                            className="absolute left-0 z-20 mt-1 min-w-[185px] rounded-md border border-black/10 bg-white p-1 shadow-lg"
                            role="menu"
                          >
                            <button
                              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100"
                              disabled={projectIconUploadProjectId === project.id}
                              onMouseDown={stopDragPropagation}
                              onPointerDown={stopDragPropagation}
                              onClick={() => {
                                setOpenProjectIconMenuId(null);
                                setProjectIconPickerProjectId(project.id);
                                projectIconInputRef.current?.click();
                              }}
                              role="menuitem"
                              type="button"
                            >
                              <Upload className="h-4 w-4" />
                              <span>Upload image</span>
                            </button>
                            {hasUploadedIcon ? (
                              <button
                                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-red-700 hover:bg-red-50"
                                disabled={projectIconDeleteProjectId === project.id}
                                onMouseDown={stopDragPropagation}
                                onPointerDown={stopDragPropagation}
                                onClick={() => {
                                  setOpenProjectIconMenuId(null);
                                  void handleProjectIconDelete(project.id);
                                }}
                                role="menuitem"
                                type="button"
                              >
                                <Trash2 className="h-4 w-4" />
                                <span>Delete</span>
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      {editingProjectId === project.id ? (
                        <div
                          className="flex items-center gap-1"
                          onMouseDown={stopDragPropagation}
                          onPointerDown={stopDragPropagation}
                        >
                          <Input
                            autoFocus
                            className="h-8 w-[220px]"
                            draggable={false}
                            onChange={(event) => setEditingProjectName(event.target.value)}
                            onDragStart={preventControlDragStart}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void saveProjectNameEdit();
                                return;
                              }
                              if (event.key === "Escape") {
                                event.preventDefault();
                                cancelProjectNameEdit();
                              }
                            }}
                            onMouseDown={stopDragPropagation}
                            onPointerDown={stopDragPropagation}
                            value={editingProjectName}
                          />
                          <Button
                            aria-label="Save project name"
                            className="h-8 w-8 p-0"
                            disabled={editingProjectSubmitting}
                            draggable={false}
                            onDragStart={preventControlDragStart}
                            onMouseDown={stopDragPropagation}
                            onPointerDown={stopDragPropagation}
                            onClick={() => void saveProjectNameEdit()}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            <Save className="h-4 w-4" />
                          </Button>
                          <Button
                            aria-label="Cancel project rename"
                            className="h-8 w-8 p-0"
                            disabled={editingProjectSubmitting}
                            draggable={false}
                            onDragStart={preventControlDragStart}
                            onMouseDown={stopDragPropagation}
                            onPointerDown={stopDragPropagation}
                            onClick={cancelProjectNameEdit}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="group/project-name flex items-center gap-1">
                          <Link
                            className="font-medium underline-offset-4 hover:underline"
                            href={buildTaskScopeHref(project.id)}
                          >
                            {project.name}
                          </Link>
                          <Button
                            aria-label={`Rename project ${project.name}`}
                            className="h-7 w-7 p-0 opacity-0 transition-opacity group-hover/project-name:opacity-100"
                            draggable={false}
                            onDragStart={preventControlDragStart}
                            onMouseDown={stopDragPropagation}
                            onPointerDown={stopDragPropagation}
                            onClick={() => startProjectNameEdit(project)}
                            size="sm"
                            title={`Rename project ${project.name}`}
                            type="button"
                            variant="ghost"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {projectCollapsed ? (
                            <span className="max-w-[42ch] truncate text-xs font-normal text-zinc-500">
                              {project.path}
                            </span>
                          ) : null}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        aria-label={projectCollapsed ? "Expand project" : "Collapse project to simple line"}
                        className="h-8 w-8 rounded-full p-0"
                        draggable={false}
                        onDragStart={preventControlDragStart}
                        onMouseDown={stopDragPropagation}
                        onPointerDown={stopDragPropagation}
                        onClick={() => void handleProjectCollapsedToggle(project)}
                        size="sm"
                        title={projectCollapsed ? "Expand project" : "Collapse project to simple line"}
                        type="button"
                        variant="outline"
                      >
                        {projectCollapsed ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronUp className="h-4 w-4" />
                        )}
                        <span className="sr-only">
                          {projectCollapsed ? "Expand project" : "Collapse project to simple line"}
                        </span>
                      </Button>
                      <div className="relative" data-project-actions-menu>
                        <Button
                          aria-expanded={openProjectMenuId === project.id}
                          aria-haspopup="menu"
                          aria-label={`Project actions for ${project.name}`}
                          className="h-8 w-8 rounded-full border-black/15 p-0 text-black/70 hover:bg-black/5 hover:text-black"
                          draggable={false}
                          onDragStart={preventControlDragStart}
                          onMouseDown={stopDragPropagation}
                          onPointerDown={stopDragPropagation}
                          onClick={() =>
                            setOpenProjectMenuId((current) =>
                              current === project.id ? null : project.id,
                            )
                          }
                          size="sm"
                          title={`Project actions for ${project.name}`}
                          type="button"
                          variant="outline"
                        >
                          <EllipsisVertical className="h-4 w-4" />
                          <span className="sr-only">Project actions</span>
                        </Button>
                        {openProjectMenuId === project.id ? (
                          <div
                            className="absolute right-0 z-20 mt-1 min-w-[95px] rounded-md border border-black/10 bg-white p-1 shadow-lg"
                            role="menu"
                          >
                            <button
                              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-red-700 hover:bg-red-50"
                              onMouseDown={stopDragPropagation}
                              onPointerDown={stopDragPropagation}
                              onClick={() => {
                                setOpenProjectMenuId(null);
                                setDeleteProjectTarget({
                                  id: project.id,
                                  name: project.name,
                                });
                              }}
                              role="menuitem"
                              type="button"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span>Delete</span>
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </CardTitle>
                  {projectCollapsed ? null : <div className="text-xs text-zinc-600">{project.path}</div>}
                </CardHeader>
                {projectCollapsed ? null : (
                  <CardContent>
                    <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
                        <FolderGit2 className="h-3.5 w-3.5" />
                        <span>Subprojects</span>
                      </div>
                      <Button
                        aria-label={projectSubprojectsVisible ? "Hide subprojects" : "Show subprojects"}
                        className="h-8 w-8 rounded-full p-0"
                        draggable={false}
                        onDragStart={preventControlDragStart}
                        onMouseDown={stopDragPropagation}
                        onPointerDown={stopDragPropagation}
                        onClick={() => void handleProjectSubprojectsListToggle(project)}
                        size="sm"
                        title={projectSubprojectsVisible ? "Hide subprojects" : "Show subprojects"}
                        type="button"
                        variant="outline"
                      >
                        {projectSubprojectsVisible ? (
                          <ArrowUp className="h-4 w-4" />
                        ) : (
                          <ArrowDown className="h-4 w-4" />
                        )}
                        <span className="sr-only">
                          {projectSubprojectsVisible ? "Hide subprojects" : "Show subprojects"}
                        </span>
                      </Button>
                    </div>
                    {projectSubprojectsVisible ? (
                      <>
                        <SubprojectQuickAdd
                          defaultPath={project.path}
                          onSubmit={(payload) => handleQuickSubprojectCreate(project, payload)}
                          stopPropagation
                          submitAriaLabel={`Create subproject in ${project.name}`}
                          submitTitle={`Create subproject in ${project.name}`}
                        />
                        {project.subprojects.length < 1 ? (
                          <div className="rounded-md border border-dashed border-black/15 px-3 py-2 text-sm text-zinc-500">
                            No subprojects
                          </div>
                        ) : (
                          project.subprojects.map((subproject) => {
                            const activeSubprojectTasks = subproject.tasks.filter(
                              (task) => !isFinishedTask(task),
                            );
                            const subprojectTasksExpanded =
                              expandedSubprojectTasks[
                                getSubprojectTasksKey(project.id, subproject.id)
                              ] ?? false;
                            const subprojectEditingName = editingSubprojectId === subproject.id;

                            return (
                              <div
                                className="rounded-md border border-zinc-300/80 bg-zinc-50/70"
                                draggable={!subprojectEditingName}
                                key={subproject.id}
                                onDragEnd={() => setDraggingSubproject(null)}
                                onDragOver={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                }}
                                onDragStart={(event) => {
                                  if (
                                    subprojectEditingName ||
                                    shouldBlockContainerDragStart(event)
                                  ) {
                                    event.preventDefault();
                                    return;
                                  }
                                  event.stopPropagation();
                                  setDraggingSubproject({
                                    projectId: project.id,
                                    subprojectId: subproject.id,
                                  });
                                }}
                                onDrop={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  void handleSubprojectDrop(project.id, subproject.id);
                                }}
                              >
                                <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-md bg-zinc-100/70 px-3 py-2">
                                  <div className="flex items-center gap-2">
                                    <GripVertical className="h-4 w-4 text-zinc-400" />
                                    <Button
                                      aria-label={subproject.paused ? "Resume subproject" : "Pause subproject"}
                                      className={`h-8 w-8 rounded-full p-0 ${
                                        subproject.paused
                                          ? "border-amber-300 text-amber-700 hover:bg-amber-50"
                                          : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                      }`}
                                      draggable={false}
                                      onDragStart={preventControlDragStart}
                                      onMouseDown={stopDragPropagation}
                                      onPointerDown={stopDragPropagation}
                                      onClick={() => void handleSubprojectPauseToggle(subproject)}
                                      size="sm"
                                      title={subproject.paused ? "Resume subproject" : "Pause subproject"}
                                      type="button"
                                      variant="outline"
                                    >
                                      {subproject.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                                      <span className="sr-only">
                                        {subproject.paused ? "Resume subproject" : "Pause subproject"}
                                      </span>
                                    </Button>
                                    {subprojectEditingName ? (
                                      <div
                                        className="flex items-center gap-1"
                                        onMouseDown={stopDragPropagation}
                                        onPointerDown={stopDragPropagation}
                                      >
                                        <Input
                                          autoFocus
                                          className="h-8 w-[220px]"
                                          draggable={false}
                                          onChange={(event) => setEditingSubprojectName(event.target.value)}
                                          onDragStart={preventControlDragStart}
                                          onKeyDown={(event) => {
                                            if (event.key === "Enter") {
                                              event.preventDefault();
                                              void saveSubprojectNameEdit();
                                              return;
                                            }
                                            if (event.key === "Escape") {
                                              event.preventDefault();
                                              cancelSubprojectNameEdit();
                                            }
                                          }}
                                          onMouseDown={stopDragPropagation}
                                          onPointerDown={stopDragPropagation}
                                          value={editingSubprojectName}
                                        />
                                        <Button
                                          aria-label="Save subproject name"
                                          className="h-8 w-8 p-0"
                                          disabled={editingSubprojectSubmitting}
                                          draggable={false}
                                          onDragStart={preventControlDragStart}
                                          onMouseDown={stopDragPropagation}
                                          onPointerDown={stopDragPropagation}
                                          onClick={() => void saveSubprojectNameEdit()}
                                          size="sm"
                                          type="button"
                                          variant="outline"
                                        >
                                          <Save className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          aria-label="Cancel subproject rename"
                                          className="h-8 w-8 p-0"
                                          disabled={editingSubprojectSubmitting}
                                          draggable={false}
                                          onDragStart={preventControlDragStart}
                                          onMouseDown={stopDragPropagation}
                                          onPointerDown={stopDragPropagation}
                                          onClick={cancelSubprojectNameEdit}
                                          size="sm"
                                          type="button"
                                          variant="outline"
                                        >
                                          <X className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    ) : (
                                      <div className="group/subproject-name flex items-center gap-1">
                                        <button
                                          className="font-medium text-left underline-offset-4 hover:underline"
                                          draggable={false}
                                          onMouseDown={stopDragPropagation}
                                          onPointerDown={stopDragPropagation}
                                          onClick={() =>
                                            toggleSubprojectTasks(project.id, subproject.id)
                                          }
                                          type="button"
                                        >
                                          {subproject.name}
                                        </button>
                                        <Button
                                          aria-label={`Rename subproject ${subproject.name}`}
                                          className="h-7 w-7 p-0 opacity-0 transition-opacity group-hover/subproject-name:opacity-100"
                                          draggable={false}
                                          onDragStart={preventControlDragStart}
                                          onMouseDown={stopDragPropagation}
                                          onPointerDown={stopDragPropagation}
                                          onClick={() => startSubprojectNameEdit(subproject)}
                                          size="sm"
                                          title={`Rename subproject ${subproject.name}`}
                                          type="button"
                                          variant="ghost"
                                        >
                                          <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      aria-label={
                                        subprojectTasksExpanded
                                          ? `Hide tasks for ${subproject.name}`
                                          : `Show tasks for ${subproject.name}`
                                      }
                                      className="h-8 w-8 rounded-full p-0"
                                      draggable={false}
                                      onDragStart={preventControlDragStart}
                                      onMouseDown={stopDragPropagation}
                                      onPointerDown={stopDragPropagation}
                                      onClick={() =>
                                        toggleSubprojectTasks(project.id, subproject.id)
                                      }
                                      size="sm"
                                      title={
                                        subprojectTasksExpanded
                                          ? `Hide tasks for ${subproject.name}`
                                          : `Show tasks for ${subproject.name}`
                                      }
                                      type="button"
                                      variant="outline"
                                    >
                                      {subprojectTasksExpanded ? (
                                        <ChevronUp className="h-4 w-4" />
                                      ) : (
                                        <ChevronDown className="h-4 w-4" />
                                      )}
                                      <span className="sr-only">
                                        {subprojectTasksExpanded
                                          ? `Hide tasks for ${subproject.name}`
                                          : `Show tasks for ${subproject.name}`}
                                      </span>
                                    </Button>
                                    <Button
                                      aria-label={`Delete subproject ${subproject.name}`}
                                      className="h-8 w-8 rounded-full border-black/15 p-0 text-black/70 hover:bg-black/5 hover:text-black"
                                      draggable={false}
                                      onDragStart={preventControlDragStart}
                                      onMouseDown={stopDragPropagation}
                                      onPointerDown={stopDragPropagation}
                                      onClick={() =>
                                        setDeleteSubprojectTarget({
                                          id: subproject.id,
                                          name: subproject.name,
                                        })
                                      }
                                      size="sm"
                                      title={`Delete subproject ${subproject.name}`}
                                      type="button"
                                      variant="outline"
                                    >
                                      <X className="h-4 w-4" />
                                      <span className="sr-only">Delete subproject</span>
                                    </Button>
                                  </div>
                                </div>

                                {subprojectTasksExpanded ? (
                                  <div className="space-y-2 border-t border-black/10 p-2">
                                    {renderTaskComposer(
                                      project,
                                      getTaskComposerScopeKey(project.id, subproject.id),
                                      {
                                        placeholder: `Add task to ${subproject.name}`,
                                        submitAriaLabel: `Add task to ${subproject.name}`,
                                        submitTitle: `Add task to ${subproject.name}`,
                                      },
                                      (payload, selectedInstructionSetId) =>
                                        handleQuickTaskCreate(
                                          project,
                                          payload,
                                          subproject.id,
                                          selectedInstructionSetId,
                                        ),
                                    )}
                                    {activeSubprojectTasks.length < 1 ? (
                                      <div className="rounded-md border border-dashed border-black/15 px-3 py-2 text-sm text-zinc-500">
                                        No active tasks in this subproject
                                      </div>
                                    ) : (
                                      activeSubprojectTasks.map((task) => {
                                        const taskLocked = !canEditTask(task);
                                        const taskInProgress = task.status === "in_progress";
                                        return (
                                          <TaskInlineRow
                                            deleteAriaLabel={`Remove task ${task.text}`}
                                            deleteDisabled={taskLocked}
                                            deleteTitle={
                                              taskLocked
                                                ? "Task is currently executing and cannot be changed"
                                                : `Remove task ${task.text}`
                                            }
                                            disableText={taskLocked}
                                            inProgress={task.status === "in_progress"}
                                            key={task.id}
                                            locked={taskLocked}
                                            sourceInstructionSetName={getTaskSourceLabel(task)}
                                            onDelete={() =>
                                              setDeleteTaskTarget({
                                                id: task.id,
                                                text: task.text,
                                              })
                                            }
                                            onOpen={() => openTaskDetails(project, task)}
                                            onPauseToggle={() => void handleProjectTaskPauseToggle(task)}
                                            onStop={
                                              taskInProgress
                                                ? () =>
                                                    setStopTaskTarget({
                                                      id: task.id,
                                                      text: task.text,
                                                    })
                                                : undefined
                                            }
                                            onControlDragStart={preventControlDragStart}
                                            onControlMouseDown={stopDragPropagation}
                                            onControlPointerDown={stopDragPropagation}
                                            paused={task.paused}
                                            text={task.text}
                                            textActionTitle={
                                              taskLocked
                                                ? "Task is currently executing and cannot be edited"
                                                : "Edit task"
                                            }
                                          />
                                        );
                                      })
                                    )}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })
                        )}
                      </>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
                        <ListTodo className="h-3.5 w-3.5" />
                        <span>Tasks</span>
                      </div>
                      <Button
                        aria-label={projectTasksVisible ? "Hide project tasks" : "Show project tasks"}
                        className="h-8 w-8 rounded-full p-0"
                        draggable={false}
                        onDragStart={preventControlDragStart}
                        onMouseDown={stopDragPropagation}
                        onPointerDown={stopDragPropagation}
                        onClick={() => void handleProjectTasksListToggle(project)}
                        size="sm"
                        title={projectTasksVisible ? "Hide project tasks" : "Show project tasks"}
                        type="button"
                        variant="outline"
                      >
                        {projectTasksVisible ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                        <span className="sr-only">
                          {projectTasksVisible ? "Hide project tasks" : "Show project tasks"}
                        </span>
                      </Button>
                    </div>
                    {projectTasksVisible ? (
                      <>
                        {renderTaskComposer(
                          project,
                          getTaskComposerScopeKey(project.id),
                          {
                            placeholder: "Add task",
                            submitAriaLabel: `Add task to ${project.name}`,
                            submitTitle: `Add task to ${project.name}`,
                          },
                          (payload, selectedInstructionSetId) =>
                            handleQuickTaskCreate(project, payload, null, selectedInstructionSetId),
                        )}

                        {visibleProjectTasks.length < 1 ? (
                          <div className="rounded-md border border-dashed border-black/15 px-3 py-2 text-sm text-zinc-500">
                            No active tasks
                          </div>
                        ) : (
                          visibleProjectTasks.map((task) => {
                            const taskLocked = !canEditTask(task);
                            const taskInProgress = task.status === "in_progress";

                            return (
                              <TaskInlineRow
                                deleteAriaLabel={`Remove task ${task.text}`}
                                deleteDisabled={taskLocked}
                                deleteTitle={
                                  taskLocked
                                    ? "Task is currently executing and cannot be changed"
                                    : `Remove task ${task.text}`
                                }
                                disableText={taskLocked}
                                draggable={!taskLocked}
                                inProgress={task.status === "in_progress"}
                                key={task.id}
                                locked={taskLocked}
                                sourceInstructionSetName={getTaskSourceLabel(task)}
                                {...createDraggableContainerHandlers({
                                  enabled: !taskLocked,
                                  onDragEnd: () => setDraggingProjectTask(null),
                                  onDragStart: () => {
                                    setDraggingProjectTask({ projectId: project.id, taskId: task.id });
                                  },
                                  onDrop: () => void handleProjectTaskDrop(project.id, task.id),
                                })}
                                onDelete={() =>
                                  setDeleteTaskTarget({
                                    id: task.id,
                                    text: task.text,
                                  })
                                }
                                onOpen={() => openTaskDetails(project, task)}
                                onPauseToggle={() => void handleProjectTaskPauseToggle(task)}
                                onStop={
                                  taskInProgress
                                    ? () =>
                                        setStopTaskTarget({
                                          id: task.id,
                                          text: task.text,
                                        })
                                    : undefined
                                }
                                onControlDragStart={preventControlDragStart}
                                onControlMouseDown={stopDragPropagation}
                                onControlPointerDown={stopDragPropagation}
                                paused={task.paused}
                                text={task.text}
                                textActionTitle={
                                  taskLocked
                                    ? "Task is currently executing and cannot be edited"
                                    : "Edit task"
                                }
                              />
                            );
                          })
                        )}
                      </>
                    ) : (
                      <div className="flex items-center gap-2 rounded-md border border-dashed border-amber-300 bg-amber-50/70 px-3 py-2 text-sm text-amber-800">
                        <EyeOff className="h-4 w-4" />
                        <span>Task list is hidden. Click the arrow button to show tasks.</span>
                      </div>
                    )}
                  </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            </div>
          );
        })}
      </div>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setStopTaskTarget(null);
          }
        }}
        open={Boolean(stopTaskTarget)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Stop Task</DialogTitle>
            <DialogDescription>
              Stop task <strong>{truncateTaskPreview(stopTaskTarget?.text ?? "")}</strong>? This will
              terminate its current execution.
            </DialogDescription>
          </DialogHeader>
          {!stopTaskTargetRunning ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              This task is no longer running.
            </div>
          ) : null}
          <DialogFooter>
            <Button onClick={() => setStopTaskTarget(null)} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              className="bg-orange-600 text-white hover:bg-orange-700"
              disabled={!stopTaskTargetRunning}
              onClick={() => void handleConfirmTaskStop()}
              type="button"
            >
              <Square className="h-4 w-4" />
              Stop
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TaskDeleteConfirmationDialog
        onCancel={() => setDeleteTaskTarget(null)}
        onConfirm={() => void handleConfirmTaskDelete()}
        open={Boolean(deleteTaskTarget)}
        taskText={truncateTaskPreview(deleteTaskTarget?.text ?? "")}
        title="Delete Task"
        warning={
          deleteTaskTargetLocked ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Task is currently in execution and cannot be changed.
            </div>
          ) : null
        }
        confirmDisabled={deleteTaskTargetLocked}
      />

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setDeleteProjectTarget(null);
          }
        }}
        open={Boolean(deleteProjectTarget)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
            <DialogDescription>
              Delete project <strong>{deleteProjectTarget?.name ?? ""}</strong>? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setDeleteProjectTarget(null)} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => void handleConfirmProjectDelete()}
              type="button"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setDeleteSubprojectTarget(null);
          }
        }}
        open={Boolean(deleteSubprojectTarget)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Subproject</DialogTitle>
            <DialogDescription>
              Delete subproject <strong>{deleteSubprojectTarget?.name ?? ""}</strong>? This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setDeleteSubprojectTarget(null)} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => void handleConfirmSubprojectDelete()}
              type="button"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setTaskDetailsTarget(null);
          }
        }}
        open={Boolean(taskDetailsTarget)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ListTodo className="h-4 w-4 text-zinc-500" />
              Task
            </DialogTitle>
            <DialogDescription className="text-sm text-zinc-600">
              {taskDetailsTarget ? `Project: ${taskDetailsTarget.projectName}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {taskDetailsTarget ? (
              <div className="rounded-md border border-black/10 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span>Created: {formatTaskDateTime(taskDetailsTarget.task.createdAt)}</span>
                  <span>Updated: {formatTaskDateTime(taskDetailsTarget.task.updatedAt)}</span>
                </div>
              </div>
            ) : null}
            <Textarea
              disabled={!taskDetailsTarget || !canEditTask(taskDetailsTarget.task)}
              onChange={(event) => setTaskDetailsText(event.target.value)}
              placeholder="Task text"
              value={taskDetailsText}
            />
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <TaskModelSelect
                disabled={!taskDetailsTarget || !canEditTask(taskDetailsTarget.task)}
                onValueChange={setTaskDetailsModel}
                value={taskDetailsModel}
              />
              <TaskReasoningSelect
                disabled={!taskDetailsTarget || !canEditTask(taskDetailsTarget.task)}
                onValueChange={setTaskDetailsReasoning}
                value={taskDetailsReasoning}
              />
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <label className="flex h-10 items-center gap-2 rounded-md border border-black/15 px-3 text-sm">
                <Checkbox
                  checked={taskDetailsIncludeContext}
                  disabled={!taskDetailsTarget || !canEditTask(taskDetailsTarget.task)}
                  onCheckedChange={(checked) => setTaskDetailsIncludeContext(Boolean(checked))}
                />
                <span>Include context</span>
              </label>
              <Input
                disabled={
                  !taskDetailsIncludeContext || !taskDetailsTarget || !canEditTask(taskDetailsTarget.task)
                }
                min={0}
                onChange={(event) =>
                  setTaskDetailsContextCount(Number.parseInt(event.target.value || "0", 10))
                }
                placeholder="Messages count"
                type="number"
                value={taskDetailsContextCount}
              />
            </div>
            {taskDetailsTarget && !canEditTask(taskDetailsTarget.task) ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Task is currently in execution and cannot be edited.
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button onClick={() => setTaskDetailsTarget(null)} type="button" variant="outline">
              Close
            </Button>
            <Button
              disabled={
                taskDetailsSubmitting ||
                !taskDetailsTarget ||
                !canEditTask(taskDetailsTarget.task) ||
                taskDetailsText.trim().length < 1
              }
              onClick={() => void handleTaskDetailsSave()}
              type="button"
            >
              <Save className="h-4 w-4" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={(open) => !open && setErrorMessage(null)} open={Boolean(errorMessage)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Error</DialogTitle>
            <DialogDescription>
              {errorMessage ?? "An unexpected error occurred."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setErrorMessage(null)} type="button" variant="outline">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
