"use client";

import Link from "next/link";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  GripVertical,
  Hand,
  Pause,
  Pencil,
  Play,
  Settings,
  Square,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  DEFAULT_TASK_MODEL,
  DEFAULT_TASK_REASONING,
} from "@/lib/task-reasoning";

import type { ProjectEntity, SubprojectEntity, TaskEntity } from "../../shared/contracts";
import { canEditTask, requestJson } from "./app-dashboard-helpers";
import {
  SubprojectQuickAdd,
  type SubprojectQuickAddPayload,
} from "./subproject-quick-add";
import { TaskQuickAdd, type TaskQuickAddPayload } from "./task-quick-add";
import { usePreventUnhandledFileDrop } from "./use-prevent-unhandled-file-drop";
import { useRealtimeSync } from "./use-realtime-sync";
import { Badge } from "./ui/badge";
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
import { Textarea } from "./ui/textarea";
import { TaskModelSelect, TaskReasoningSelect } from "./task-select-dropdowns";

type SubprojectWithTasks = SubprojectEntity & { tasks: TaskEntity[] };
type ProjectTree = ProjectEntity & {
  subprojects: SubprojectWithTasks[];
  tasks: TaskEntity[];
};

interface TaskResponseEntry {
  createdAt: string;
  fullText: string;
  id: string;
  taskId: string;
}

interface ProjectTasksPageProps {
  projectId: string;
}

interface DraggingTaskState {
  scopeId: string;
  taskId: string;
}

const TASK_RESPONSE_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function isFinishedTask(task: TaskEntity): boolean {
  return task.status === "done" || task.status === "failed" || task.status === "stopped";
}

function isErrorTask(task: TaskEntity): boolean {
  return task.status === "failed";
}

function toDisplayedTasks(tasks: TaskEntity[]): TaskEntity[] {
  const activeTasks = tasks.filter((task) => !isFinishedTask(task));
  const finishedTasks = tasks.filter((task) => isFinishedTask(task));
  return [...activeTasks, ...finishedTasks];
}

function formatTaskResponseDate(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return TASK_RESPONSE_DATE_FORMATTER.format(parsed);
}

