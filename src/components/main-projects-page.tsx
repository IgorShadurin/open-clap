"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  EyeOff,
  FolderGit2,
  FolderPlus,
  GripVertical,
  Hand,
  ListTodo,
  Pause,
  Play,
  Plus,
  Save,
  Send,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { ProjectEntity, SubprojectEntity, TaskEntity } from "../../shared/contracts";
import { buildTaskScopeHref, canEditTask, requestJson } from "./app-dashboard-helpers";
import { CreateProjectModal } from "./create-project-modal";
import { CreateSubprojectModal } from "./create-subproject-modal";
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
import { Textarea } from "./ui/textarea";

type SubprojectWithTasks = SubprojectEntity & { tasks: TaskEntity[] };
type ProjectTree = ProjectEntity & {
  subprojects: SubprojectWithTasks[];
  tasks: TaskEntity[];
};

const DUMMY_CODEX_CONNECTED = true;
const DUMMY_WEEKLY_LIMIT_USED_PERCENT = 64;
const DUMMY_FIVE_HOUR_LIMIT_USED_PERCENT = 38;
const DEFAULT_TASK_MODEL = "gpt-5.3-codex";
const DEFAULT_TASK_REASONING = "high";

function progressWidth(percent: number): string {
  const normalized = Math.max(0, Math.min(100, Math.floor(percent)));
  return `${normalized}%`;
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

function isProjectTasksVisibleOnMainPage(project: ProjectTree): boolean {
  return project.mainPageTasksVisible;
}

function isProjectSubprojectsVisibleOnMainPage(project: ProjectTree): boolean {
  return project.mainPageSubprojectsVisible;
}

interface InlineTaskDraft {
  contextCount: number;
  includeContext: boolean;
  model: string;
  reasoning: string;
  settingsExpanded: boolean;
  text: string;
}

function createDefaultInlineTaskDraft(): InlineTaskDraft {
  return {
    contextCount: 0,
    includeContext: false,
    model: DEFAULT_TASK_MODEL,
    reasoning: DEFAULT_TASK_REASONING,
    settingsExpanded: false,
    text: "",
  };
}

export function MainProjectsPage() {
  const [projects, setProjects] = useState<ProjectTree[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null);
  const [draggingSubproject, setDraggingSubproject] = useState<{
    projectId: string;
    subprojectId: string;
  } | null>(null);
  const [draggingProjectTask, setDraggingProjectTask] = useState<{
    projectId: string;
    taskId: string;
  } | null>(null);
  const [createSubprojectTarget, setCreateSubprojectTarget] = useState<{
    id: string;
    name: string;
    path: string;
  } | null>(null);
  const [deleteSubprojectTarget, setDeleteSubprojectTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [inlineTaskDrafts, setInlineTaskDrafts] = useState<Record<string, InlineTaskDraft>>({});
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
  const inlineTaskFormRefs = useRef<Record<string, HTMLFormElement | null>>({});

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

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const tree = await requestJson<ProjectTree[]>("/api/projects/tree");
      setProjects(tree);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load projects");
    } finally {
      setLoading(false);
      setHasLoadedOnce(true);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      setInlineTaskDrafts((current) => {
        let changed = false;
        const next: Record<string, InlineTaskDraft> = {};

        for (const [projectId, draft] of Object.entries(current)) {
          if (!draft.settingsExpanded) {
            next[projectId] = draft;
            continue;
          }

          const formElement = inlineTaskFormRefs.current[projectId];
          if (formElement && formElement.contains(target)) {
            next[projectId] = draft;
            continue;
          }

          changed = true;
          next[projectId] = {
            ...draft,
            settingsExpanded: false,
          };
        }

        return changed ? next : current;
      });
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  const handleProjectDrop = async (targetProjectId: string) => {
    if (!draggingProjectId || draggingProjectId === targetProjectId) {
      return;
    }

    const currentOrder = projects.map((project) => project.id);
    const fromIndex = currentOrder.findIndex((id) => id === draggingProjectId);
    const toIndex = currentOrder.findIndex((id) => id === targetProjectId);
    if (fromIndex < 0 || toIndex < 0) {
      return;
    }

    const reordered = currentOrder.slice();
    const [removed] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, removed);

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
      toast.success(project.paused ? "Project resumed" : "Project paused");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update project status");
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
      toast.success(subproject.paused ? "Subproject resumed" : "Subproject paused");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update subproject status");
    }
  };

  const handleProjectTaskPauseToggle = async (task: TaskEntity) => {
    try {
      await requestJson(`/api/tasks/${task.id}/action`, {
        body: JSON.stringify({ action: task.paused ? "resume" : "pause" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await loadProjects();
      toast.success(task.paused ? "Task resumed" : "Task paused");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update task status");
    }
  };

  const handleProjectTaskRemove = async (task: TaskEntity) => {
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

  const getInlineTaskDraft = (projectId: string): InlineTaskDraft =>
    inlineTaskDrafts[projectId] ?? createDefaultInlineTaskDraft();

  const updateInlineTaskDraft = (
    projectId: string,
    patch: Partial<InlineTaskDraft>,
  ) => {
    setInlineTaskDrafts((current) => ({
      ...current,
      [projectId]: {
        ...(current[projectId] ?? createDefaultInlineTaskDraft()),
        ...patch,
      },
    }));
  };

  const handleInlineTaskSubmit = async (project: ProjectTree) => {
    const draft = getInlineTaskDraft(project.id);
    const text = draft.text.trim();
    if (text.length < 1) {
      return;
    }

    try {
      await requestJson("/api/tasks", {
        body: JSON.stringify({
          includePreviousContext: draft.includeContext,
          model: draft.model.trim() || DEFAULT_TASK_MODEL,
          previousContextMessages: draft.includeContext ? draft.contextCount : 0,
          projectId: project.id,
          reasoning: draft.reasoning.trim() || DEFAULT_TASK_REASONING,
          subprojectId: null,
          text,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await loadProjects();
      setInlineTaskDrafts((current) => ({
        ...current,
        [project.id]: createDefaultInlineTaskDraft(),
      }));
      toast.success("Task created");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create task");
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
    const fromIndex = currentOrder.findIndex((id) => id === draggingSubproject.subprojectId);
    const toIndex = currentOrder.findIndex((id) => id === targetSubprojectId);
    if (fromIndex < 0 || toIndex < 0) {
      return;
    }

    const reordered = currentOrder.slice();
    const [removed] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, removed);

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

    const currentOrder = project.tasks.map((task) => task.id);
    const fromIndex = currentOrder.findIndex((id) => id === draggingProjectTask.taskId);
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
      await loadProjects();
      toast.success("Task priority updated");
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-zinc-100 p-4 md:p-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-4">
            <Link
              className="inline-flex items-center gap-2 text-xl font-semibold transition-opacity hover:opacity-80"
              href="/"
            >
              <Hand className="h-5 w-5" />
              OpenClap
            </Link>
            <div className="w-[320px] space-y-3 rounded-md border border-black/10 bg-white/70 p-4">
              <div className="flex items-center justify-between text-sm font-medium">
                <div className="flex items-center gap-2">
                  <span
                    aria-label={DUMMY_CODEX_CONNECTED ? "Connected" : "Disconnected"}
                    className={`h-2.5 w-2.5 rounded-full ${
                      DUMMY_CODEX_CONNECTED ? "bg-emerald-500" : "bg-red-500"
                    }`}
                  />
                  <span>Codex connection</span>
                </div>
                <span className="text-sm text-zinc-700">
                  {DUMMY_CODEX_CONNECTED ? "Connected" : "Disconnected"}
                </span>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm font-medium text-zinc-700">
                  <span>Weekly limit</span>
                  <span>{DUMMY_WEEKLY_LIMIT_USED_PERCENT}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded bg-zinc-200">
                  <div
                    className="h-full bg-zinc-700"
                    style={{ width: progressWidth(DUMMY_WEEKLY_LIMIT_USED_PERCENT) }}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm font-medium text-zinc-700">
                  <span>5h limit</span>
                  <span>{DUMMY_FIVE_HOUR_LIMIT_USED_PERCENT}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded bg-zinc-200">
                  <div
                    className="h-full bg-zinc-700"
                    style={{ width: progressWidth(DUMMY_FIVE_HOUR_LIMIT_USED_PERCENT) }}
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setCreateModalOpen(true)} type="button" variant="outline">
              <Plus className="h-4 w-4" />
              Create Project
            </Button>
            <Button asChild type="button" variant="outline">
              <Link href="/settings">
                <Settings className="h-4 w-4" />
                <span className="sr-only">Settings</span>
              </Link>
            </Button>
          </div>
        </div>

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
              No projects yet. Use <strong>Create Project</strong> to start.
            </CardContent>
          </Card>
        ) : null}

        {projects.map((project) => {
          const projectTasksVisible = isProjectTasksVisibleOnMainPage(project);
          const projectSubprojectsVisible = isProjectSubprojectsVisibleOnMainPage(project);
          return (
            <div
              className="cursor-grab active:cursor-grabbing"
              draggable
              key={project.id}
              onDragEnd={() => setDraggingProjectId(null)}
              onDragOver={(event) => event.preventDefault()}
              onDragStart={() => setDraggingProjectId(project.id)}
              onDrop={() => void handleProjectDrop(project.id)}
            >
              <Card>
              <CardHeader>
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
                    <Link
                      className="font-medium underline-offset-4 hover:underline"
                      href={buildTaskScopeHref(project.id)}
                    >
                      {project.name}
                    </Link>
                  </div>
                </CardTitle>
                <div className="text-xs text-zinc-600">{project.path}</div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
                        <Button
                          aria-label={`Create subproject in ${project.name}`}
                          className="h-8 w-8 rounded-full p-0"
                          draggable={false}
                          onDragStart={preventControlDragStart}
                          onMouseDown={stopDragPropagation}
                          onPointerDown={stopDragPropagation}
                          onClick={() =>
                            setCreateSubprojectTarget({
                              id: project.id,
                              name: project.name,
                              path: project.path,
                            })
                          }
                          size="sm"
                          title={`Create subproject in ${project.name}`}
                          type="button"
                          variant="outline"
                        >
                          <FolderPlus className="h-4 w-4" />
                          <span className="sr-only">Create subproject</span>
                        </Button>
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
                      project.subprojects.length < 1 ? (
                        <div className="rounded-md border border-dashed border-black/15 px-3 py-2 text-sm text-zinc-500">
                          No subprojects
                        </div>
                      ) : (
                        project.subprojects.map((subproject) => (
                          <div
                            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-black/10 bg-white px-3 py-2"
                            draggable
                            key={subproject.id}
                            onDragEnd={() => setDraggingSubproject(null)}
                            onDragOver={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                            }}
                            onDragStart={(event) => {
                              event.stopPropagation();
                              setDraggingSubproject({ projectId: project.id, subprojectId: subproject.id });
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              void handleSubprojectDrop(project.id, subproject.id);
                            }}
                          >
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
                              <Link
                                className="font-medium underline-offset-4 hover:underline"
                                href={buildTaskScopeHref(project.id, subproject.id)}
                              >
                                {subproject.name}
                              </Link>
                            </div>
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
                        ))
                      )
                    ) : (
                      <div className="flex items-center gap-2 rounded-md border border-dashed border-amber-300 bg-amber-50/70 px-3 py-2 text-sm text-amber-800">
                        <EyeOff className="h-4 w-4" />
                        <span>Subproject list is hidden. Click the arrow button to show subprojects.</span>
                      </div>
                    )}
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
                        <form
                          className="relative rounded-md border border-black/10 bg-white px-3 py-2"
                          ref={(element) => {
                            inlineTaskFormRefs.current[project.id] = element;
                          }}
                          onMouseDown={stopDragPropagation}
                          onPointerDown={stopDragPropagation}
                          onSubmit={(event) => {
                            event.preventDefault();
                            void handleInlineTaskSubmit(project);
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <Input
                              className="h-9 text-sm"
                              onChange={(event) =>
                                updateInlineTaskDraft(project.id, { text: event.target.value })
                              }
                              onFocus={() =>
                                updateInlineTaskDraft(project.id, { settingsExpanded: true })
                              }
                              placeholder="Add task"
                              value={getInlineTaskDraft(project.id).text}
                            />
                            <Button
                              aria-label={`Add task to ${project.name}`}
                              className="h-9 w-9 shrink-0 p-0"
                              draggable={false}
                              onDragStart={preventControlDragStart}
                              onMouseDown={stopDragPropagation}
                              onPointerDown={stopDragPropagation}
                              title={`Add task to ${project.name}`}
                              type="submit"
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          </div>
                          {getInlineTaskDraft(project.id).settingsExpanded ? (
                            <div className="absolute left-0 right-0 top-full z-20 mt-2 grid grid-cols-1 gap-2 rounded-md border border-black/15 bg-white p-2 shadow-lg md:grid-cols-4">
                              <Input
                                className="h-9 text-sm"
                                onChange={(event) =>
                                  updateInlineTaskDraft(project.id, { model: event.target.value })
                                }
                                onFocus={() =>
                                  updateInlineTaskDraft(project.id, { settingsExpanded: true })
                                }
                                placeholder="Model"
                                value={getInlineTaskDraft(project.id).model}
                              />
                              <Input
                                className="h-9 text-sm"
                                onChange={(event) =>
                                  updateInlineTaskDraft(project.id, {
                                    reasoning: event.target.value,
                                  })
                                }
                                onFocus={() =>
                                  updateInlineTaskDraft(project.id, { settingsExpanded: true })
                                }
                                placeholder="Reasoning"
                                value={getInlineTaskDraft(project.id).reasoning}
                              />
                              <label className="flex h-9 items-center gap-2 rounded-md border border-black/15 px-3 text-sm">
                                <Checkbox
                                  checked={getInlineTaskDraft(project.id).includeContext}
                                  onCheckedChange={(checked) =>
                                    updateInlineTaskDraft(project.id, {
                                      includeContext: Boolean(checked),
                                    })
                                  }
                                />
                                <span>Include context</span>
                              </label>
                              <Input
                                className="h-9 text-sm"
                                disabled={!getInlineTaskDraft(project.id).includeContext}
                                min={0}
                                onChange={(event) =>
                                  updateInlineTaskDraft(project.id, {
                                    contextCount: Number.parseInt(event.target.value || "0", 10),
                                  })
                                }
                                onFocus={() =>
                                  updateInlineTaskDraft(project.id, { settingsExpanded: true })
                                }
                                placeholder="Messages count"
                                type="number"
                                value={getInlineTaskDraft(project.id).contextCount}
                              />
                            </div>
                          ) : null}
                        </form>

                        {project.tasks.length < 1 ? (
                          <div className="rounded-md border border-dashed border-black/15 px-3 py-2 text-sm text-zinc-500">
                            No project tasks
                          </div>
                        ) : (
                          project.tasks.map((task) => (
                            <div
                              className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-start gap-2 rounded-md border border-black/10 bg-white px-3 py-2"
                              draggable
                              key={task.id}
                              onDragEnd={() => setDraggingProjectTask(null)}
                              onDragOver={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                              }}
                              onDragStart={(event) => {
                                event.stopPropagation();
                                setDraggingProjectTask({ projectId: project.id, taskId: task.id });
                              }}
                              onDrop={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                void handleProjectTaskDrop(project.id, task.id);
                              }}
                            >
                              <GripVertical className="mt-2 h-4 w-4 text-zinc-400" />
                              <Button
                                aria-label={task.paused ? "Resume task" : "Pause task"}
                                className={`h-8 w-8 rounded-full p-0 ${
                                  task.paused
                                    ? "border-amber-300 text-amber-700 hover:bg-amber-50"
                                    : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                }`}
                                draggable={false}
                                onDragStart={preventControlDragStart}
                                onMouseDown={stopDragPropagation}
                                onPointerDown={stopDragPropagation}
                                onClick={() => void handleProjectTaskPauseToggle(task)}
                                size="sm"
                                title={task.paused ? "Resume task" : "Pause task"}
                                type="button"
                                variant="outline"
                              >
                                {task.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                                <span className="sr-only">{task.paused ? "Resume task" : "Pause task"}</span>
                              </Button>
                              <button
                                className="min-w-0 break-words pt-1 text-left text-sm leading-relaxed hover:underline"
                                draggable={false}
                                onClick={() => openTaskDetails(project, task)}
                                onMouseDown={stopDragPropagation}
                                onPointerDown={stopDragPropagation}
                                type="button"
                              >
                                {task.text}
                              </button>
                              <Button
                                aria-label={`Remove task ${task.text}`}
                                className="h-8 w-8 self-start rounded-full border-black/15 p-0 text-black/70 hover:bg-black/5 hover:text-black"
                                draggable={false}
                                onDragStart={preventControlDragStart}
                                onMouseDown={stopDragPropagation}
                                onPointerDown={stopDragPropagation}
                                onClick={() => void handleProjectTaskRemove(task)}
                                size="sm"
                                title={`Remove task ${task.text}`}
                                type="button"
                                variant="outline"
                              >
                                <X className="h-4 w-4" />
                                <span className="sr-only">Remove task</span>
                              </Button>
                            </div>
                          ))
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
              </Card>
            </div>
          );
        })}
      </div>

      <CreateProjectModal
        onCreated={async () => {
          await loadProjects();
          toast.success("Project created");
        }}
        onError={(message) => setErrorMessage(message)}
        onOpenChange={setCreateModalOpen}
        open={createModalOpen}
      />
      {createSubprojectTarget ? (
        <CreateSubprojectModal
          defaultPath={createSubprojectTarget.path}
          onCreated={async () => {
            await loadProjects();
            toast.success("Subproject created");
          }}
          onError={(message) => setErrorMessage(message)}
          onOpenChange={(open) => {
            if (!open) {
              setCreateSubprojectTarget(null);
            }
          }}
          open={Boolean(createSubprojectTarget)}
          projectId={createSubprojectTarget.id}
          projectName={createSubprojectTarget.name}
        />
      ) : null}

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setDeleteSubprojectTarget(null);
          }
        }}
        open={Boolean(deleteSubprojectTarget)}
      >
        <DialogContent>
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
            <DialogTitle className="flex items-center gap-2">
              <ListTodo className="h-4 w-4" />
              Task Details
            </DialogTitle>
            <DialogDescription asChild>
              <div>
                {taskDetailsTarget ? (
                  <div className="space-y-1">
                    <div>Project: {taskDetailsTarget.projectName}</div>
                    <div className="text-xs">
                      Created: {formatTaskDateTime(taskDetailsTarget.task.createdAt)}
                    </div>
                    <div className="text-xs">
                      Updated: {formatTaskDateTime(taskDetailsTarget.task.updatedAt)}
                    </div>
                  </div>
                ) : (
                  ""
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              disabled={!taskDetailsTarget || !canEditTask(taskDetailsTarget.task)}
              onChange={(event) => setTaskDetailsText(event.target.value)}
              placeholder="Task text"
              value={taskDetailsText}
            />
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <Input
                disabled={!taskDetailsTarget || !canEditTask(taskDetailsTarget.task)}
                onChange={(event) => setTaskDetailsModel(event.target.value)}
                placeholder="Model"
                value={taskDetailsModel}
              />
              <Input
                disabled={!taskDetailsTarget || !canEditTask(taskDetailsTarget.task)}
                onChange={(event) => setTaskDetailsReasoning(event.target.value)}
                placeholder="Reasoning"
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
