"use client";

import Link from "next/link";
import {
  ChevronRight,
  FileText,
  Folder,
  FolderPlus,
  GripVertical,
  Hand,
  Pause,
  Pencil,
  Play,
  Plus,
  Settings,
  Square,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import type { ProjectEntity, SubprojectEntity, TaskEntity } from "../../shared/contracts";
import { buildTaskScopeHref, canEditTask, requestJson } from "./app-dashboard-helpers";
import { CreateSubprojectModal } from "./create-subproject-modal";
import { CreateTaskModal } from "./create-task-modal";
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
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

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
  subprojectId?: string | null;
}

function truncateTaskPreview(text: string, limit = 100): string {
  const normalized = text.trim();
  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit).trimEnd()}...`;
}

export function ProjectTasksPage({ projectId, subprojectId }: ProjectTasksPageProps) {
  const [projects, setProjects] = useState<ProjectTree[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [responseViewer, setResponseViewer] = useState<{
    response: TaskResponseEntry;
    taskText: string;
  } | null>(null);

  const [createTaskModalOpen, setCreateTaskModalOpen] = useState(false);
  const [createSubprojectModalOpen, setCreateSubprojectModalOpen] = useState(false);
  const [deleteTaskTarget, setDeleteTaskTarget] = useState<TaskEntity | null>(null);
  const [editTaskTarget, setEditTaskTarget] = useState<TaskEntity | null>(null);
  const [editTaskText, setEditTaskText] = useState("");
  const [editTaskModel, setEditTaskModel] = useState("");
  const [editTaskReasoning, setEditTaskReasoning] = useState("");
  const [editTaskSubmitting, setEditTaskSubmitting] = useState(false);

  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);

  const loadTree = useCallback(async () => {
    setLoading(true);
    try {
      const tree = await requestJson<ProjectTree[]>("/api/projects/tree");
      setProjects(tree);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projectId, projects],
  );

  const selectedSubproject = useMemo(() => {
    if (!selectedProject || !subprojectId) {
      return null;
    }
    return (
      selectedProject.subprojects.find((subproject) => subproject.id === subprojectId) ?? null
    );
  }, [selectedProject, subprojectId]);

  const selectedTasks = useMemo(() => {
    if (!selectedProject) {
      return [] as TaskEntity[];
    }

    if (subprojectId) {
      return selectedSubproject?.tasks ?? [];
    }

    return selectedProject.tasks;
  }, [selectedProject, selectedSubproject, subprojectId]);

  const visibleSelectedTasks = useMemo(
    () => selectedTasks.filter((task) => task.status !== "done"),
    [selectedTasks],
  );

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
      toast.success(`Task action applied: ${action}`);
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
        response: latest,
        taskText: task.text,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load task response");
    }
  };

  const handleTaskDrop = async (targetTaskId: string) => {
    if (!draggingTaskId || draggingTaskId === targetTaskId) {
      return;
    }

    const currentOrder = visibleSelectedTasks.map((task) => task.id);
    const fromIndex = currentOrder.findIndex((id) => id === draggingTaskId);
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
    }
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

  if (subprojectId && !selectedSubproject) {
    return (
      <div className="p-8">
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Subproject not found in this project.
        </div>
      </div>
    );
  }

  const scopeTitle = selectedSubproject
    ? `Subproject: ${selectedSubproject.name} (Project: ${selectedProject.name})`
    : `Project: ${selectedProject.name}`;
  const projectScopeHref = buildTaskScopeHref(selectedProject.id);
  const tasksSectionTitle = "Tasks";
  const pageHeading = selectedSubproject ? selectedSubproject.name : selectedProject.name;

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
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              {selectedSubproject ? "Subproject" : "Project"}
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">{pageHeading}</h1>
          </div>
          {selectedSubproject ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">
              <span>Subproject of</span>
              <Link className="font-medium text-zinc-800 underline-offset-4 hover:underline" href={projectScopeHref}>
                {selectedProject.name}
              </Link>
              <ChevronRight className="h-4 w-4 text-zinc-500" />
              <span className="text-zinc-700">Tasks</span>
            </div>
          ) : null}
        </div>

        {selectedSubproject ? (
          <Card>
            <CardContent className="space-y-3 py-4">
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Current Subproject Scope
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Folder className="h-4 w-4 text-zinc-500" />
                <span className="text-zinc-500">Parent project:</span>
                <Link className="font-medium underline-offset-4 hover:underline" href={projectScopeHref}>
                  {selectedProject.name}
                </Link>
                <span className="text-zinc-400">/</span>
                <span className="font-semibold">Subproject: {selectedSubproject.name}</span>
              </div>
              <div className="space-y-1 text-xs text-zinc-600">
                <div>
                  <span className="font-medium">Project path:</span> {selectedProject.path}
                </div>
                <div>
                  <span className="font-medium">Subproject path:</span> {selectedSubproject.path}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardContent className="py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => setCreateTaskModalOpen(true)} type="button">
                <Plus className="h-4 w-4" />
                Add Task
              </Button>
              <Button onClick={() => setCreateSubprojectModalOpen(true)} type="button" variant="outline">
                <FolderPlus className="h-4 w-4" />
                Add Subproject
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
              <CardTitle>
              {tasksSectionTitle} ({visibleSelectedTasks.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {visibleSelectedTasks.length < 1 ? (
              <div className="rounded-md border border-dashed border-black/15 px-3 py-2 text-sm text-zinc-500">
                No active tasks in this scope.
              </div>
            ) : null}

            {visibleSelectedTasks.map((task) => (
              <div
                className="flex flex-wrap items-center gap-2 rounded border border-black/10 bg-white p-2"
                draggable
                key={task.id}
                onDragOver={(event) => event.preventDefault()}
                onDragStart={() => setDraggingTaskId(task.id)}
                onDrop={() => void handleTaskDrop(task.id)}
              >
                <GripVertical className="h-4 w-4 text-zinc-400" />
                <div className="min-w-[180px] flex-1 text-sm">{task.text}</div>
                <Badge>{task.model}</Badge>
                {!canEditTask(task) ? <Badge>locked</Badge> : null}

                <Button
                  aria-label="Edit task"
                  className="h-8 w-8 rounded-full border-blue-200 p-0 text-blue-700 hover:bg-blue-50"
                  disabled={!canEditTask(task)}
                  onClick={() => void handleTaskEdit(task)}
                  size="sm"
                  title="Edit task"
                  type="button"
                  variant="outline"
                >
                  <Pencil className="h-4 w-4" />
                  <span className="sr-only">Edit</span>
                </Button>

                <Button
                  aria-label="View task response"
                  className="h-8 w-8 rounded-full border-indigo-200 p-0 text-indigo-700 hover:bg-indigo-50"
                  onClick={() => void handleTaskResponseView(task)}
                  size="sm"
                  title="Open response"
                  type="button"
                  variant="outline"
                >
                  <FileText className="h-4 w-4" />
                  <span className="sr-only">Response</span>
                </Button>

                {task.status === "in_progress" ? (
                  <Button
                    aria-label="Stop task"
                    className="h-8 w-8 rounded-full border-orange-200 p-0 text-orange-700 hover:bg-orange-50"
                    onClick={() => void handleTaskAction(task.id, "stop")}
                    size="sm"
                    title="Stop task"
                    type="button"
                    variant="outline"
                  >
                    <Square className="h-4 w-4" />
                    <span className="sr-only">Stop</span>
                  </Button>
                ) : (
                  <Button
                    aria-label={task.paused ? "Resume task" : "Pause task"}
                    className={`h-8 w-8 rounded-full p-0 ${
                      task.paused
                        ? "border-amber-300 text-amber-700 hover:bg-amber-50"
                        : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    }`}
                    onClick={() =>
                      void handleTaskAction(task.id, task.paused ? "resume" : "pause")
                    }
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
                  size="sm"
                  title="Remove task"
                  type="button"
                  variant="outline"
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="sr-only">Remove</span>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

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

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTaskTarget(null);
          }
        }}
        open={Boolean(deleteTaskTarget)}
      >
        <DialogContent>
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
              <Input
                onChange={(event) => setEditTaskModel(event.target.value)}
                placeholder="Model"
                value={editTaskModel}
              />
              <Input
                onChange={(event) => setEditTaskReasoning(event.target.value)}
                placeholder="Reasoning"
                value={editTaskReasoning}
              />
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

      <Dialog
        onOpenChange={(open) => !open && setResponseViewer(null)}
        open={Boolean(responseViewer)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Task Response</DialogTitle>
            <DialogDescription>{responseViewer?.taskText ?? ""}</DialogDescription>
          </DialogHeader>
          <Textarea
            className="min-h-[280px] text-xs"
            readOnly
            value={responseViewer?.response.fullText ?? ""}
          />
          <div className="text-xs text-zinc-500">
            created at: {responseViewer?.response.createdAt ?? "-"}
          </div>
          <DialogFooter>
            <Button onClick={() => setResponseViewer(null)} type="button" variant="outline">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateTaskModal
        onCreated={async () => {
          await loadTree();
          toast.success("Task created");
        }}
        onError={(message) => setErrorMessage(message)}
        onOpenChange={setCreateTaskModalOpen}
        open={createTaskModalOpen}
        projectId={projectId}
        scopeTitle={scopeTitle}
        subprojectId={subprojectId ?? null}
      />

      <CreateSubprojectModal
        defaultPath={selectedProject.path}
        onCreated={async () => {
          await loadTree();
          toast.success("Subproject created");
        }}
        onError={(message) => setErrorMessage(message)}
        onOpenChange={setCreateSubprojectModalOpen}
        open={createSubprojectModalOpen}
        projectId={selectedProject.id}
        projectName={selectedProject.name}
      />
    </div>
  );
}
