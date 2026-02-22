"use client";

import { Send } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent, ReactNode } from "react";

import {
  extractDroppedImagePaths,
  hasImagePathDataTransfer,
  isAbsoluteFilePath,
} from "@/lib/file-drop";
import {
  DEFAULT_TASK_MODEL,
  DEFAULT_TASK_REASONING,
} from "@/lib/task-reasoning";
import { cn } from "@/lib/utils";
import {
  loadTaskFormPreferences,
  type TaskFormPreferencesUpdatedEventDetail,
  saveTaskFormPreferences,
  TASK_FORM_PREFERENCES_UPDATED_EVENT,
} from "@/lib/task-form-preferences";

import { TaskModelSelect, TaskReasoningSelect } from "../task-controls/task-select-dropdowns";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";

export interface TaskQuickAddPayload {
  contextCount: number;
  includeContext: boolean;
  duplicateCount: number;
  model: string;
  reasoning: string;
  text: string;
}

interface TaskQuickAddProps {
  allowEmptyText?: boolean;
  onSubmit: (payload: TaskQuickAddPayload) => Promise<void> | void;
  clearInputSignal?: number;
  disableTextInput?: boolean;
  placeholder: string;
  projectId: string;
  rightAddon?: ReactNode;
  stopPropagation?: boolean;
  submitAriaLabel: string;
  submitTitle: string;
}

const IMAGE_FILE_NAME_PATTERN =
  /\.(apng|avif|bmp|gif|heic|heif|jpe?g|png|svg|tiff?|webp)$/i;

type BrowserDroppedFile = File & { path?: string; webkitRelativePath?: string };

