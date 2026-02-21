"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  BookText,
  EyeOff,
  ListTodo,
  Pencil,
  Plus,
  Save,
  Settings,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type {
  SkillSetEntity,
  SkillSetTreeItem,
  SkillTaskEntity,
} from "../../../shared/contracts";
import {
  createDraggableContainerHandlers,
  moveItemInList,
  preventControlDragStart,
  stopDragPropagation,
} from "../../lib/drag-drop";
import { emitClientSync } from "../../lib/client-sync";
import {
  DEFAULT_TASK_MODEL,
  DEFAULT_TASK_REASONING,
} from "@/lib/task-reasoning";
import { requestJson } from "../app-dashboard/helpers";
import { OpenClapHeader } from "../task-controls/openclap-header";
import { buildProjectAvatar } from "../task-controls/project-avatar";
import { TaskDeleteConfirmationDialog } from "../task-controls/task-delete-confirmation-dialog";
import { TaskInlineRow } from "../task-controls/task-inline-row";
import { TaskQuickAdd, type TaskQuickAddPayload } from "../task-quick-add";
import { useRealtimeSync } from "../task-controls/use-realtime-sync";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { TaskModelSelect, TaskReasoningSelect } from "../task-controls/task-select-dropdowns";

export function SkillsPage() {
  const [sets, setSets] = useState<SkillSetTreeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SkillSetTreeItem | null>(null);
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [editingSetName, setEditingSetName] = useState("");
  const [editingSetSubmitting, setEditingSetSubmitting] = useState(false);
  const [editTaskTarget, setEditTaskTarget] = useState<SkillTaskEntity | null>(null);
  const [editTaskText, setEditTaskText] = useState("");
  const [editTaskModel, setEditTaskModel] = useState("");
  const [editTaskReasoning, setEditTaskReasoning] = useState("");
  const [editTaskIncludeContext, setEditTaskIncludeContext] = useState(false);
  const [editTaskContextCount, setEditTaskContextCount] = useState(0);
  const [editTaskSubmitting, setEditTaskSubmitting] = useState(false);
  const [deleteTaskTarget, setDeleteTaskTarget] = useState<{
    id: string;
    text: string;
  } | null>(null);
  const [imageLoadErrors, setImageLoadErrors] = useState<Record<string, boolean>>({});
  const [imageCacheBustBySetId, setImageCacheBustBySetId] = useState<Record<string, number>>({});
  const [openSetImageMenuId, setOpenSetImageMenuId] = useState<string | null>(null);
  const [setImagePickerSetId, setSetImagePickerSetId] = useState<string | null>(null);
  const [setImageUploadSetId, setSetImageUploadSetId] = useState<string | null>(null);
  const [setImageDeleteSetId, setSetImageDeleteSetId] = useState<string | null>(null);
  const [draggingInstructionTask, setDraggingInstructionTask] = useState<{
    instructionSetId: string;
    taskId: string;
  } | null>(null);
  const createImageInputRef = useRef<HTMLInputElement | null>(null);
  const setImageInputRef = useRef<HTMLInputElement | null>(null);

  const loadSets = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }

    try {
      const result = await requestJson<SkillSetTreeItem[]>("/api/skills", {
        cache: "no-store",
      });
      setSets(result);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load skill sets");
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadSets();
  }, [loadSets]);

  useRealtimeSync(() => {
    void loadSets({ silent: true });
  });

  useEffect(() => {
    const handleDocumentPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (target instanceof Element && target.closest("[data-skill-image-menu]")) {
        return;
      }
      setOpenSetImageMenuId(null);
    };

    document.addEventListener("mousedown", handleDocumentPointerDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentPointerDown);
    };
  }, []);

  const bumpImageCacheBust = (instructionSetId: string) => {
    setImageCacheBustBySetId((previous) => ({
      ...previous,
      [instructionSetId]: (previous[instructionSetId] ?? 0) + 1,
    }));
  };

  const uploadSetImage = async (instructionSetId: string, file: File) => {
    const formData = new FormData();
    formData.set("file", file);

    const response = await fetch(`/api/skills/${instructionSetId}/image`, {
      body: formData,
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`Skill image upload failed: ${response.status}`);
    }
  };

  const handleCreate = async () => {
    if (name.trim().length < 1 || submitting) {
      return;
    }

    setSubmitting(true);
    try {
      const created = await requestJson<SkillSetEntity>("/api/skills", {
        body: JSON.stringify({
          description: description.trim() || undefined,
          name: name.trim(),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (imageFile) {
        await uploadSetImage(created.id, imageFile);
      }

      setName("");
      setDescription("");
      setImageFile(null);
      if (createImageInputRef.current) {
        createImageInputRef.current.value = "";
      }
      setCreateDialogOpen(false);
      await loadSets();
      toast.success("Skill set created");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create skill set");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateInstructionTask = async (
    instructionSetId: string,
    payload: TaskQuickAddPayload,
  ) => {
    try {
      await requestJson(`/api/skills/${instructionSetId}/tasks`, {
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await loadSets({ silent: true });
      toast.success("Skill task created");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create skill task");
    }
  };

  const handleInstructionSetTasksToggle = async (set: SkillSetTreeItem) => {
    const nextVisible = !set.mainPageTasksVisible;

    try {
      await requestJson<SkillSetEntity>(`/api/skills/${set.id}`, {
        body: JSON.stringify({ mainPageTasksVisible: nextVisible }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      await loadSets({ silent: true });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to update skill task list visibility",
      );
    }
  };

  const handleSetImageUpload = async (instructionSetId: string, file: File) => {
    setSetImageUploadSetId(instructionSetId);
    try {
      await uploadSetImage(instructionSetId, file);
      bumpImageCacheBust(instructionSetId);
      setImageLoadErrors((previous) => {
        if (!previous[instructionSetId]) {
          return previous;
        }
        const next = { ...previous };
        delete next[instructionSetId];
        return next;
      });
      await loadSets({ silent: true });
      toast.success("Skill set image updated");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to upload skill set image");
    } finally {
      setSetImageUploadSetId(null);
    }
  };

  const handleSetImageDelete = async (instructionSetId: string) => {
    setSetImageDeleteSetId(instructionSetId);
    try {
      await requestJson(`/api/skills/${instructionSetId}/image`, { method: "DELETE" });
      bumpImageCacheBust(instructionSetId);
      setImageLoadErrors((previous) => {
        if (!previous[instructionSetId]) {
          return previous;
        }
        const next = { ...previous };
        delete next[instructionSetId];
        return next;
      });
      await loadSets({ silent: true });
      toast.success("Skill set image deleted");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete skill set image");
    } finally {
      setSetImageDeleteSetId(null);
    }
  };

  const handleInstructionTaskAction = async (
    taskId: string,
    action: "pause" | "remove" | "resume",
  ) => {
    try {
      await requestJson(`/api/skills/tasks/${taskId}/action`, {
        body: JSON.stringify({ action }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await loadSets({ silent: true });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update skill task");
    }
  };

  const handleInstructionTaskDrop = async (instructionSetId: string, targetTaskId: string) => {
    if (
      !draggingInstructionTask ||
      draggingInstructionTask.instructionSetId !== instructionSetId ||
      draggingInstructionTask.taskId === targetTaskId
    ) {
      return;
    }

    const instructionSet = sets.find((item) => item.id === instructionSetId);
    if (!instructionSet) {
      setDraggingInstructionTask(null);
      return;
    }

    const currentOrder = instructionSet.tasks.map((task) => task.id);
    const reordered = moveItemInList(
      currentOrder,
      draggingInstructionTask.taskId,
      targetTaskId,
    );
    if (!reordered) {
      setDraggingInstructionTask(null);
      return;
    }

    try {
      await requestJson("/api/skills/tasks/reorder", {
        body: JSON.stringify({
          instructionSetId,
          orderedIds: reordered,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await loadSets({ silent: true });
      emitClientSync("skills.task_reordered");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to reorder tasks");
    } finally {
      setDraggingInstructionTask(null);
    }
  };

  const startSetNameEdit = (set: SkillSetTreeItem) => {
    setEditingSetId(set.id);
    setEditingSetName(set.name);
  };

  const cancelSetNameEdit = () => {
    setEditingSetId(null);
    setEditingSetName("");
    setEditingSetSubmitting(false);
  };

  const saveSetNameEdit = async () => {
    if (!editingSetId || editingSetName.trim().length < 1 || editingSetSubmitting) {
      return;
    }

    setEditingSetSubmitting(true);
    try {
      await requestJson(`/api/skills/${editingSetId}`, {
        body: JSON.stringify({
          name: editingSetName.trim(),
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      await loadSets({ silent: true });
      cancelSetNameEdit();
      toast.success("Skill set name updated");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update skill set");
    } finally {
      setEditingSetSubmitting(false);
    }
  };

  const openTaskEdit = (task: SkillTaskEntity) => {
    setEditTaskTarget(task);
    setEditTaskText(task.text);
    setEditTaskModel(task.model);
    setEditTaskReasoning(task.reasoning);
    setEditTaskIncludeContext(task.includePreviousContext);
    setEditTaskContextCount(task.previousContextMessages);
  };

  const saveTaskEdit = async () => {
    if (!editTaskTarget || editTaskText.trim().length < 1) {
      return;
    }

    setEditTaskSubmitting(true);
    try {
      await requestJson(`/api/skills/tasks/${editTaskTarget.id}`, {
        body: JSON.stringify({
          includePreviousContext: editTaskIncludeContext,
          model: editTaskModel.trim() || DEFAULT_TASK_MODEL,
          previousContextMessages: editTaskIncludeContext ? Math.max(0, editTaskContextCount) : 0,
          reasoning: editTaskReasoning.trim() || DEFAULT_TASK_REASONING,
          text: editTaskText.trim(),
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      await loadSets({ silent: true });
      setEditTaskTarget(null);
      toast.success("Skill task updated");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update skill task");
    } finally {
      setEditTaskSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    try {
      await requestJson(`/api/skills/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      await loadSets();
      toast.success("Skill set deleted");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete skill set");
    }
  };

  const handleInstructionTaskDelete = async () => {
    if (!deleteTaskTarget) {
      return;
    }

    try {
      await handleInstructionTaskAction(deleteTaskTarget.id, "remove");
      toast.success("Skill task deleted");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete skill task");
    } finally {
      setDeleteTaskTarget(null);
    }
  };

  const truncateTaskText = (value: string, maxLength = 180): string => {
    const normalized = value.trim();
    if (normalized.length <= maxLength) {
      return normalized;
    }
    return `${normalized.slice(0, maxLength).trimEnd()}...`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-zinc-100 p-4 md:p-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <OpenClapHeader
          rightSlot={
            <Button asChild type="button" variant="outline">
              <Link href="/settings">
                <Settings className="h-4 w-4" />
                <span className="sr-only">Settings</span>
              </Link>
            </Button>
          }
        />

        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 text-xl font-semibold">
            <BookText className="h-5 w-5" />
            <span>Skills</span>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)} type="button">
            <Plus className="h-4 w-4" />
            Create skill
          </Button>
        </div>
        <input
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            const instructionSetId = setImagePickerSetId;
            event.target.value = "";
            setSetImagePickerSetId(null);
            setOpenSetImageMenuId(null);
            if (!file || !instructionSetId) {
              return;
            }
            void handleSetImageUpload(instructionSetId, file);
          }}
          ref={setImageInputRef}
          type="file"
        />

        {loading ? (
          <Card>
            <CardContent className="py-8 text-sm text-zinc-600">Loading skills...</CardContent>
          </Card>
        ) : null}

        {!loading && sets.length < 1 ? (
          <Card>
            <CardContent className="py-8 text-sm text-zinc-600">
              No skill sets yet.
            </CardContent>
          </Card>
        ) : null}

        {!loading
          ? sets.map((set) => {
              const setAvatar = buildProjectAvatar(set.name);
              const hasUploadedImage = Boolean(set.imagePath);
              const imageVersion = `${set.updatedAt}:${hasUploadedImage ? "uploaded" : "generated"}:${imageCacheBustBySetId[set.id] ?? 0}`;
              const imageSrc = `/api/skills/${set.id}/image?v=${encodeURIComponent(imageVersion)}`;
              const showFallbackAvatar = !hasUploadedImage || Boolean(imageLoadErrors[set.id]);
              const isSetNameEditing = editingSetId === set.id;
              const setTasksVisible = set.mainPageTasksVisible !== false;

              return (
                <Card key={set.id}>
                  <CardContent className="space-y-3 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="relative" data-skill-image-menu>
                          <button
                            aria-expanded={openSetImageMenuId === set.id}
                            aria-haspopup="menu"
                            aria-label={`Skill set image options for ${set.name}`}
                            className="rounded-full"
                            onClick={() =>
                              setOpenSetImageMenuId((current) => (current === set.id ? null : set.id))
                            }
                            type="button"
                          >
                            {showFallbackAvatar ? (
                              <div
                                aria-hidden="true"
                                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border text-sm font-semibold tracking-wide shadow-sm ring-1 ring-black/10"
                                style={{
                                  backgroundColor: setAvatar.backgroundColor,
                                  borderColor: setAvatar.borderColor,
                                  color: setAvatar.textColor,
                                }}
                              >
                                {setAvatar.initials}
                              </div>
                            ) : (
                              <div
                                aria-hidden="true"
                                className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-zinc-300 bg-zinc-100 shadow-sm ring-1 ring-black/10"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  alt=""
                                  aria-hidden="true"
                                  className="h-full w-full object-cover"
                                  decoding="async"
                                  draggable={false}
                                  height={48}
                                  loading="eager"
                                  onError={() =>
                                    setImageLoadErrors((previous) => ({
                                      ...previous,
                                      [set.id]: true,
                                    }))
                                  }
                                  onLoad={() =>
                                    setImageLoadErrors((previous) => {
                                      if (!previous[set.id]) {
                                        return previous;
                                      }
                                      const next = { ...previous };
                                      delete next[set.id];
                                      return next;
                                    })
                                  }
                                  src={imageSrc}
                                  width={48}
                                />
                              </div>
                            )}
                          </button>
                          {openSetImageMenuId === set.id ? (
                            <div
                              className="absolute left-0 z-20 mt-1 min-w-[185px] rounded-md border border-black/10 bg-white p-1 shadow-lg"
                              role="menu"
                            >
                              <button
                                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100"
                                disabled={setImageUploadSetId === set.id}
                                onClick={() => {
                                  setSetImagePickerSetId(set.id);
                                  setImageInputRef.current?.click();
                                }}
                                role="menuitem"
                                type="button"
                              >
                                <Upload className="h-4 w-4" />
                                <span>Upload image</span>
                              </button>
                              {hasUploadedImage ? (
                                <button
                                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-red-700 hover:bg-red-50"
                                  disabled={setImageDeleteSetId === set.id}
                                  onClick={() => {
                                    setOpenSetImageMenuId(null);
                                    void handleSetImageDelete(set.id);
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
                        <div className="min-w-0">
                          {isSetNameEditing ? (
                            <div className="flex items-center gap-1">
                              <Input
                                autoFocus
                                className="h-8 w-[240px]"
                                disabled={editingSetSubmitting}
                                onChange={(event) => setEditingSetName(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    void saveSetNameEdit();
                                  }
                                  if (event.key === "Escape") {
                                    event.preventDefault();
                                    cancelSetNameEdit();
                                  }
                                }}
                                value={editingSetName}
                              />
                              <Button
                                aria-label="Save skill set name"
                                className="h-8 w-8 p-0"
                                disabled={editingSetSubmitting || editingSetName.trim().length < 1}
                                onClick={() => void saveSetNameEdit()}
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                <Save className="h-4 w-4" />
                              </Button>
                              <Button
                                aria-label="Cancel skill set rename"
                                className="h-8 w-8 p-0"
                                disabled={editingSetSubmitting}
                                onClick={cancelSetNameEdit}
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <div className="group/skill-name flex items-center gap-1">
                              <Link
                                className="truncate text-lg font-semibold underline-offset-4 hover:underline"
                                href={`/skills/${set.id}`}
                                title={`Open ${set.name}`}
                              >
                                {set.name}
                              </Link>
                              <Button
                                aria-label={`Rename skill set ${set.name}`}
                                className="h-7 w-7 p-0 opacity-0 transition-opacity group-hover/skill-name:opacity-100"
                                onClick={() => startSetNameEdit(set)}
                                size="sm"
                                title={`Rename skill set ${set.name}`}
                                type="button"
                                variant="ghost"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                          {set.description ? (
                            <div className="line-clamp-2 text-sm text-zinc-600">{set.description}</div>
                          ) : null}
                          <div className="text-xs text-zinc-500">{set.tasks.length} tasks</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          className="h-8 w-8 rounded-full border-black/15 p-0 text-black/70 hover:bg-black/5 hover:text-black"
                          onClick={() => setDeleteTarget(set)}
                          size="icon"
                          title="Delete skills"
                          type="button"
                          variant="outline"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
                          <ListTodo className="h-3.5 w-3.5" />
                          <span>Tasks</span>
                        </div>
                        <Button
                          aria-label={setTasksVisible ? "Hide skill tasks" : "Show skill tasks"}
                          className="h-8 w-8 rounded-full p-0"
                          onClick={() => void handleInstructionSetTasksToggle(set)}
                          size="sm"
                          title={setTasksVisible ? "Hide skill tasks" : "Show skill tasks"}
                          type="button"
                          variant="outline"
                        >
                          {setTasksVisible ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                          <span className="sr-only">
                            {setTasksVisible ? "Hide skill tasks" : "Show skill tasks"}
                          </span>
                        </Button>
                      </div>

                      {setTasksVisible ? (
                        <>
                          <TaskQuickAdd
                            onSubmit={(payload) => handleCreateInstructionTask(set.id, payload)}
                            placeholder={`Add task to ${set.name}`}
                            projectId={`skill-set:${set.id}`}
                            submitAriaLabel={`Add task to ${set.name}`}
                            submitTitle={`Add task to ${set.name}`}
                          />

                          {set.tasks.length > 0 ? (
                            <div className="space-y-2">
                              {set.tasks.map((task) => (
                                <TaskInlineRow
                                  deleteAriaLabel={`Remove task ${task.text}`}
                                  deleteTitle={`Remove task ${task.text}`}
                                  compactTextOffset={false}
                                  draggable
                                  {...createDraggableContainerHandlers({
                                    enabled: true,
                                    onDragEnd: () => setDraggingInstructionTask(null),
                                    onDragStart: () => {
                                      setDraggingInstructionTask({ instructionSetId: set.id, taskId: task.id });
                                    },
                                    onDrop: () => void handleInstructionTaskDrop(set.id, task.id),
                                  })}
                                  onControlDragStart={preventControlDragStart}
                                  onControlMouseDown={stopDragPropagation}
                                  onControlPointerDown={stopDragPropagation}
                                  inProgress={false}
                                  key={task.id}
                                  allowPause={false}
                                  onOpen={() => openTaskEdit(task)}
                                  onDelete={() => setDeleteTaskTarget({ id: task.id, text: task.text })}
                                  onPauseToggle={() =>
                                    void handleInstructionTaskAction(task.id, task.paused ? "resume" : "pause")
                                  }
                                  paused={task.paused}
                                  text={truncateTaskText(task.text)}
                                />
                              ))}
                            </div>
                          ) : (
                            <div className="rounded-md border border-dashed border-zinc-300 px-3 py-2 text-sm text-zinc-500">
                              No tasks in this skill set
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center gap-2 rounded-md border border-dashed border-amber-300 bg-amber-50/70 px-3 py-2 text-sm text-amber-800">
                          <EyeOff className="h-4 w-4" />
                          <span>Task list is hidden. Click the arrow button to show tasks.</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          : null}

        <Dialog onOpenChange={(open) => (!open ? setDeleteTarget(null) : undefined)} open={Boolean(deleteTarget)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete skill set</DialogTitle>
              <DialogDescription>
                Delete skill set <strong>{deleteTarget?.name}</strong>? This action cannot be
                undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => setDeleteTarget(null)} type="button" variant="outline">
                Cancel
              </Button>
              <Button
                className="bg-red-600 text-white hover:bg-red-700"
                onClick={() => void handleDelete()}
                type="button"
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <TaskDeleteConfirmationDialog
          onCancel={() => setDeleteTaskTarget(null)}
          onConfirm={() => void handleInstructionTaskDelete()}
          open={Boolean(deleteTaskTarget)}
          taskText={deleteTaskTarget?.text ?? ""}
          title="Delete skill task"
        />

        <Dialog
          onOpenChange={(open) => (!open ? setEditTaskTarget(null) : undefined)}
          open={Boolean(editTaskTarget)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit skill task</DialogTitle>
              <DialogDescription>Update task details.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Textarea
                className="min-h-[150px]"
                onChange={(event) => setEditTaskText(event.target.value)}
                value={editTaskText}
              />
              <div className="grid gap-3 md:grid-cols-2">
                <TaskModelSelect onValueChange={setEditTaskModel} value={editTaskModel} />
                <TaskReasoningSelect onValueChange={setEditTaskReasoning} value={editTaskReasoning} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex h-10 items-center gap-2 rounded-md border border-black/15 px-3 text-sm">
                  <Checkbox
                    checked={editTaskIncludeContext}
                    onCheckedChange={(checked) => setEditTaskIncludeContext(Boolean(checked))}
                  />
                  Include context
                </label>
                <Input
                  disabled={!editTaskIncludeContext}
                  min={0}
                  onChange={(event) =>
                    setEditTaskContextCount(
                      Number.isFinite(Number(event.target.value))
                        ? Math.max(0, Number.parseInt(event.target.value, 10))
                        : 0,
                    )
                  }
                  type="number"
                  value={editTaskContextCount}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                className="gap-2"
                onClick={() => setEditTaskTarget(null)}
                type="button"
                variant="outline"
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>
              <Button
                className="gap-2"
                disabled={editTaskSubmitting || editTaskText.trim().length < 1}
                onClick={() => void saveTaskEdit()}
                type="button"
              >
                <Save className="h-4 w-4" />
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          onOpenChange={(open) => {
            setCreateDialogOpen(open);
            if (!open) {
              setName("");
              setDescription("");
              setImageFile(null);
              if (createImageInputRef.current) {
                createImageInputRef.current.value = "";
              }
            }
          }}
          open={createDialogOpen}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create skill set</DialogTitle>
              <DialogDescription>
                Create a new skill set and optionally attach an image.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                onChange={(event) => setName(event.target.value)}
                placeholder="Skill set name"
                value={name}
              />
              <Textarea
                className="min-h-[84px]"
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Description (optional)"
                value={description}
              />
              <input
                accept="image/*"
                className="hidden"
                onChange={(event) => setImageFile(event.target.files?.[0] ?? null)}
                ref={createImageInputRef}
                type="file"
              />
              <div className="flex items-center gap-2">
                <Button
                  aria-label="Upload image"
                  className="h-9 w-9 p-0"
                  onClick={() => createImageInputRef.current?.click()}
                  title="Upload image"
                  type="button"
                  variant="outline"
                >
                  <Upload className="h-4 w-4" />
                  <span className="sr-only">Upload image</span>
                </Button>
                <span className="text-sm text-zinc-600">
                  {imageFile ? imageFile.name : "No file selected"}
                </span>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setCreateDialogOpen(false)} type="button" variant="outline">
                Cancel
              </Button>
              <Button
                disabled={submitting || name.trim().length < 1}
                onClick={() => void handleCreate()}
                type="button"
              >
                <Plus className="h-4 w-4" />
                Create skill
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {errorMessage ? (
          <Dialog onOpenChange={() => setErrorMessage(null)} open>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Request failed</DialogTitle>
                <DialogDescription>{errorMessage}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button onClick={() => setErrorMessage(null)} type="button" variant="outline">
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>
    </div>
  );
}
