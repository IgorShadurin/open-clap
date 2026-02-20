"use client";

import { CircleHelp, Loader2, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";

import {
  DEFAULT_TASK_MODEL,
  TASK_MODEL_OPTIONS,
  DEFAULT_TASK_REASONING,
  TASK_REASONING_OPTIONS,
} from "@/lib/task-reasoning";
import { cn } from "@/lib/utils";

import { requestJson } from "./app-dashboard-helpers";
import { Button } from "./ui/button";
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

const INCLUDE_CONTEXT_HELP =
  "If enabled, the daemon includes previous task texts from this same scope. Use the number field to control how many previous tasks are added.";

interface CreateTaskModalProps {
  onCreated: () => Promise<void> | void;
  onError: (message: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  projectId: string;
  scopeTitle: string;
  subprojectId?: string | null;
}

export function CreateTaskModal({
  onCreated,
  onError,
  onOpenChange,
  open,
  projectId,
  scopeTitle,
  subprojectId,
}: CreateTaskModalProps) {
  const [taskText, setTaskText] = useState("");
  const [taskModel, setTaskModel] = useState(DEFAULT_TASK_MODEL);
  const [taskReasoning, setTaskReasoning] = useState(DEFAULT_TASK_REASONING);
  const [includeContext, setIncludeContext] = useState(false);
  const [contextCount, setContextCount] = useState(0);
  const [showIncludeContextHelp, setShowIncludeContextHelp] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setTaskText("");
    setTaskModel(DEFAULT_TASK_MODEL);
    setTaskReasoning(DEFAULT_TASK_REASONING);
    setIncludeContext(false);
    setContextCount(0);
    setShowIncludeContextHelp(false);
  }, [open]);

  const handleCreateTask = async () => {
    setSubmitting(true);
    try {
      await requestJson("/api/tasks", {
        body: JSON.stringify({
          includePreviousContext: includeContext,
          model: taskModel,
          previousContextMessages: contextCount,
          projectId,
          reasoning: taskReasoning,
          subprojectId: subprojectId ?? null,
          text: taskText,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      onOpenChange(false);
      await onCreated();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Failed to create task");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
          <DialogDescription>{scopeTitle}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            onChange={(event) => setTaskText(event.target.value)}
            placeholder="Describe task"
            value={taskText}
          />
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <Select onChange={(event) => setTaskModel(event.target.value)} value={taskModel}>
              {!TASK_MODEL_OPTIONS.some((option) => option.value === taskModel) &&
              taskModel.trim().length > 0 ? (
                <option value={taskModel}>{taskModel}</option>
              ) : null}
              {TASK_MODEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              onChange={(event) => setTaskReasoning(event.target.value)}
              value={taskReasoning}
            >
              {TASK_REASONING_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div className="flex items-center gap-2 rounded border border-black/10 px-2">
              <Checkbox
                checked={includeContext}
                onCheckedChange={(checked) => setIncludeContext(Boolean(checked))}
              />
              <Label>Include context</Label>
              <div className="relative ml-auto">
                <button
                  aria-expanded={showIncludeContextHelp}
                  aria-label="Explain include context"
                  aria-controls="include-context-help"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full text-zinc-500 hover:bg-black/5 hover:text-zinc-700"
                  onBlur={() => setShowIncludeContextHelp(false)}
                  onClick={() => setShowIncludeContextHelp((previous) => !previous)}
                  onFocus={() => setShowIncludeContextHelp(true)}
                  onMouseEnter={() => setShowIncludeContextHelp(true)}
                  onMouseLeave={() => setShowIncludeContextHelp(false)}
                  type="button"
                >
                  <CircleHelp className="h-4 w-4" />
                </button>
                <div
                  className={cn(
                    "pointer-events-none absolute right-0 top-full z-20 mt-2 w-72 rounded-md border border-black/15 bg-white px-2 py-1.5 text-xs text-zinc-700 shadow-sm transition-opacity",
                    showIncludeContextHelp ? "opacity-100" : "opacity-0",
                  )}
                  id="include-context-help"
                  role="tooltip"
                >
                  {INCLUDE_CONTEXT_HELP}
                </div>
              </div>
            </div>
            <Input
              disabled={!includeContext}
              min={0}
              onChange={(event) => setContextCount(Number.parseInt(event.target.value || "0", 10))}
              type="number"
              value={contextCount}
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            <X className="h-4 w-4" />
            Cancel
          </Button>
          <Button
            disabled={submitting || taskText.trim().length < 1}
            onClick={() => void handleCreateTask()}
            type="button"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add Task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
