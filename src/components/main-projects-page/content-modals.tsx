"use client";

import { ListTodo, Square, Save, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { TaskDeleteConfirmationDialog } from "../task-controls/task-delete-confirmation-dialog";
import { TaskModelSelect, TaskReasoningSelect } from "../task-controls/task-select-dropdowns";
import { formatTaskDateTime, truncateTaskPreview } from "./content-helpers";
import type { MainProjectsPageController } from "./content-controller";

interface MainProjectsPageModalsProps {
  controller: MainProjectsPageController;
}

export const MainProjectsPageModals = ({ controller }: MainProjectsPageModalsProps) => {
  const c = controller;

  return (
    <>
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            c.setStopTaskTarget(null);
          }
        }}
        open={Boolean(c.stopTaskTarget)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Stop Task</DialogTitle>
            <DialogDescription>
              Stop task <strong>{truncateTaskPreview(c.stopTaskTarget?.text ?? "")}</strong>? This will
              terminate its current execution.
            </DialogDescription>
          </DialogHeader>
          {!c.stopTaskTargetRunning ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              This task is no longer running.
            </div>
          ) : null}
          <DialogFooter>
            <Button onClick={() => c.setStopTaskTarget(null)} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              className="bg-orange-600 text-white hover:bg-orange-700"
              disabled={!c.stopTaskTargetRunning}
              onClick={() => void c.handleConfirmTaskStop()}
              type="button"
            >
              <Square className="h-4 w-4" />
              Stop
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TaskDeleteConfirmationDialog
        onCancel={() => c.setDeleteTaskTarget(null)}
        onConfirm={() => void c.handleConfirmTaskDelete()}
        open={Boolean(c.deleteTaskTarget)}
        taskText={truncateTaskPreview(c.deleteTaskTarget?.text ?? "")}
        title="Delete Task"
        warning={
          c.deleteTaskTargetLocked ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Task is currently in execution and cannot be changed.
            </div>
          ) : null
        }
        confirmDisabled={c.deleteTaskTargetLocked}
      />

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            c.setDeleteProjectTarget(null);
          }
        }}
        open={Boolean(c.deleteProjectTarget)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
            <DialogDescription>
              Delete project <strong>{c.deleteProjectTarget?.name ?? ""}</strong>? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => c.setDeleteProjectTarget(null)} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => void c.handleConfirmProjectDelete()}
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
            c.setClearProjectTasksTarget(null);
          }
        }}
        open={Boolean(c.clearProjectTasksTarget)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clear Tasks</DialogTitle>
            <DialogDescription>
              Clear <strong>{c.clearProjectTasksTarget?.taskCount ?? 0}</strong> tasks from project{" "}
              <strong>{c.clearProjectTasksTarget?.name ?? ""}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            This will delete all tasks for this project, including subproject tasks.
          </div>
          <DialogFooter>
            <Button onClick={() => c.setClearProjectTasksTarget(null)} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => void c.handleConfirmProjectTasksDelete()}
              type="button"
            >
              <Trash2 className="h-4 w-4" />
              Clear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            c.setDeleteSubprojectTarget(null);
          }
        }}
        open={Boolean(c.deleteSubprojectTarget)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Subproject</DialogTitle>
            <DialogDescription>
              Delete subproject <strong>{c.deleteSubprojectTarget?.name ?? ""}</strong>? This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => c.setDeleteSubprojectTarget(null)} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => void c.handleConfirmSubprojectDelete()}
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
            c.setTaskDetailsTarget(null);
          }
        }}
        open={Boolean(c.taskDetailsTarget)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ListTodo className="h-4 w-4 text-zinc-500" />
              Task
            </DialogTitle>
            <DialogDescription className="text-sm text-zinc-600">
              {c.taskDetailsTarget ? `Project: ${c.taskDetailsTarget.projectName}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {c.taskDetailsTarget ? (
              <div className="rounded-md border border-black/10 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span>Created: {formatTaskDateTime(c.taskDetailsTarget.task.createdAt)}</span>
                  <span>Updated: {formatTaskDateTime(c.taskDetailsTarget.task.updatedAt)}</span>
                </div>
              </div>
            ) : null}
            <Textarea
              disabled={!c.taskDetailsTarget || !c.canEditTask?.(c.taskDetailsTarget?.task)}
              onChange={(event) => c.setTaskDetailsText(event.target.value)}
              placeholder="Task text"
              value={c.taskDetailsText}
            />
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <TaskModelSelect
                disabled={!c.taskDetailsTarget || !c.canEditTask?.(c.taskDetailsTarget?.task)}
                onValueChange={c.setTaskDetailsModel}
                value={c.taskDetailsModel}
              />
              <TaskReasoningSelect
                disabled={!c.taskDetailsTarget || !c.canEditTask?.(c.taskDetailsTarget?.task)}
                onValueChange={c.setTaskDetailsReasoning}
                value={c.taskDetailsReasoning}
              />
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <label className="flex h-10 items-center gap-2 rounded-md border border-black/15 px-3 text-sm">
                <Checkbox
                  checked={c.taskDetailsIncludeContext}
                  disabled={!c.taskDetailsTarget || !c.canEditTask?.(c.taskDetailsTarget?.task)}
                  onCheckedChange={(checked) => c.setTaskDetailsIncludeContext(Boolean(checked))}
                />
                <span>Include context</span>
              </label>
              <Input
                disabled={
                  !c.taskDetailsIncludeContext ||
                  !c.taskDetailsTarget ||
                  !c.canEditTask?.(c.taskDetailsTarget?.task)
                }
                min={0}
                onChange={(event) => c.setTaskDetailsContextCount(Number.parseInt(event.target.value || "0", 10))}
                placeholder="Messages count"
                type="number"
                value={c.taskDetailsContextCount}
              />
            </div>
            {c.taskDetailsTarget && !c.canEditTask?.(c.taskDetailsTarget?.task) ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Task is currently in execution and cannot be edited.
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button onClick={() => c.setTaskDetailsTarget(null)} type="button" variant="outline">
              Close
            </Button>
            <Button
              disabled={
                c.taskDetailsSubmitting ||
                !c.taskDetailsTarget ||
                !c.canEditTask?.(c.taskDetailsTarget?.task) ||
                c.taskDetailsText.trim().length < 1
              }
              onClick={() => void c.handleTaskDetailsSave()}
              type="button"
            >
              <Save className="h-4 w-4" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={(open) => !open && c.setErrorMessage(null)} open={Boolean(c.errorMessage)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Error</DialogTitle>
            <DialogDescription>{c.errorMessage ?? "An unexpected error occurred."}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => c.setErrorMessage(null)} type="button" variant="outline">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