export function TaskQuickAdd({
  allowEmptyText = false,
  onSubmit,
  clearInputSignal,
  disableTextInput = false,
  placeholder,
  projectId,
  rightAddon,
  stopPropagation = false,
  submitAriaLabel,
  submitTitle,
}: TaskQuickAddProps) {
  const [text, setText] = useState("");
  const [model, setModel] = useState(DEFAULT_TASK_MODEL);
  const [reasoning, setReasoning] = useState(DEFAULT_TASK_REASONING);
  const [fileDropReady, setFileDropReady] = useState(false);
  const [contextCount, setContextCount] = useState(0);
  const [duplicateCount, setDuplicateCount] = useState(1);
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [preferencesLoadedProjectId, setPreferencesLoadedProjectId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileDropDepthRef = useRef(0);
  const componentId = useId();
  const contextCountInputId = `task-context-count-${componentId}`;
  const duplicateCountInputId = `task-duplicate-count-${componentId}`;

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      if (formRef.current?.contains(target)) {
        return;
      }

      setSettingsExpanded(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    const saved = loadTaskFormPreferences(projectId);
    setModel(saved.model);
    setReasoning(saved.reasoning);
    setContextCount(saved.contextCount);
    setPreferencesLoadedProjectId(projectId);
  }, [projectId]);

  useEffect(() => {
    const handlePreferencesUpdated = (event: Event) => {
      const detail = (event as CustomEvent<TaskFormPreferencesUpdatedEventDetail>).detail;
      if (!detail) {
        return;
      }
      if (detail.projectId !== projectId) {
        return;
      }

      const preferences = detail.preferences;
      setModel(preferences.model);
      setReasoning(preferences.reasoning);
      setContextCount(preferences.contextCount);
    };

    window.addEventListener(TASK_FORM_PREFERENCES_UPDATED_EVENT, handlePreferencesUpdated);
    return () => {
      window.removeEventListener(TASK_FORM_PREFERENCES_UPDATED_EVENT, handlePreferencesUpdated);
    };
  }, [projectId]);

  useEffect(() => {
    if (preferencesLoadedProjectId !== projectId) {
      return;
    }

    saveTaskFormPreferences(projectId, {
      contextCount,
      includeContext: contextCount > 0,
      model,
      reasoning,
    });
  }, [contextCount, model, preferencesLoadedProjectId, projectId, reasoning]);

  useEffect(() => {
    if (typeof clearInputSignal !== "number") {
      return;
    }
    reset();
  }, [clearInputSignal]);

  const reset = () => {
    setText("");
    setSettingsExpanded(false);
    setFileDropReady(false);
    setDropError(null);
    fileDropDepthRef.current = 0;
  };

  const stopEventPropagation = <T extends { stopPropagation: () => void }>(event: T) => {
    if (stopPropagation) {
      event.stopPropagation();
    }
  };

  const preventDragStart = (event: {
    preventDefault: () => void;
    stopPropagation: () => void;
  }) => {
    if (!stopPropagation) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  };

  const setFileDropActive = (active: boolean) => {
    setFileDropReady(active);
    if (active) {
      setSettingsExpanded(true);
    }
  };

  const stopFileDropEvent = (event: {
    preventDefault: () => void;
    stopPropagation: () => void;
  }) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const getNextAttachmentIndex = (currentText: string): number => {
    const pattern = /\[Atteched image #(\d+): [^\]]+\]/g;
    let maxIndex = 0;
    let match = pattern.exec(currentText);

    while (match) {
      const parsed = Number.parseInt(match[1], 10);
      if (Number.isFinite(parsed)) {
        maxIndex = Math.max(maxIndex, parsed);
      }
      match = pattern.exec(currentText);
    }

    return maxIndex + 1;
  };

  const appendDroppedPaths = (currentText: string, droppedPaths: string[]): string => {
    if (droppedPaths.length < 1) {
      return currentText;
    }

    let nextIndex = getNextAttachmentIndex(currentText);
    const attachmentLines = droppedPaths.map((path) => {
      const line = `[Atteched image #${nextIndex}: ${path}] `;
      nextIndex += 1;
      return line;
    });

    if (currentText.trim().length < 1) {
      return attachmentLines.join("\n");
    }

    return `${currentText.trimEnd()}\n${attachmentLines.join("\n")}`;
  };

  const normalizeDroppedPath = (value: string | null | undefined): string | null => {
    const trimmed = value?.trim();
    if (!trimmed || trimmed.length < 1 || !isAbsoluteFilePath(trimmed)) {
      return null;
    }

    return trimmed;
  };

  const isImageDropFile = (file: File): boolean => {
    return file.type.toLowerCase().startsWith("image/") || IMAGE_FILE_NAME_PATTERN.test(file.name);
  };

  const getPathBaseName = (value: string): string => {
    const segments = value.split(/[\\/]/u);
    return segments[segments.length - 1] ?? value;
  };

  const uploadDroppedImageFiles = async (files: File[]): Promise<string[]> => {
    if (files.length < 1) {
      return [];
    }

    const formData = new FormData();
    for (const file of files) {
      formData.append("files", file);
    }

    const response = await fetch("/api/attachments/upload", {
      body: formData,
      method: "POST",
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `Attachment upload failed with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as { paths?: string[] };
    if (!Array.isArray(payload.paths)) {
      throw new Error("Attachment upload response does not include `paths`");
    }

    return payload.paths.filter((path) => typeof path === "string" && path.trim().length > 0);
  };

  const handleFileDragEnter = (event: DragEvent<HTMLFormElement>) => {
    if (disableTextInput) {
      return;
    }
    if (!hasImagePathDataTransfer(event.dataTransfer)) {
      return;
    }

    stopFileDropEvent(event);
    fileDropDepthRef.current += 1;
    setFileDropActive(true);
  };

  const handleFileDragLeave = (event: DragEvent<HTMLFormElement>) => {
    if (disableTextInput) {
      return;
    }
    if (!hasImagePathDataTransfer(event.dataTransfer)) {
      return;
    }

    stopFileDropEvent(event);
    fileDropDepthRef.current = Math.max(0, fileDropDepthRef.current - 1);
    if (fileDropDepthRef.current === 0) {
      setFileDropActive(false);
    }
  };

  const handleFileDragOver = (event: DragEvent<HTMLFormElement>) => {
    if (disableTextInput) {
      return;
    }
    if (!hasImagePathDataTransfer(event.dataTransfer)) {
      return;
    }

    stopFileDropEvent(event);
    event.dataTransfer.dropEffect = "copy";
    setFileDropActive(true);
  };

  const handleFileDrop = async (event: DragEvent<HTMLFormElement>) => {
    if (disableTextInput) {
      return;
    }
    stopFileDropEvent(event);
    fileDropDepthRef.current = 0;
    setFileDropActive(false);
    setDropError(null);

    const transferPaths = extractDroppedImagePaths(event.dataTransfer)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    const droppedImageFiles = Array.from(event.dataTransfer.files).filter((file) =>
      isImageDropFile(file),
    );

    const attachmentPaths: string[] = [];
    const seenPaths = new Set<string>();
    for (const path of transferPaths) {
      if (!seenPaths.has(path)) {
        attachmentPaths.push(path);
        seenPaths.add(path);
      }
    }

    const resolvedByName = new Set(
      attachmentPaths.map((path) => getPathBaseName(path).toLowerCase()),
    );
    const filesToUpload: File[] = [];

    for (const file of droppedImageFiles) {
      const pathFromFile = normalizeDroppedPath((file as BrowserDroppedFile).path);
      if (pathFromFile) {
        if (!seenPaths.has(pathFromFile)) {
          attachmentPaths.push(pathFromFile);
          seenPaths.add(pathFromFile);
          resolvedByName.add(getPathBaseName(pathFromFile).toLowerCase());
        }
        continue;
      }

      if (resolvedByName.has(file.name.toLowerCase())) {
        continue;
      }

      filesToUpload.push(file);
    }

    if (filesToUpload.length > 0) {
      try {
        const uploadedPaths = await uploadDroppedImageFiles(filesToUpload);
        for (const uploadedPath of uploadedPaths) {
          const normalized = uploadedPath.trim();
          if (normalized.length < 1 || seenPaths.has(normalized)) {
            continue;
          }
          attachmentPaths.push(normalized);
          seenPaths.add(normalized);
        }
      } catch (error) {
        setDropError(error instanceof Error ? error.message : "Attachment upload failed");
      }
    }

    if (attachmentPaths.length < 1) {
      setDropError((current) => current ?? "Unable to resolve a dropped image path");
      return;
    }

    setText((current) => appendDroppedPaths(current, attachmentPaths));
    textInputRef.current?.focus();
  };

  const adjustTextAreaHeight = () => {
    const textarea = textInputRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    const maxHeight = 192;
    const minHeight = 36;
    const nextHeight = Math.max(minHeight, textarea.scrollHeight);
    textarea.style.height = `${Math.min(maxHeight, nextHeight)}px`;
    textarea.style.overflowY = nextHeight > maxHeight ? "auto" : "hidden";
  };

  useEffect(() => {
    adjustTextAreaHeight();
  }, [text]);

  const handleSubmit = async () => {
    const trimmedText = text.trim();
    if (submitting || (!allowEmptyText && trimmedText.length < 1)) {
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        contextCount,
        includeContext: contextCount > 0,
        duplicateCount,
        model,
        reasoning,
        text: trimmedText,
      });
      reset();
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (disableTextInput) {
      return;
    }

    if (event.key === "Enter") {
      if (event.metaKey || event.ctrlKey) {
        return;
      }

      event.preventDefault();
      void handleSubmit();
      return;
    }

    if (event.key !== "Tab" || event.shiftKey) {
      return;
    }

    if (event.currentTarget.value.trim().length < 1) {
      return;
    }

    event.preventDefault();
    void handleSubmit();
  };

  const handleContextCountChange = (value: string) => {
    const nextCount = Number.parseInt(value, 10);
    setContextCount(Number.isFinite(nextCount) ? Math.max(0, nextCount) : 0);
  };

  const handleDuplicateCountChange = (value: string) => {
    const nextCount = Number.parseInt(value, 10);
    setDuplicateCount(Number.isFinite(nextCount) ? Math.max(1, nextCount) : 1);
  };

  return (
    <form
      className={cn(
        "relative rounded-md border border-black/10 bg-white px-3 py-2",
        fileDropReady ? "border-emerald-400 bg-emerald-50/40" : undefined,
      )}
      data-task-file-drop="true"
      ref={formRef}
      onDragEnter={handleFileDragEnter}
      onDragLeave={handleFileDragLeave}
      onDragOver={handleFileDragOver}
      onDragStart={preventDragStart}
      onDrop={(event) => {
        void handleFileDrop(event);
      }}
      onMouseDown={stopEventPropagation}
      onPointerDown={stopEventPropagation}
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <div className="flex items-center gap-2">
        <Textarea
          className={cn(
            "h-auto min-h-9 max-h-48 w-full resize-none text-sm",
            fileDropReady ? "border-emerald-400 bg-emerald-50 ring-1 ring-emerald-200" : undefined,
          )}
          rows={1}
          disabled={disableTextInput}
          draggable={false}
          data-task-file-drop="true"
          onChange={(event) => setText(event.target.value)}
          onDragStart={preventDragStart}
          onFocus={() => setSettingsExpanded(true)}
          onInput={adjustTextAreaHeight}
          onMouseDown={stopEventPropagation}
          onPointerDown={stopEventPropagation}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          ref={textInputRef}
          value={text}
        />
        {rightAddon}
        <Button
          aria-label={submitAriaLabel}
          className="h-9 w-9 shrink-0 p-0"
          disabled={submitting || (!allowEmptyText && text.trim().length < 1)}
          draggable={false}
          onDragStart={preventDragStart}
          onMouseDown={stopEventPropagation}
          onPointerDown={stopEventPropagation}
          title={submitTitle}
          type="submit"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
      {fileDropReady ? (
        <div className="mt-2 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
          Release to attach screenshot path
        </div>
      ) : null}
      {dropError ? (
          <div className="mt-2 rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-800">
            {dropError}
          </div>
        ) : null}
      {settingsExpanded ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-2 grid grid-cols-1 gap-2 rounded-md border border-black/15 bg-white p-2 shadow-lg md:grid-cols-4">
          <div className="flex flex-col gap-1">
            <Label
              className="text-xs font-medium text-zinc-500"
              htmlFor={`task-model-${componentId}`}
            >
              Model
            </Label>
            <TaskModelSelect
              className="h-9 text-sm"
              id={`task-model-${componentId}`}
              onFocus={() => setSettingsExpanded(true)}
              onValueChange={setModel}
              value={model}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label
              className="text-xs font-medium text-zinc-500"
              htmlFor={`task-difficulty-${componentId}`}
            >
              Difficulty
            </Label>
            <TaskReasoningSelect
              className="h-9 text-sm"
              id={`task-difficulty-${componentId}`}
              onFocus={() => setSettingsExpanded(true)}
              onValueChange={setReasoning}
              value={reasoning}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label
              className="text-xs font-medium text-zinc-500"
              htmlFor={contextCountInputId}
            >
              Include context
            </Label>
            <Input
              aria-label="Include context messages count"
              className="h-9 text-sm"
              id={contextCountInputId}
              draggable={false}
              inputMode="numeric"
              onChange={(event) => handleContextCountChange(event.target.value)}
              onFocus={() => setSettingsExpanded(true)}
              onMouseDown={stopEventPropagation}
              onPointerDown={stopEventPropagation}
              onDragStart={preventDragStart}
              placeholder="Messages count"
              type="text"
              value={contextCount}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label
              className="text-xs font-medium text-zinc-500"
              htmlFor={duplicateCountInputId}
            >
              Duplicates
            </Label>
            <Input
              aria-label="Duplicate count"
              className="h-9 text-sm"
              id={duplicateCountInputId}
              inputMode="numeric"
              onChange={(event) => handleDuplicateCountChange(event.target.value)}
              onFocus={() => setSettingsExpanded(true)}
              onMouseDown={stopEventPropagation}
              onPointerDown={stopEventPropagation}
              onDragStart={preventDragStart}
              placeholder="1"
              type="text"
              value={duplicateCount}
            />
          </div>
        </div>
      ) : null}
    </form>
  );
}
