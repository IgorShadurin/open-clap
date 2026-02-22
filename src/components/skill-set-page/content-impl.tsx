"use client";

import Link from "next/link";
import { BookText, Pencil, Save, Settings, Upload, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  DEFAULT_TASK_MODEL,
  DEFAULT_TASK_REASONING,
} from "@/lib/task-reasoning";
import { requestJson } from "../app-dashboard/helpers";
import { OpenClapHeader } from "../task-controls/openclap-header";
import { TaskDeleteConfirmationDialog } from "../task-controls/task-delete-confirmation-dialog";
import { TaskInlineRow } from "../task-controls/task-inline-row";
import { TaskQuickAdd, type TaskQuickAddPayload } from "../task-quick-add";
import { usePreventUnhandledFileDrop } from "../task-controls/use-prevent-unhandled-file-drop";
import { useRealtimeSync } from "../task-controls/use-realtime-sync";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
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

interface SkillSetPageProps {
  instructionSetId: string;
}

function truncateText(value: string, limit = 120): string {
  const normalized = value.trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit).trimEnd()}...`;
}

export function SkillSetPage({ instructionSetId }: SkillSetPageProps) {
  usePreventUnhandledFileDrop();

  const [setData, setSetData] = useState<SkillSetTreeItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [deleteTaskTarget, setDeleteTaskTarget] = useState<SkillTaskEntity | null>(null);
  const [editTaskTarget, setEditTaskTarget] = useState<SkillTaskEntity | null>(null);
  const [editTaskText, setEditTaskText] = useState("");
  const [editTaskModel, setEditTaskModel] = useState("");
  const [editTaskReasoning, setEditTaskReasoning] = useState("");
  const [editTaskIncludeContext, setEditTaskIncludeContext] = useState(false);
  const [editTaskContextCount, setEditTaskContextCount] = useState(0);
  const [editTaskSubmitting, setEditTaskSubmitting] = useState(false);
  const [editSetOpen, setEditSetOpen] = useState(false);
  const [editSetName, setEditSetName] = useState("");
  const [editSetDescription, setEditSetDescription] = useState("");
  const [editSetSubmitting, setEditSetSubmitting] = useState(false);
  const [editSetImageFile, setEditSetImageFile] = useState<File | null>(null);
  const [instructionSetCatalog, setInstructionSetCatalog] = useState<SkillSetEntity[]>([]);
  const [editSetLinkedInstructionSetIds, setEditSetLinkedInstructionSetIds] = useState<string[]>(
    [],
  );
  const [imageLoadError, setImageLoadError] = useState(false);
  const [imageCacheBust, setImageCacheBust] = useState(0);
  const editSetImageInputRef = useRef<HTMLInputElement | null>(null);

  const loadSet = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setLoading(true);
      }

      try {
        const result = await requestJson<SkillSetTreeItem>(
          `/api/skills/${instructionSetId}`,
        );
        setSetData(result);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to load skill set");
      } finally {
        if (!options?.silent) {
          setLoading(false);
        }
      }
    },
    [instructionSetId],
  );

  useEffect(() => {
    void loadSet();
  }, [loadSet]);

  const loadInstructionSetCatalog = useCallback(async () => {
    try {
      const result = await requestJson<SkillSetEntity[]>("/api/skills");
      setInstructionSetCatalog(result);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load skill sets");
    }
  }, []);

  useEffect(() => {
    void loadInstructionSetCatalog();
  }, [loadInstructionSetCatalog]);

  useRealtimeSync(() => {
    void loadSet({ silent: true });
    void loadInstructionSetCatalog();
  });

  const imageSrc = useMemo(
    () => `/api/skills/${instructionSetId}/image?v=${encodeURIComponent(`${setData?.updatedAt ?? "na"}:${imageCacheBust}`)}`,
    [imageCacheBust, instructionSetId, setData?.updatedAt],
  );

  const availableInstructionSetsForLinking = useMemo(
    () =>
      instructionSetCatalog.filter((item) => item.id !== setData?.id).sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    [instructionSetCatalog, setData?.id],
  );

  const linkedInstructionSetNames = useMemo(() => {
    if (!setData) {
      return "";
    }

    const instructionSetNameById = new Map(
      instructionSetCatalog.map((item) => [item.id, item.name]),
    );
    const names = setData.linkedInstructionSetIds
      .map((id) => instructionSetNameById.get(id))
      .filter((name): name is string => Boolean(name && name.trim().length > 0));

    return names.length > 0 ? names.join(", ") : "";
  }, [instructionSetCatalog, setData]);

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
      await loadSet();
      setEditTaskTarget(null);
      toast.success("Skill task updated");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update task");
    } finally {
      setEditTaskSubmitting(false);
    }
  };

  const createTask = async (payload: TaskQuickAddPayload) => {
    try {
      const duplicateCount = Number.isFinite(payload.duplicateCount)
        ? Math.max(1, Math.floor(payload.duplicateCount))
        : 1;

      await requestJson(`/api/skills/${instructionSetId}/tasks`, {
        body: JSON.stringify({
          duplicateCount,
          includePreviousContext: payload.includeContext,
          model: payload.model,
          previousContextMessages: payload.includeContext ? payload.contextCount : 0,
          reasoning: payload.reasoning,
          text: payload.text,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await loadSet();
      toast.success(`Skill task created (${duplicateCount}x)`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create task");
    }
  };

  const setTaskAction = async (
    taskId: string,
    action: "pause" | "remove" | "resume",
  ) => {
    try {
      await requestJson(`/api/skills/tasks/${taskId}/action`, {
        body: JSON.stringify({ action }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await loadSet();
      if (action === "remove") {
        setDeleteTaskTarget(null);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update task");
    }
  };

  const handleConfirmDeleteTask = async () => {
    if (!deleteTaskTarget) {
      return;
    }
    await setTaskAction(deleteTaskTarget.id, "remove");
  };

  const handleTaskDrop = async (targetTaskId: string) => {
    if (!setData || !draggingTaskId || draggingTaskId === targetTaskId) {
      return;
    }

    const currentOrder = setData.tasks.map((task) => task.id);
    const reordered = moveItemInList(currentOrder, draggingTaskId, targetTaskId);
    if (!reordered) {
      return;
    }

    try {
      await requestJson("/api/skills/tasks/reorder", {
        body: JSON.stringify({
          instructionSetId: instructionSetId,
          orderedIds: reordered,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await loadSet();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to reorder tasks");
    } finally {
      setDraggingTaskId(null);
    }
  };

  const openSetEdit = () => {
    if (!setData) {
      return;
    }
    setEditSetName(setData.name);
    setEditSetDescription(setData.description ?? "");
    setEditSetImageFile(null);
    setEditSetLinkedInstructionSetIds(Array.from(new Set(setData.linkedInstructionSetIds)));
    if (editSetImageInputRef.current) {
      editSetImageInputRef.current.value = "";
    }
    setEditSetOpen(true);
  };

  const toggleEditSetLinkedInstructionSet = (instructionSetId: string, checked: boolean) => {
    setEditSetLinkedInstructionSetIds((current) => {
      const next = new Set(current.filter((item) => item !== instructionSetId));
      if (checked) {
        next.add(instructionSetId);
      }
      return Array.from(next);
    });
  };

  const saveSetEdit = async () => {
    if (!setData || editSetName.trim().length < 1 || editSetSubmitting) {
      return;
    }

    setEditSetSubmitting(true);
    try {
      await requestJson(`/api/skills/${setData.id}`, {
        body: JSON.stringify({
          description: editSetDescription.trim() || null,
          linkedInstructionSetIds: editSetLinkedInstructionSetIds,
          name: editSetName.trim(),
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });

      if (editSetImageFile) {
        const formData = new FormData();
        formData.set("file", editSetImageFile);
        const uploadResponse = await fetch(`/api/skills/${setData.id}/image`, {
          body: formData,
          method: "POST",
        });
        if (!uploadResponse.ok) {
          throw new Error(`Image upload failed with HTTP ${uploadResponse.status}`);
        }
        setImageLoadError(false);
        setImageCacheBust((value) => value + 1);
      }

      await loadSet();
      setEditSetOpen(false);
      toast.success("Skill set updated");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update skill set");
    } finally {
      setEditSetSubmitting(false);
    }
  };

  const deleteSetImage = async () => {
    if (!setData) {
      return;
    }

    try {
      await requestJson(`/api/skills/${setData.id}/image`, { method: "DELETE" });
      setImageLoadError(true);
      setImageCacheBust((value) => value + 1);
      await loadSet();
      toast.success("Skill set image deleted");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete image");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-zinc-100 p-4 md:p-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <OpenClapHeader
          rightSlot={
            <>
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
            </>
          }
        />

        {loading ? (
          <Card>
            <CardContent className="py-8 text-sm text-zinc-600">Loading skill sets...</CardContent>
          </Card>
        ) : null}

        {!loading && !setData ? (
          <Card>
            <CardContent className="py-8 text-sm text-zinc-600">
              Skill set not found.
            </CardContent>
          </Card>
        ) : null}

        {setData ? (
          <Card>
            <CardHeader className="space-y-4">
              <CardTitle className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {setData.imagePath && !imageLoadError ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt=""
                      className="h-14 w-14 rounded-md border border-zinc-200 object-cover"
                      onError={() => setImageLoadError(true)}
                      src={imageSrc}
                    />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-md border border-dashed border-zinc-300 bg-zinc-50 text-zinc-500">
                      <BookText className="h-6 w-6" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-2xl">{setData.name}</div>
                    {setData.description ? (
                      <div className="text-sm text-zinc-600">{setData.description}</div>
                    ) : null}
                    {linkedInstructionSetNames ? (
                      <div className="mt-1 text-xs text-zinc-500">
                        Links: {linkedInstructionSetNames}
                      </div>
                    ) : null}
                  </div>
                </div>
                <Button onClick={openSetEdit} type="button" variant="outline">
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              </CardTitle>
            </CardHeader>
          </Card>
        ) : null}

        {setData ? (
          <Card>
            <CardHeader>
              <CardTitle>Tasks</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <TaskQuickAdd
                onSubmit={createTask}
                placeholder="Add skill task"
                projectId={`skill-set:${instructionSetId}`}
                submitAriaLabel="Add skill task"
                submitTitle="Add skill task"
              />

              {setData.tasks.length < 1 ? (
                <div className="rounded-md border border-dashed border-zinc-300 p-3 text-sm text-zinc-500">
                  No tasks in this skill set.
                </div>
              ) : null}

              {setData.tasks.map((task) => (
                <TaskInlineRow
                  deleteAriaLabel={`Remove task ${task.text}`}
                  deleteTitle={`Remove task ${task.text}`}
                  draggable
                  key={task.id}
                  {...createDraggableContainerHandlers({
                    enabled: true,
                    onDragEnd: () => setDraggingTaskId(null),
                    onDragStart: () => {
                      setDraggingTaskId(task.id);
                    },
                    onDrop: () => void handleTaskDrop(task.id),
                  })}
                  onControlDragStart={preventControlDragStart}
                  onControlMouseDown={stopDragPropagation}
                  onControlPointerDown={stopDragPropagation}
                  onDelete={() => setDeleteTaskTarget(task)}
                  onOpen={() => openTaskEdit(task)}
                  onPauseToggle={() => void setTaskAction(task.id, task.paused ? "resume" : "pause")}
                  paused={task.paused}
                  text={truncateText(task.text)}
                  textActionTitle="Edit task"
                />
              ))}
            </CardContent>
          </Card>
        ) : null}

        <TaskDeleteConfirmationDialog
          onCancel={() => setDeleteTaskTarget(null)}
          onConfirm={() => void handleConfirmDeleteTask()}
          open={Boolean(deleteTaskTarget)}
          taskText={truncateText(deleteTaskTarget?.text ?? "", 100)}
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

        <Dialog onOpenChange={setEditSetOpen} open={editSetOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit skill set</DialogTitle>
              <DialogDescription>Update skill set metadata and image.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-zinc-700">Name</label>
                <Input
                  onChange={(event) => setEditSetName(event.target.value)}
                  placeholder="Name"
                  value={editSetName}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-zinc-700">Description</label>
                <Textarea
                  className="min-h-[84px]"
                  onChange={(event) => setEditSetDescription(event.target.value)}
                  placeholder="Description"
                  value={editSetDescription}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-zinc-700">Linked skill sets</label>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-black/10 bg-zinc-50/60 p-3">
                  {availableInstructionSetsForLinking.length < 1 ? (
                    <div className="text-sm text-zinc-600">
                      No other skill sets available.
                    </div>
                  ) : (
                    availableInstructionSetsForLinking.map((instructionSet) => {
                      const isLinked = editSetLinkedInstructionSetIds.includes(instructionSet.id);
                      return (
                        <label
                          className="flex items-center gap-2 rounded-md px-1 py-1 text-sm"
                          key={instructionSet.id}
                        >
                          <Checkbox
                            checked={isLinked}
                            onCheckedChange={(checked) =>
                              toggleEditSetLinkedInstructionSet(
                                instructionSet.id,
                                Boolean(checked),
                              )
                            }
                          />
                          <span className="truncate" title={instructionSet.name}>
                            {instructionSet.name}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-zinc-700">Image</label>
                <input
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => setEditSetImageFile(event.target.files?.[0] ?? null)}
                  ref={editSetImageInputRef}
                  type="file"
                />
                <div className="space-y-2 rounded-md border border-black/10 bg-zinc-50/60 p-3">
                  <div className="text-xs text-zinc-600">
                    {editSetImageFile
                      ? `Selected: ${editSetImageFile.name}`
                      : setData?.imagePath
                        ? "Current uploaded image is set"
                        : "No uploaded image"}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      onClick={() => editSetImageInputRef.current?.click()}
                      type="button"
                      variant="outline"
                    >
                      <Upload className="h-4 w-4" />
                      Upload image
                    </Button>
                    <Button
                      className="border-red-300 text-red-700 hover:bg-red-50"
                      disabled={!setData?.imagePath}
                      onClick={() => void deleteSetImage()}
                      type="button"
                      variant="outline"
                    >
                      Remove image
                    </Button>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                className="gap-2"
                onClick={() => setEditSetOpen(false)}
                type="button"
                variant="outline"
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>
              <Button
                className="gap-2"
                disabled={editSetSubmitting || editSetName.trim().length < 1}
                onClick={() => void saveSetEdit()}
                type="button"
              >
                <Save className="h-4 w-4" />
                Save
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