function truncateTaskPreview(text: string, limit = 100): string {
  const normalized = text.trim();
  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit).trimEnd()}...`;
}

function getSubprojectScopeId(subprojectId: string): string {
  return `subproject:${subprojectId}`;
}

export function ProjectTasksPage({ projectId }: ProjectTasksPageProps) {
  usePreventUnhandledFileDrop();

  const [projects, setProjects] = useState<ProjectTree[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [responseViewer, setResponseViewer] = useState<{
    finishedAt: string | null;
    response: TaskResponseEntry;
    status: TaskEntity["status"];
    taskText: string;
  } | null>(null);

  const [deleteTaskTarget, setDeleteTaskTarget] = useState<TaskEntity | null>(null);
  const [editTaskTarget, setEditTaskTarget] = useState<TaskEntity | null>(null);
  const [editTaskText, setEditTaskText] = useState("");
  const [editTaskModel, setEditTaskModel] = useState("");
  const [editTaskReasoning, setEditTaskReasoning] = useState("");
  const [editTaskSubmitting, setEditTaskSubmitting] = useState(false);

  const [draggingTask, setDraggingTask] = useState<DraggingTaskState | null>(null);
  const [draggingSubprojectId, setDraggingSubprojectId] = useState<string | null>(null);
  const [expandedSubprojectIds, setExpandedSubprojectIds] = useState<Record<string, boolean>>({});

  const stopDragPropagation = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
  };

  const preventControlDragStart = (event: {
    preventDefault: () => void;
    stopPropagation: () => void;
  }) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const loadTree = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }

    try {
      const tree = await requestJson<ProjectTree[]>("/api/projects/tree");
      setProjects(tree);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load tasks");
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  useRealtimeSync(() => {
    void loadTree({ silent: true });
  });

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projectId, projects],
  );

  const displayedProjectTasks = useMemo(
    () => toDisplayedTasks(selectedProject?.tasks ?? []),
    [selectedProject],
  );

  const activeProjectTasks = useMemo(
    () => displayedProjectTasks.filter((task) => !isFinishedTask(task)),
    [displayedProjectTasks],
  );

  useEffect(() => {
    if (!selectedProject) {
      return;
    }

    const knownSubprojectIds = new Set(selectedProject.subprojects.map((item) => item.id));
    setExpandedSubprojectIds((current) => {
      let changed = false;
      const next: Record<string, boolean> = {};
      for (const [subprojectId, expanded] of Object.entries(current)) {
        if (!knownSubprojectIds.has(subprojectId)) {
          changed = true;
          continue;
        }
        next[subprojectId] = expanded;
      }
      return changed ? next : current;
    });
  }, [selectedProject]);

  const handleTaskAction = async (
    taskId: string,
    action: "pause" | "remove" | "resume" | "stop",
  ) => {
    try {
      await requestJson(`/api/tasks/${taskId}/action`, {
        body: JSON.stringify({ action }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await loadTree();
      if (action !== "pause" && action !== "resume") {
        toast.success(`Task action applied: ${action}`);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update task action");
    }
  };

  const handleConfirmTaskDelete = async () => {
    if (!deleteTaskTarget) {
      return;
    }

    await handleTaskAction(deleteTaskTarget.id, "remove");
    setDeleteTaskTarget(null);
  };

  const handleTaskEdit = async (task: TaskEntity) => {
    if (!canEditTask(task)) {
      setErrorMessage("Running tasks cannot be edited");
      return;
    }
    setEditTaskTarget(task);
    setEditTaskText(task.text);
    setEditTaskModel(task.model);
    setEditTaskReasoning(task.reasoning);
  };

  const submitTaskEdit = async () => {
    if (!editTaskTarget) {
      return;
    }

    setEditTaskSubmitting(true);
    try {
      await requestJson(`/api/tasks/${editTaskTarget.id}`, {
        body: JSON.stringify({
          model: editTaskModel,
          reasoning: editTaskReasoning,
          text: editTaskText,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      await loadTree();
      setEditTaskTarget(null);
      toast.success("Task updated");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to edit task");
    } finally {
      setEditTaskSubmitting(false);
    }
  };

  const handleTaskResponseView = async (task: TaskEntity) => {
    try {
      const payload = await requestJson<{ responses: TaskResponseEntry[] }>(
        `/api/tasks/${task.id}/responses?limit=1`,
      );
      const latest = payload.responses[0];
      if (!latest) {
        throw new Error("No responses recorded for this task yet.");
      }
      setResponseViewer({
        finishedAt: isFinishedTask(task) ? task.updatedAt : null,
        response: latest,
        status: task.status,
        taskText: task.text,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load task response");
    }
  };

  const handleProjectPauseToggle = async () => {
    if (!selectedProject) {
      return;
    }

    try {
      const nextPaused = !selectedProject.paused;
      await requestJson(`/api/projects/${selectedProject.id}`, {
        body: JSON.stringify({
          paused: nextPaused,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      await loadTree();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update project state");
    }
  };

  const handleSubprojectPauseToggle = async (subproject: SubprojectWithTasks) => {
    try {
      const nextPaused = !subproject.paused;
      await requestJson(`/api/subprojects/${subproject.id}`, {
        body: JSON.stringify({
          paused: nextPaused,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      await loadTree();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update subproject state");
    }
  };

  const handleSubprojectDrop = async (targetSubprojectId: string) => {
    if (!selectedProject) {
      return;
    }

    if (!draggingSubprojectId || draggingSubprojectId === targetSubprojectId) {
      return;
    }

    const currentOrder = selectedProject.subprojects.map((subproject) => subproject.id);
    const fromIndex = currentOrder.findIndex((id) => id === draggingSubprojectId);
    const toIndex = currentOrder.findIndex((id) => id === targetSubprojectId);
    if (fromIndex < 0 || toIndex < 0) {
      return;
    }

    const reordered = currentOrder.slice();
    const [removed] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, removed);

    try {
      await requestJson("/api/subprojects/reorder", {
        body: JSON.stringify({ orderedIds: reordered, projectId: selectedProject.id }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await loadTree();
      toast.success("Subproject priority updated");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to reorder subprojects");
    } finally {
      setDraggingSubprojectId(null);
    }
  };

  const handleTaskDrop = async (
    targetTaskId: string,
    scopeId: string,
    activeTasksInScope: TaskEntity[],
  ) => {
    if (!draggingTask || draggingTask.scopeId !== scopeId || draggingTask.taskId === targetTaskId) {
      return;
    }

    const currentOrder = activeTasksInScope.map((task) => task.id);
    const fromIndex = currentOrder.findIndex((id) => id === draggingTask.taskId);
    const toIndex = currentOrder.findIndex((id) => id === targetTaskId);
    if (fromIndex < 0 || toIndex < 0) {
      return;
    }

    const reordered = currentOrder.slice();
    const [removed] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, removed);

    try {
      await requestJson("/api/tasks/reorder", {
        body: JSON.stringify({ orderedIds: reordered }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await loadTree();
      toast.success("Task priority updated");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to reorder tasks");
    } finally {
      setDraggingTask(null);
    }
  };

  const handleQuickTaskCreate = async (
    payload: TaskQuickAddPayload,
    subprojectId: string | null,
  ) => {
    if (!selectedProject) {
      return;
    }

    try {
      await requestJson("/api/tasks", {
        body: JSON.stringify({
          includePreviousContext: payload.includeContext,
          model: payload.model.trim() || DEFAULT_TASK_MODEL,
          previousContextMessages: payload.includeContext ? payload.contextCount : 0,
          projectId: selectedProject.id,
          reasoning: payload.reasoning.trim() || DEFAULT_TASK_REASONING,
          subprojectId,
          text: payload.text.trim(),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await loadTree();
      toast.success("Task created");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create task");
    }
  };

  const handleQuickSubprojectCreate = async (payload: SubprojectQuickAddPayload) => {
    if (!selectedProject) {
      return;
    }

    try {
      await requestJson("/api/subprojects", {
        body: JSON.stringify({
          metadata: payload.metadata || undefined,
          name: payload.name,
          path: payload.path || selectedProject.path,
          projectId: selectedProject.id,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await loadTree();
      toast.success("Subproject created");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create subproject");
    }
  };

  const toggleSubprojectExpanded = (subprojectId: string) => {
    setExpandedSubprojectIds((current) => ({
      ...current,
      [subprojectId]: !current[subprojectId],
    }));
  };

  const renderTaskRow = (
    task: TaskEntity,
    scopeId: string,
    activeTasksInScope: TaskEntity[],
  ) => {
    const canEdit = canEditTask(task);
    const finished = isFinishedTask(task);
    const failed = isErrorTask(task);
    const gripClassName = canEdit ? "h-4 w-4 text-zinc-400" : "h-4 w-4 text-zinc-300";
    const rowClassName = `flex flex-wrap items-center gap-2 rounded border border-black/10 bg-white p-2 ${
      !canEdit ? "border-black/5 bg-zinc-50 text-zinc-500" : ""
    }`;

    return (
      <div
        className={rowClassName}
        draggable={!finished}
        key={task.id}
        onDragEnd={() => setDraggingTask(null)}
        onDragOver={(event) => {
          if (!finished) {
            event.preventDefault();
          }
        }}
        onDragStart={(event) => {
          if (!finished) {
            event.stopPropagation();
            setDraggingTask({ scopeId, taskId: task.id });
          }
        }}
        onDrop={(event) => {
          if (!finished) {
            event.preventDefault();
            event.stopPropagation();
            void handleTaskDrop(task.id, scopeId, activeTasksInScope);
          }
        }}
      >
        <GripVertical className={gripClassName} />
        <div className="min-w-[180px] flex-1 text-sm">
          <button
            className="flex w-full items-center gap-2 text-left"
            onClick={() => {
              if (finished) {
                void handleTaskResponseView(task);
                return;
              }
              void handleTaskEdit(task);
            }}
            title={finished ? "Open task response" : "Edit task"}
            type="button"
          >
            {failed ? (
              <span aria-label="Task failed" title="Task failed">
                <AlertCircle className="h-4 w-4 text-red-600" />
              </span>
            ) : null}
            <span
              className={`${
                finished ? "line-through text-zinc-500" : ""
              } ${canEdit ? "cursor-pointer hover:underline" : "cursor-not-allowed"} underline-offset-2`}
            >
              {task.text}
            </span>
          </button>
        </div>
        {!canEdit ? <Badge>locked</Badge> : null}

        {!finished ? (
          <Button
            aria-label="Edit task"
            className="h-8 w-8 rounded-full border-blue-200 p-0 text-blue-700 hover:bg-blue-50"
            disabled={!canEdit}
            onClick={() => void handleTaskEdit(task)}
            onDragStart={preventControlDragStart}
            onMouseDown={stopDragPropagation}
            onPointerDown={stopDragPropagation}
            size="sm"
            title="Edit task"
            type="button"
            variant="outline"
          >
            <Pencil className="h-4 w-4" />
            <span className="sr-only">Edit</span>
          </Button>
        ) : null}

        {task.status === "in_progress" ? (
          <Button
            aria-label="Stop task"
            className="h-8 w-8 rounded-full border-orange-200 p-0 text-orange-700 hover:bg-orange-50"
            onClick={() => void handleTaskAction(task.id, "stop")}
            onDragStart={preventControlDragStart}
            onMouseDown={stopDragPropagation}
            onPointerDown={stopDragPropagation}
            size="sm"
            title="Stop task"
            type="button"
            variant="outline"
          >
            <Square className="h-4 w-4" />
            <span className="sr-only">Stop</span>
          </Button>
        ) : finished ? null : (
          <Button
            aria-label={task.paused ? "Resume task" : "Pause task"}
            className={`h-8 w-8 rounded-full p-0 ${
              task.paused
                ? "border-amber-300 text-amber-700 hover:bg-amber-50"
                : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            }`}
            onClick={() => void handleTaskAction(task.id, task.paused ? "resume" : "pause")}
            onDragStart={preventControlDragStart}
            onMouseDown={stopDragPropagation}
            onPointerDown={stopDragPropagation}
            size="sm"
            title={task.paused ? "Resume task" : "Pause task"}
            type="button"
            variant="outline"
          >
            {task.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            <span className="sr-only">{task.paused ? "Resume" : "Pause"}</span>
          </Button>
        )}

        <Button
          aria-label="Remove task"
          className="h-8 w-8 rounded-full border-red-200 p-0 text-red-700 hover:bg-red-50"
          onClick={() => setDeleteTaskTarget(task)}
          onDragStart={preventControlDragStart}
          onMouseDown={stopDragPropagation}
          onPointerDown={stopDragPropagation}
          size="sm"
          title="Remove task"
          type="button"
          variant="outline"
        >
          <Trash2 className="h-4 w-4" />
          <span className="sr-only">Remove</span>
        </Button>
      </div>
    );
  };

  if (loading) {
    return <div className="p-10 text-sm text-zinc-500">Loading tasks...</div>;
  }

  if (!selectedProject) {
    return (
      <div className="p-8">
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Project not found.
        </div>
      </div>
    );
  }

  const pageHeading = selectedProject.name;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-zinc-100 p-4 md:p-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            className="inline-flex items-center gap-2 text-xl font-semibold transition-opacity hover:opacity-80"
            href="/"
          >
            <Hand className="h-5 w-5" />
            OpenClap
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild type="button" variant="outline">
              <Link href="/settings">
                <Settings className="h-4 w-4" />
                <span className="sr-only">Settings</span>
              </Link>
            </Button>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-black/10 bg-white/70 px-4 py-3">
          <div className="space-y-1">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Project</div>
            <div className="flex items-center gap-2">
              <Button
                aria-label={selectedProject.paused ? "Resume project" : "Pause project"}
                className={`h-9 w-9 rounded-full p-0 ${
                  selectedProject.paused
                    ? "border-amber-300 text-amber-700 hover:bg-amber-50"
                    : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                }`}
                onClick={() => void handleProjectPauseToggle()}
                size="sm"
                title={selectedProject.paused ? "Resume project" : "Pause project"}
                type="button"
                variant="outline"
              >
                {selectedProject.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                <span className="sr-only">
                  {selectedProject.paused ? "Resume project" : "Pause project"}
                </span>
              </Button>
              <h1 className="text-3xl font-semibold tracking-tight">{pageHeading}</h1>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Subprojects ({selectedProject.subprojects.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <SubprojectQuickAdd
              defaultPath={selectedProject.path}
              onSubmit={handleQuickSubprojectCreate}
              submitAriaLabel={`Add subproject to ${selectedProject.name}`}
              submitTitle={`Add subproject to ${selectedProject.name}`}
            />
            {selectedProject.subprojects.length < 1 ? (
              <div className="rounded-md border border-dashed border-black/15 px-3 py-2 text-sm text-zinc-500">
                No subprojects yet.
              </div>
            ) : null}

            {selectedProject.subprojects.map((subproject) => {
              const subprojectScopeId = getSubprojectScopeId(subproject.id);
              const displayedSubprojectTasks = toDisplayedTasks(subproject.tasks);
              const activeSubprojectTasks = displayedSubprojectTasks.filter(
                (task) => !isFinishedTask(task),
              );
              const expanded = expandedSubprojectIds[subproject.id] ?? false;

              return (
                <div
                  className="rounded border border-zinc-300/80 bg-zinc-50/70 transition-colors"
                  draggable
                  id={`subproject-${subproject.id}`}
                  key={subproject.id}
                  onDragEnd={() => setDraggingSubprojectId(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDragStart={() => setDraggingSubprojectId(subproject.id)}
                  onDrop={() => void handleSubprojectDrop(subproject.id)}
                >
                  <div className="flex items-center gap-2 rounded-t bg-zinc-100/70 px-3 py-2">
                    <GripVertical className="h-4 w-4 text-zinc-400" />
                    <Button
                      aria-label={subproject.paused ? "Resume subproject" : "Pause subproject"}
                      className={`h-8 w-8 rounded-full p-0 ${
                        subproject.paused
                          ? "border-amber-300 text-amber-700 hover:bg-amber-50"
                          : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                      }`}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void handleSubprojectPauseToggle(subproject);
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
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

                    <button
                      className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                      onClick={() => toggleSubprojectExpanded(subproject.id)}
                      type="button"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="truncate text-sm font-medium">{subproject.name}</div>
                        <div className="truncate text-xs text-zinc-500">{subproject.path}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge>
                          {subproject.tasks.length} task{subproject.tasks.length === 1 ? "" : "s"}
                        </Badge>
                        {expanded ? (
                          <ChevronUp className="h-4 w-4 text-zinc-500" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-zinc-500" />
                        )}
                      </div>
                    </button>
                  </div>

                  {expanded ? (
                    <div className="space-y-2 border-t border-black/10 p-2">
                      <TaskQuickAdd
                        onSubmit={(payload) => handleQuickTaskCreate(payload, subproject.id)}
                        placeholder={`Add task to ${subproject.name}`}
                        projectId={selectedProject.id}
                        stopPropagation
                        submitAriaLabel={`Add task to ${subproject.name}`}
                        submitTitle={`Add task to ${subproject.name}`}
                      />

                      {displayedSubprojectTasks.length < 1 ? (
                        <div className="rounded-md border border-dashed border-black/15 px-3 py-2 text-sm text-zinc-500">
                          No tasks in this subproject.
                        </div>
                      ) : (
                        displayedSubprojectTasks.map((task) =>
                          renderTaskRow(task, subprojectScopeId, activeSubprojectTasks),
                        )
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tasks ({displayedProjectTasks.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <TaskQuickAdd
              onSubmit={(payload) => handleQuickTaskCreate(payload, null)}
              placeholder="Add task"
              projectId={selectedProject.id}
              submitAriaLabel={`Add task to ${selectedProject.name}`}
              submitTitle={`Add task to ${selectedProject.name}`}
            />
            {displayedProjectTasks.length < 1 ? (
              <div className="rounded-md border border-dashed border-black/15 px-3 py-2 text-sm text-zinc-500">
                No tasks in this project.
              </div>
            ) : (
              displayedProjectTasks.map((task) => renderTaskRow(task, "project", activeProjectTasks))
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog onOpenChange={(open) => !open && setErrorMessage(null)} open={Boolean(errorMessage)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Error</DialogTitle>
            <DialogDescription>{errorMessage ?? "An unexpected error occurred."}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setErrorMessage(null)} type="button" variant="outline">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTaskTarget(null);
          }
        }}
        open={Boolean(deleteTaskTarget)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Task</DialogTitle>
            <DialogDescription>
              Delete task <strong>{truncateTaskPreview(deleteTaskTarget?.text ?? "")}</strong>? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setDeleteTaskTarget(null)} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => void handleConfirmTaskDelete()}
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
            setEditTaskTarget(null);
          }
        }}
        open={Boolean(editTaskTarget)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
            <DialogDescription>Update task text, model, and reasoning in one form.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              onChange={(event) => setEditTaskText(event.target.value)}
              placeholder="Task text"
              value={editTaskText}
            />
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <TaskModelSelect onValueChange={setEditTaskModel} value={editTaskModel} />
              <TaskReasoningSelect onValueChange={setEditTaskReasoning} value={editTaskReasoning} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setEditTaskTarget(null)} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              disabled={editTaskSubmitting || editTaskText.trim().length < 1}
              onClick={() => void submitTaskEdit()}
              type="button"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={(open) => !open && setResponseViewer(null)} open={Boolean(responseViewer)}>
        <DialogContent className="sm:max-w-[64rem]">
          <DialogHeader>
            <DialogTitle className="inline-flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Task Response
            </DialogTitle>
            <DialogDescription>{responseViewer?.taskText ?? ""}</DialogDescription>
          </DialogHeader>
          <Textarea className="min-h-[280px] text-xs" readOnly value={responseViewer?.response.fullText ?? ""} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-md border border-black/10 bg-zinc-50 px-3 py-2">
              <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Response Created
              </div>
              <div className="text-xs text-zinc-700">{formatTaskResponseDate(responseViewer?.response.createdAt)}</div>
            </div>
            <div className="rounded-md border border-black/10 bg-zinc-50 px-3 py-2">
              <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Task Finished
              </div>
              <div className="text-xs text-zinc-700">
                {responseViewer?.finishedAt
                  ? formatTaskResponseDate(responseViewer.finishedAt)
                  : responseViewer?.status === "in_progress"
                    ? "In progress"
                    : "Not finished"}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setResponseViewer(null)} type="button" variant="outline">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
