"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  FileText,
  Folder,
  GripVertical,
  Pause,
  Pencil,
  Play,
  Plus,
  Settings,
  Square,
  Trash2,
} from "lucide-react";

import type {
  ProjectEntity,
  SettingRecord,
  SubprojectEntity,
  TaskEntity,
} from "../../shared/contracts";
import {
  DEFAULT_TASK_MODEL,
  DEFAULT_TASK_REASONING,
  TASK_MODEL_OPTIONS,
  TASK_REASONING_OPTIONS,
} from "@/lib/task-reasoning";
import { clearTaskFormPreferences } from "@/lib/task-form-preferences";
import { canEditTask, extractApiErrorMessage } from "./app-dashboard-helpers";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Checkbox } from "./ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select } from "./ui/select";
import { Textarea } from "./ui/textarea";

type SubprojectWithTasks = SubprojectEntity & { tasks: TaskEntity[] };
type ProjectTree = ProjectEntity & {
  subprojects: SubprojectWithTasks[];
  tasks: TaskEntity[];
};

interface PathDirectory {
  modifiedAt: string;
  name: string;
  path: string;
}

interface DragState {
  scopeKey: string;
  taskId: string;
}

interface TaskResponseEntry {
  createdAt: string;
  fullText: string;
  id: string;
  taskId: string;
}

const DEFAULT_MODEL = DEFAULT_TASK_MODEL;
const DEFAULT_REASONING = DEFAULT_TASK_REASONING;
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

async function requestJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    let payload: {
      details?: string;
      error?: { code?: string; message?: string };
    } | undefined;
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      // no-op
    }
    throw new Error(extractApiErrorMessage(response.status, payload));
  }

  if (response.status === 204) {
    return null as T;
  }
  return (await response.json()) as T;
}

function scopeKey(projectId: string, subprojectId: string | null): string {
  return subprojectId ? `subproject:${projectId}:${subprojectId}` : `project:${projectId}`;
}

function findTaskOrder(tree: ProjectTree[], key: string): string[] {
  for (const project of tree) {
    if (scopeKey(project.id, null) === key) {
      return project.tasks.map((task) => task.id);
    }
    for (const subproject of project.subprojects) {
      if (scopeKey(project.id, subproject.id) === key) {
        return subproject.tasks.map((task) => task.id);
      }
    }
  }
  return [];
}

