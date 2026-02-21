"use client";

import { BookText, GripVertical, Pause, Play, Square, X } from "lucide-react";
import type {
  DragEventHandler,
  MouseEventHandler,
  PointerEventHandler,
} from "react";

import { Button } from "./ui/button";

interface TaskInlineRowProps {
  allowActions?: boolean;
  allowPause?: boolean;
  compactTextOffset?: boolean;
  deleteAriaLabel?: string;
  deleteDisabled?: boolean;
  deleteTitle?: string;
  disableText?: boolean;
  draggable?: boolean;
  inProgress?: boolean;
  locked?: boolean;
  onContainerDragEnd?: DragEventHandler<HTMLDivElement>;
  onContainerDragOver?: DragEventHandler<HTMLDivElement>;
  onContainerDragStart?: DragEventHandler<HTMLDivElement>;
  onContainerDrop?: DragEventHandler<HTMLDivElement>;
  onDelete: () => void;
  onOpen?: () => void;
  onPauseToggle?: () => void;
  onStop?: () => void;
  onControlDragStart?: DragEventHandler<HTMLButtonElement>;
  onControlMouseDown?: MouseEventHandler<HTMLButtonElement>;
  onControlPointerDown?: PointerEventHandler<HTMLButtonElement>;
  paused?: boolean;
  showGrip?: boolean;
  text: string;
  sourceInstructionSetName?: string;
  textActionTitle?: string;
}

export function TaskInlineRow({
  allowActions = true,
  allowPause = true,
  compactTextOffset = true,
  deleteAriaLabel = "Remove task",
  deleteDisabled = false,
  deleteTitle = "Remove task",
  disableText = false,
  draggable = false,
  inProgress = false,
  locked = false,
  onContainerDragEnd,
  onContainerDragOver,
  onContainerDragStart,
  onContainerDrop,
  onDelete,
  onOpen,
  onPauseToggle,
  onStop,
  onControlDragStart,
  onControlMouseDown,
  onControlPointerDown,
  paused = false,
  showGrip = true,
  sourceInstructionSetName,
  text,
  textActionTitle = "Edit task",
}: TaskInlineRowProps) {
  const hasPauseControls = allowPause && !locked;
  const canTogglePause = Boolean(onPauseToggle) && hasPauseControls;
  const canStop = Boolean(onStop) && inProgress;
  const showPauseControl = canStop || canTogglePause;
  const pauseTitle = locked
    ? "Task is currently executing and cannot be changed"
    : paused
      ? "Resume task"
      : "Pause task";
  const canOpen = Boolean(onOpen) && !disableText;
  const compactSpacingClass = compactTextOffset && !showPauseControl ? " ml-2" : "";
  const rowLockedClass = locked ? "border-black/5 bg-zinc-50 opacity-70" : "";
  const gripClassName = locked ? "mt-2 h-4 w-4 text-zinc-300" : "mt-2 h-4 w-4 text-zinc-400";

  return (
    <div
      className={`grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-start gap-2 rounded-md border border-black/10 bg-white px-3 py-2 ${rowLockedClass}`}
      draggable={draggable}
      onDragEnd={onContainerDragEnd}
      onDragOver={onContainerDragOver}
      onDragStart={onContainerDragStart}
      onDrop={onContainerDrop}
    >
      {showGrip ? <GripVertical className={gripClassName} /> : <span className="w-4" />}

      {canStop ? (
        <Button
          aria-label="Stop task"
          className="h-8 w-8 rounded-full border-orange-200 p-0 text-orange-700 hover:bg-orange-50"
          draggable={false}
          onDragStart={onControlDragStart}
          onMouseDown={onControlMouseDown}
          onPointerDown={onControlPointerDown}
          onClick={onStop}
          size="sm"
          title="Stop task"
          type="button"
          variant="outline"
        >
          <Square className="h-4 w-4" />
          <span className="sr-only">Stop task</span>
        </Button>
      ) : canTogglePause ? (
        <Button
          aria-label={paused ? "Resume task" : "Pause task"}
          className={`h-8 w-8 rounded-full p-0 ${
            paused
              ? "border-amber-300 text-amber-700 hover:bg-amber-50"
              : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
          }`}
          disabled={!canTogglePause}
          draggable={false}
          onDragStart={onControlDragStart}
          onMouseDown={onControlMouseDown}
          onPointerDown={onControlPointerDown}
          onClick={onPauseToggle}
          size="sm"
          title={pauseTitle}
          type="button"
          variant="outline"
        >
          {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          <span className="sr-only">{paused ? "Resume task" : "Pause task"}</span>
        </Button>
      ) : (
        <span aria-hidden className="h-8 w-0" />
      )}

      {canOpen ? (
        <button
          className={`min-w-0 break-words pt-1 text-left text-sm leading-relaxed${compactSpacingClass} ${
            disableText ? "cursor-not-allowed text-zinc-500" : "cursor-pointer hover:underline"
          }`}
          disabled={disableText}
          draggable={false}
          onClick={onOpen}
          onMouseDown={onControlMouseDown}
          onPointerDown={onControlPointerDown}
          title={textActionTitle}
          type="button"
        >
          <span className="block">
            {sourceInstructionSetName ? (
              <span className="mb-1 inline-flex max-w-full items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                <BookText className="h-3 w-3 shrink-0" />
                <span className="truncate" title={sourceInstructionSetName}>
                  {sourceInstructionSetName}
                </span>
              </span>
            ) : null}
            <span className={sourceInstructionSetName ? "ml-3" : ""}>{text}</span>
          </span>
        </button>
      ) : (
        <div className={`min-w-0 break-words pt-1 text-left text-sm leading-relaxed text-zinc-900${compactSpacingClass}`}>
          {sourceInstructionSetName ? (
            <span className="mb-1 inline-flex max-w-full items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
              <BookText className="h-3 w-3 shrink-0" />
              <span className="truncate" title={sourceInstructionSetName}>
                {sourceInstructionSetName}
              </span>
            </span>
          ) : null}
          <span className={sourceInstructionSetName ? "ml-3" : ""}>{text}</span>
        </div>
      )}

      {allowActions ? (
        <Button
          aria-label={deleteAriaLabel}
          className="h-8 w-8 self-start rounded-full border-black/15 p-0 text-black/70 hover:bg-black/5 hover:text-black"
          disabled={deleteDisabled}
          draggable={false}
          onDragStart={onControlDragStart}
          onMouseDown={onControlMouseDown}
          onPointerDown={onControlPointerDown}
          onClick={onDelete}
          size="sm"
          title={deleteTitle}
          type="button"
          variant="outline"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Remove task</span>
        </Button>
      ) : null}
    </div>
  );
}
