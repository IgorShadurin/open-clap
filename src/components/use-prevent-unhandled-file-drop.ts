"use client";

import { useEffect } from "react";

import { hasImagePathDataTransfer } from "@/lib/file-drop";

const HANDLED_FILE_DROP_SELECTOR = "[data-task-file-drop='true']";

function isHandledDropTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  return target.closest(HANDLED_FILE_DROP_SELECTOR) !== null;
}

export function usePreventUnhandledFileDrop(): void {
  useEffect(() => {
    const handleDragOver = (event: DragEvent) => {
      if (!hasImagePathDataTransfer(event.dataTransfer) || isHandledDropTarget(event.target)) {
        return;
      }

      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "none";
      }
    };

    const handleDrop = (event: DragEvent) => {
      if (!hasImagePathDataTransfer(event.dataTransfer) || isHandledDropTarget(event.target)) {
        return;
      }

      event.preventDefault();
    };

    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, []);
}