export function AppDashboard() {
  const [projects, setProjects] = useState<ProjectTree[]>([]);
  const [settings, setSettings] = useState<SettingRecord[]>([]);
  const [settingsDraft, setSettingsDraft] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [responseViewer, setResponseViewer] = useState<{
    finishedAt: string | null;
    response: TaskResponseEntry;
    status: TaskEntity["status"];
    taskText: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState<DragState | null>(null);

  const [projectName, setProjectName] = useState("");
  const [projectPath, setProjectPath] = useState("");
  const [projectMetadata, setProjectMetadata] = useState("");
  const [pathBase, setPathBase] = useState("");
  const [pathSort, setPathSort] = useState<"modified" | "name">("modified");
  const [pathDirectories, setPathDirectories] = useState<PathDirectory[]>([]);

  const [newTaskText, setNewTaskText] = useState<Record<string, string>>({});
  const [newTaskModel, setNewTaskModel] = useState<Record<string, string>>({});
  const [newTaskReasoning, setNewTaskReasoning] = useState<Record<string, string>>({});
  const [newTaskIncludeContext, setNewTaskIncludeContext] = useState<
    Record<string, boolean>
  >({});
  const [newTaskContextCount, setNewTaskContextCount] = useState<
    Record<string, number>
  >({});

  const [newSubprojectName, setNewSubprojectName] = useState<Record<string, string>>({});
  const [newSubprojectPath, setNewSubprojectPath] = useState<Record<string, string>>({});
  const [newSubprojectMetadata, setNewSubprojectMetadata] = useState<
    Record<string, string>
  >({});
  const [editProjectTarget, setEditProjectTarget] = useState<ProjectTree | null>(null);
  const [editProjectName, setEditProjectName] = useState("");
  const [editProjectPath, setEditProjectPath] = useState("");
  const [editProjectMetadata, setEditProjectMetadata] = useState("");
  const [editProjectSubmitting, setEditProjectSubmitting] = useState(false);
  const [editSubprojectTarget, setEditSubprojectTarget] = useState<SubprojectEntity | null>(null);
  const [editSubprojectName, setEditSubprojectName] = useState("");
  const [editSubprojectPath, setEditSubprojectPath] = useState("");
  const [editSubprojectMetadata, setEditSubprojectMetadata] = useState("");
  const [editSubprojectSubmitting, setEditSubprojectSubmitting] = useState(false);
  const [editTaskTarget, setEditTaskTarget] = useState<TaskEntity | null>(null);
  const [editTaskText, setEditTaskText] = useState("");
  const [editTaskModel, setEditTaskModel] = useState("");
  const [editTaskReasoning, setEditTaskReasoning] = useState("");
  const [editTaskSubmitting, setEditTaskSubmitting] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [tree, settingsRows] = await Promise.all([
        requestJson<ProjectTree[]>("/api/projects/tree"),
        requestJson<SettingRecord[]>("/api/settings"),
      ]);
      setProjects(tree);
      setSettings(settingsRows);
      setSettingsDraft(
        Object.fromEntries(
          settingsRows.map((row) => [row.key, row.dbValue ?? row.effectiveValue]),
        ),
      );
      const defaultBase = settingsRows.find(
        (row) => row.key === "default_project_base_path",
      )?.effectiveValue;
      if (defaultBase) {
        setPathBase(defaultBase);
      }
      const sortMode = settingsRows.find(
        (row) => row.key === "project_path_sort_mode",
      )?.effectiveValue;
      if (sortMode === "modified" || sortMode === "name") {
        setPathSort(sortMode);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const reloadTree = useCallback(async () => {
    try {
      const tree = await requestJson<ProjectTree[]>("/api/projects/tree");
      setProjects(tree);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to refresh tree");
    }
  }, []);

  const showSuccess = useCallback((message: string) => {
    setSuccessMessage(message);
    window.setTimeout(() => {
      setSuccessMessage((current) => (current === message ? null : current));
    }, 2500);
  }, []);

  const handleCreateProject = async () => {
    try {
      await requestJson("/api/projects", {
        body: JSON.stringify({
          metadata: projectMetadata || undefined,
          name: projectName,
          path: projectPath,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      setProjectName("");
      setProjectPath("");
      setProjectMetadata("");
      await loadAll();
      showSuccess("Project created");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create project");
    }
  };

  const handleLoadDirectories = async () => {
    try {
      const result = await requestJson<{
        basePath: string;
        directories: PathDirectory[];
        sort: "modified" | "name";
      }>("/api/paths/list", {
        body: JSON.stringify({ basePath: pathBase, sort: pathSort }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      setPathBase(result.basePath);
      setPathDirectories(result.directories);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to list directories");
    }
  };

  const handleProjectPauseToggle = async (project: ProjectTree) => {
    try {
      await requestJson(`/api/projects/${project.id}`, {
        body: JSON.stringify({ paused: !project.paused }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      await reloadTree();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update project");
    }
  };

  const handleProjectEdit = (project: ProjectTree) => {
    setEditProjectTarget(project);
    setEditProjectName(project.name);
    setEditProjectPath(project.path);
    setEditProjectMetadata(project.metadata ?? "");
  };

  const submitProjectEdit = async () => {
    if (!editProjectTarget) {
      return;
    }

    setEditProjectSubmitting(true);
    try {
      await requestJson(`/api/projects/${editProjectTarget.id}`, {
        body: JSON.stringify({
          metadata: editProjectMetadata || undefined,
          name: editProjectName,
          path: editProjectPath,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      await reloadTree();
      setEditProjectTarget(null);
      showSuccess("Project updated");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to edit project");
    } finally {
      setEditProjectSubmitting(false);
    }
  };

  const handleProjectDelete = async (projectId: string) => {
    try {
      await requestJson(`/api/projects/${projectId}`, { method: "DELETE" });
      clearTaskFormPreferences(projectId);
      await loadAll();
      showSuccess("Project removed");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete project");
    }
  };

  const handleProjectMove = async (projectId: string, direction: "up" | "down") => {
    try {
      await requestJson("/api/projects/reorder", {
        body: JSON.stringify({ direction, projectId }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await reloadTree();
      showSuccess("Project priority updated");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to move project");
    }
  };

  const handleCreateSubproject = async (project: ProjectTree) => {
    try {
      await requestJson("/api/subprojects", {
        body: JSON.stringify({
          metadata: newSubprojectMetadata[project.id] || undefined,
          name: newSubprojectName[project.id],
          path: newSubprojectPath[project.id] || project.path,
          projectId: project.id,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      setNewSubprojectName((state) => ({ ...state, [project.id]: "" }));
      setNewSubprojectPath((state) => ({ ...state, [project.id]: project.path }));
      setNewSubprojectMetadata((state) => ({ ...state, [project.id]: "" }));
      await reloadTree();
      showSuccess("Subproject created");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to create subproject",
      );
    }
  };

  const handleSubprojectMove = async (
    subprojectId: string,
    direction: "down" | "up",
  ) => {
    try {
      await requestJson("/api/subprojects/reorder", {
        body: JSON.stringify({ direction, subprojectId }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await reloadTree();
      showSuccess("Subproject priority updated");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to move subproject",
      );
    }
  };

  const handleSubprojectEdit = (subproject: SubprojectEntity) => {
    setEditSubprojectTarget(subproject);
    setEditSubprojectName(subproject.name);
    setEditSubprojectPath(subproject.path);
    setEditSubprojectMetadata(subproject.metadata ?? "");
  };

  const submitSubprojectEdit = async () => {
    if (!editSubprojectTarget) {
      return;
    }

    setEditSubprojectSubmitting(true);
    try {
      await requestJson(`/api/subprojects/${editSubprojectTarget.id}`, {
        body: JSON.stringify({
          metadata: editSubprojectMetadata || undefined,
          name: editSubprojectName,
          path: editSubprojectPath,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      await reloadTree();
      setEditSubprojectTarget(null);
      showSuccess("Subproject updated");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to update subproject",
      );
    } finally {
      setEditSubprojectSubmitting(false);
    }
  };

  const handleSubprojectPauseToggle = async (subproject: SubprojectEntity) => {
    try {
      await requestJson(`/api/subprojects/${subproject.id}`, {
        body: JSON.stringify({ paused: !subproject.paused }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      await reloadTree();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to update subproject",
      );
    }
  };

  const handleSubprojectDelete = async (subprojectId: string) => {
    try {
      await requestJson(`/api/subprojects/${subprojectId}`, { method: "DELETE" });
      await reloadTree();
      showSuccess("Subproject removed");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to delete subproject",
      );
    }
  };

  const createTaskForScope = async (projectId: string, subprojectId: string | null) => {
    const key = scopeKey(projectId, subprojectId);
    try {
      await requestJson("/api/tasks", {
        body: JSON.stringify({
          includePreviousContext: newTaskIncludeContext[key] ?? false,
          model: newTaskModel[key] ?? DEFAULT_MODEL,
          previousContextMessages: newTaskContextCount[key] ?? 0,
          projectId,
          reasoning: newTaskReasoning[key] ?? DEFAULT_REASONING,
          subprojectId,
          text: newTaskText[key] ?? "",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      setNewTaskText((state) => ({ ...state, [key]: "" }));
      await reloadTree();
      showSuccess("Task created");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create task");
    }
  };

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
      await reloadTree();
      if (action !== "pause" && action !== "resume") {
        showSuccess(`Task action applied: ${action}`);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update task action");
    }
  };

  const handleTaskEdit = (task: TaskEntity) => {
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
      await reloadTree();
      setEditTaskTarget(null);
      showSuccess("Task updated");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to edit task");
    } finally {
      setEditTaskSubmitting(false);
    }
  };

  const handleTaskDrop = async (targetTaskId: string, targetScope: string) => {
    if (!dragging || dragging.scopeKey !== targetScope || dragging.taskId === targetTaskId) {
      return;
    }

    const currentOrder = findTaskOrder(projects, targetScope);
    if (currentOrder.length < 2) {
      return;
    }
    const fromIndex = currentOrder.findIndex((id) => id === dragging.taskId);
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
      await reloadTree();
      showSuccess("Task priority updated");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to reorder tasks");
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
      setErrorMessage(error instanceof Error ? error.message : "Failed to fetch task response");
    }
  };

  const saveSetting = async (key: string) => {
    try {
      await requestJson("/api/settings", {
        body: JSON.stringify({ key, value: settingsDraft[key] }),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      });
      await loadAll();
      showSuccess(`Setting saved: ${key}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save setting");
    }
  };

  const settingsByKey = useMemo(
    () => Object.fromEntries(settings.map((item) => [item.key, item])),
    [settings],
  );

  if (loading) {
    return <div className="p-10 text-sm text-zinc-500">Loading dashboard...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-zinc-100 p-4 md:p-8">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 lg:grid-cols-[1.7fr_1fr]">
        <div className="space-y-6">
          {successMessage ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {successMessage}
            </div>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Folder className="h-4 w-4" />
                Projects
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <Input
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder="Project name"
                  value={projectName}
                />
                <Input
                  onChange={(event) => setProjectPath(event.target.value)}
                  placeholder="Project path"
                  value={projectPath}
                />
                <Textarea
                  className="md:col-span-2"
                  onChange={(event) => setProjectMetadata(event.target.value)}
                  placeholder="Project metadata JSON (optional)"
                  value={projectMetadata}
                />
                <div className="flex gap-2 md:col-span-2">
                  <Button onClick={handleCreateProject} size="sm">
                    <Plus className="h-4 w-4" />
                    Create Project
                  </Button>
                </div>
              </div>

              <div className="rounded-md border border-black/10 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Input
                    onChange={(event) => setPathBase(event.target.value)}
                    placeholder="Base path for directory selection"
                    value={pathBase}
                  />
                  <Select
                    onChange={(event) =>
                      setPathSort(event.target.value as "modified" | "name")
                    }
                    value={pathSort}
                  >
                    <option value="modified">Sort by modified</option>
                    <option value="name">Sort by name</option>
                  </Select>
                  <Button onClick={handleLoadDirectories} size="sm" variant="outline">
                    Load dirs
                  </Button>
                </div>
                <div className="max-h-28 overflow-auto rounded bg-white p-2 text-xs">
                  {pathDirectories.map((directory) => (
                    <button
                      className="block w-full rounded px-2 py-1 text-left hover:bg-zinc-100"
                      key={directory.path}
                      onClick={() => setProjectPath(directory.path)}
                      type="button"
                    >
                      {directory.name}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {projects.map((project) => (
            <Card key={project.id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  <span>{project.name}</span>
                  <Badge>{project.paused ? "paused" : "active"}</Badge>
                  <Badge>priority {project.priority}</Badge>
                  <Button
                    onClick={() => handleProjectMove(project.id, "up")}
                    size="icon"
                    variant="ghost"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={() => handleProjectMove(project.id, "down")}
                    size="icon"
                    variant="ghost"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={() => handleProjectEdit(project)}
                    size="icon"
                    variant="ghost"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={() => handleProjectPauseToggle(project)}
                    size="icon"
                    variant="ghost"
                  >
                    {project.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  </Button>
                  <Button
                    onClick={() => handleProjectDelete(project.id)}
                    size="icon"
                    variant="ghost"
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </CardTitle>
                <div className="text-xs text-zinc-600">{project.path}</div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-md border border-black/10 p-3">
                  <Label>Add subproject</Label>
                  <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                    <Input
                      onChange={(event) =>
                        setNewSubprojectName((state) => ({
                          ...state,
                          [project.id]: event.target.value,
                        }))
                      }
                      placeholder="Subproject name"
                      value={newSubprojectName[project.id] ?? ""}
                    />
                    <Input
                      onChange={(event) =>
                        setNewSubprojectPath((state) => ({
                          ...state,
                          [project.id]: event.target.value,
                        }))
                      }
                      placeholder="Subproject path"
                      value={newSubprojectPath[project.id] ?? project.path}
                    />
                    <Button onClick={() => handleCreateSubproject(project)} size="sm">
                      <Plus className="h-4 w-4" />
                      Add Subproject
                    </Button>
                  </div>
                </div>

                <TaskComposer
                  includeContext={newTaskIncludeContext[scopeKey(project.id, null)] ?? false}
                  model={newTaskModel[scopeKey(project.id, null)] ?? DEFAULT_MODEL}
                  onAdd={() => createTaskForScope(project.id, null)}
                  onContextCountChange={(value) =>
                    setNewTaskContextCount((state) => ({
                      ...state,
                      [scopeKey(project.id, null)]: value,
                    }))
                  }
                  onIncludeContextChange={(value) =>
                    setNewTaskIncludeContext((state) => ({
                      ...state,
                      [scopeKey(project.id, null)]: value,
                    }))
                  }
                  onModelChange={(value) =>
                    setNewTaskModel((state) => ({
                      ...state,
                      [scopeKey(project.id, null)]: value,
                    }))
                  }
                  onReasoningChange={(value) =>
                    setNewTaskReasoning((state) => ({
                      ...state,
                      [scopeKey(project.id, null)]: value,
                    }))
                  }
                  onTextChange={(value) =>
                    setNewTaskText((state) => ({
                      ...state,
                      [scopeKey(project.id, null)]: value,
                    }))
                  }
                  previousCount={newTaskContextCount[scopeKey(project.id, null)] ?? 0}
                  reasoning={newTaskReasoning[scopeKey(project.id, null)] ?? DEFAULT_REASONING}
                  text={newTaskText[scopeKey(project.id, null)] ?? ""}
                  title="Project tasks"
                />

                <TaskList
                  onDrop={handleTaskDrop}
                  onDragStart={setDragging}
                  onTaskAction={handleTaskAction}
                  onTaskEdit={handleTaskEdit}
                  onTaskViewResponse={handleTaskResponseView}
                  scope={scopeKey(project.id, null)}
                  tasks={project.tasks}
                />

                {project.subprojects.map((subproject) => (
                  <div className="rounded-md border border-black/10 p-3" key={subproject.id}>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <strong>{subproject.name}</strong>
                      <Badge>{subproject.paused ? "paused" : "active"}</Badge>
                      <Badge>priority {subproject.priority}</Badge>
                      <Button
                        onClick={() => handleSubprojectMove(subproject.id, "up")}
                        size="icon"
                        variant="ghost"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={() => handleSubprojectMove(subproject.id, "down")}
                        size="icon"
                        variant="ghost"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={() => handleSubprojectEdit(subproject)}
                        size="icon"
                        variant="ghost"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={() => handleSubprojectPauseToggle(subproject)}
                        size="icon"
                        variant="ghost"
                      >
                        {subproject.paused ? (
                          <Play className="h-4 w-4" />
                        ) : (
                          <Pause className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        onClick={() => handleSubprojectDelete(subproject.id)}
                        size="icon"
                        variant="ghost"
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                    <div className="mb-2 text-xs text-zinc-600">{subproject.path}</div>
                    <TaskComposer
                      includeContext={
                        newTaskIncludeContext[scopeKey(project.id, subproject.id)] ?? false
                      }
                      model={newTaskModel[scopeKey(project.id, subproject.id)] ?? DEFAULT_MODEL}
                      onAdd={() => createTaskForScope(project.id, subproject.id)}
                      onContextCountChange={(value) =>
                        setNewTaskContextCount((state) => ({
                          ...state,
                          [scopeKey(project.id, subproject.id)]: value,
                        }))
                      }
                      onIncludeContextChange={(value) =>
                        setNewTaskIncludeContext((state) => ({
                          ...state,
                          [scopeKey(project.id, subproject.id)]: value,
                        }))
                      }
                      onModelChange={(value) =>
                        setNewTaskModel((state) => ({
                          ...state,
                          [scopeKey(project.id, subproject.id)]: value,
                        }))
                      }
                      onReasoningChange={(value) =>
                        setNewTaskReasoning((state) => ({
                          ...state,
                          [scopeKey(project.id, subproject.id)]: value,
                        }))
                      }
                      onTextChange={(value) =>
                        setNewTaskText((state) => ({
                          ...state,
                          [scopeKey(project.id, subproject.id)]: value,
                        }))
                      }
                      previousCount={newTaskContextCount[scopeKey(project.id, subproject.id)] ?? 0}
                      reasoning={
                        newTaskReasoning[scopeKey(project.id, subproject.id)] ??
                        DEFAULT_REASONING
                      }
                      text={newTaskText[scopeKey(project.id, subproject.id)] ?? ""}
                      title="Subproject tasks"
                    />
                    <TaskList
                      onDrop={handleTaskDrop}
                      onDragStart={setDragging}
                      onTaskAction={handleTaskAction}
                      onTaskEdit={handleTaskEdit}
                      onTaskViewResponse={handleTaskResponseView}
                      scope={scopeKey(project.id, subproject.id)}
                      tasks={subproject.tasks}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {settings.map((setting) => (
              <div className="rounded-md border border-black/10 p-3" key={setting.key}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <code className="text-xs">{setting.key}</code>
                  <Badge>source: {setting.source}</Badge>
                </div>
                <Input
                  onChange={(event) =>
                    setSettingsDraft((state) => ({
                      ...state,
                      [setting.key]: event.target.value,
                    }))
                  }
                  value={settingsDraft[setting.key] ?? ""}
                />
                <div className="mt-2 text-[11px] text-zinc-600">
                  default: {setting.defaultValue ?? "-"} | env: {setting.envValue ?? "-"} | db:{" "}
                  {setting.dbValue ?? "-"}
                </div>
                <div className="mt-2 flex justify-end">
                  <Button onClick={() => saveSetting(setting.key)} size="sm" variant="outline">
                    Save
                  </Button>
                </div>
              </div>
            ))}

            <div className="rounded-md border border-black/10 bg-zinc-50 p-3 text-xs text-zinc-700">
              Effective defaults:
              <div>sort mode: {settingsByKey.project_path_sort_mode?.effectiveValue ?? "-"}</div>
              <div>
                base path: {settingsByKey.default_project_base_path?.effectiveValue ?? "-"}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setEditProjectTarget(null);
          }
        }}
        open={Boolean(editProjectTarget)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
            <DialogDescription>Update project details in one form.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              onChange={(event) => setEditProjectName(event.target.value)}
              placeholder="Project name"
              value={editProjectName}
            />
            <Input
              onChange={(event) => setEditProjectPath(event.target.value)}
              placeholder="Project path"
              value={editProjectPath}
            />
            <Textarea
              onChange={(event) => setEditProjectMetadata(event.target.value)}
              placeholder="Project metadata JSON (optional)"
              value={editProjectMetadata}
            />
          </div>
          <DialogFooter>
            <Button onClick={() => setEditProjectTarget(null)} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              disabled={editProjectSubmitting || editProjectName.trim().length < 1 || editProjectPath.trim().length < 1}
              onClick={() => void submitProjectEdit()}
              type="button"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setEditSubprojectTarget(null);
          }
        }}
        open={Boolean(editSubprojectTarget)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Subproject</DialogTitle>
            <DialogDescription>Update subproject details in one form.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              onChange={(event) => setEditSubprojectName(event.target.value)}
              placeholder="Subproject name"
              value={editSubprojectName}
            />
            <Input
              onChange={(event) => setEditSubprojectPath(event.target.value)}
              placeholder="Subproject path"
              value={editSubprojectPath}
            />
            <Textarea
              onChange={(event) => setEditSubprojectMetadata(event.target.value)}
              placeholder="Subproject metadata JSON (optional)"
              value={editSubprojectMetadata}
            />
          </div>
          <DialogFooter>
            <Button onClick={() => setEditSubprojectTarget(null)} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              disabled={
                editSubprojectSubmitting ||
                editSubprojectName.trim().length < 1 ||
                editSubprojectPath.trim().length < 1
              }
              onClick={() => void submitSubprojectEdit()}
              type="button"
            >
              Save
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
              <Select onChange={(event) => setEditTaskModel(event.target.value)} value={editTaskModel}>
                {!TASK_MODEL_OPTIONS.some((option) => option.value === editTaskModel) &&
                editTaskModel.trim().length > 0 ? (
                  <option value={editTaskModel}>{editTaskModel}</option>
                ) : null}
                {TASK_MODEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <Select onChange={(event) => setEditTaskReasoning(event.target.value)} value={editTaskReasoning}>
                {!TASK_REASONING_OPTIONS.some((option) => option.value === editTaskReasoning) &&
                editTaskReasoning.trim().length > 0 ? (
                  <option value={editTaskReasoning}>{editTaskReasoning}</option>
                ) : null}
                {TASK_REASONING_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
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

      <Dialog onOpenChange={(open) => !open && setErrorMessage(null)} open={Boolean(errorMessage)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Error</DialogTitle>
            <DialogDescription>
              {errorMessage ?? "An unexpected error occurred."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setErrorMessage(null)} variant="outline">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => !open && setResponseViewer(null)}
        open={Boolean(responseViewer)}
      >
        <DialogContent className="sm:max-w-[64rem]">
          <DialogHeader>
            <DialogTitle className="inline-flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Task Response
            </DialogTitle>
            <DialogDescription>{responseViewer?.taskText ?? ""}</DialogDescription>
          </DialogHeader>
          <Textarea
            className="min-h-[280px] text-xs"
            readOnly
            value={responseViewer?.response.fullText ?? ""}
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-md border border-black/10 bg-zinc-50 px-3 py-2">
              <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Response Created
              </div>
              <div className="text-xs text-zinc-700">
                {formatTaskResponseDate(responseViewer?.response.createdAt)}
              </div>
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
            <Button onClick={() => setResponseViewer(null)} variant="outline">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TaskComposer(props: {
  includeContext: boolean;
  model: string;
  onAdd: () => void;
  onContextCountChange: (value: number) => void;
  onIncludeContextChange: (value: boolean) => void;
  onModelChange: (value: string) => void;
  onReasoningChange: (value: string) => void;
  onTextChange: (value: string) => void;
  previousCount: number;
  reasoning: string;
  text: string;
  title: string;
}) {
  return (
    <div className="space-y-2 rounded-md border border-black/10 p-3">
      <Label>{props.title}</Label>
      <Textarea
        onChange={(event) => props.onTextChange(event.target.value)}
        placeholder="Describe task"
        value={props.text}
      />
      <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
        <Select onChange={(event) => props.onModelChange(event.target.value)} value={props.model}>
          {!TASK_MODEL_OPTIONS.some((option) => option.value === props.model) &&
          props.model.trim().length > 0 ? (
            <option value={props.model}>{props.model}</option>
          ) : null}
          {TASK_MODEL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <Select onChange={(event) => props.onReasoningChange(event.target.value)} value={props.reasoning}>
          {TASK_REASONING_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <div className="flex items-center gap-2 rounded border border-black/10 px-2">
          <Checkbox
            checked={props.includeContext}
            onCheckedChange={(checked) => props.onIncludeContextChange(Boolean(checked))}
          />
          <span className="text-xs">Include context</span>
        </div>
        <Input
          disabled={!props.includeContext}
          min={0}
          onChange={(event) =>
            props.onContextCountChange(Number.parseInt(event.target.value || "0", 10))
          }
          type="number"
          value={props.previousCount}
        />
      </div>
      <Button onClick={props.onAdd} size="sm">
        <Plus className="h-4 w-4" />
        Add task
      </Button>
    </div>
  );
}

function TaskList(props: {
  onDragStart: (drag: DragState) => void;
  onDrop: (targetTaskId: string, targetScope: string) => void;
  onTaskAction: (taskId: string, action: "pause" | "remove" | "resume" | "stop") => void;
  onTaskEdit: (task: TaskEntity) => void;
  onTaskViewResponse: (task: TaskEntity) => void;
  scope: string;
  tasks: TaskEntity[];
}) {
  return (
    <div className="space-y-2">
      {props.tasks.map((task) => (
        <div
          className="flex flex-wrap items-center gap-2 rounded border border-black/10 bg-white p-2"
          draggable
          key={task.id}
          onDragOver={(event) => event.preventDefault()}
          onDragStart={() => props.onDragStart({ scopeKey: props.scope, taskId: task.id })}
          onDrop={() => props.onDrop(task.id, props.scope)}
        >
          <GripVertical className="h-4 w-4 text-zinc-400" />
          <div className="min-w-[180px] flex-1 text-sm">{task.text}</div>
          <Badge>{task.status}</Badge>
          <Badge>{task.model}</Badge>
          {!canEditTask(task) ? <Badge>locked</Badge> : null}
          <Button
            disabled={!canEditTask(task)}
            onClick={() => props.onTaskEdit(task)}
            size="sm"
            variant="outline"
          >
            Edit
          </Button>
          <Button onClick={() => props.onTaskViewResponse(task)} size="sm" variant="outline">
            <FileText className="h-4 w-4" />
            Response
          </Button>
          {task.status === "in_progress" ? (
            <Button
              onClick={() => props.onTaskAction(task.id, "stop")}
              size="icon"
              variant="ghost"
            >
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={() =>
                props.onTaskAction(task.id, task.paused ? "resume" : "pause")
              }
              size="icon"
              variant="ghost"
            >
              {task.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </Button>
          )}
          <Button
            onClick={() => props.onTaskAction(task.id, "remove")}
            size="icon"
            variant="ghost"
          >
            <Trash2 className="h-4 w-4 text-red-600" />
          </Button>
        </div>
      ))}
    </div>
  );
}
