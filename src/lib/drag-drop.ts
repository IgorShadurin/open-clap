import type { DragEventHandler, DragEvent } from "react";

export interface ReorderHandlers {
  onContainerDragEnd?: DragEventHandler<HTMLDivElement>;
  onContainerDragOver?: DragEventHandler<HTMLDivElement>;
  onContainerDragStart?: DragEventHandler<HTMLDivElement>;
  onContainerDrop?: DragEventHandler<HTMLDivElement>;
}

export interface ReorderContainerHandlerOptions {
  enabled: boolean;
  onDragEnd?: () => void;
  onDragStart: () => void;
  onDrop: () => void;
}

export interface BasicDragEvent {
  preventDefault(): void;
  stopPropagation(): void;
}

export interface DragPropagationEvent {
  stopPropagation(): void;
}

export function moveItemInList(
  currentOrder: readonly string[],
  sourceId: string,
  targetId: string,
): string[] | null {
  const fromIndex = currentOrder.findIndex((id) => id === sourceId);
  const toIndex = currentOrder.findIndex((id) => id === targetId);
  if (fromIndex < 0 || toIndex < 0) {
    return null;
  }

  const reordered = currentOrder.slice();
  const [removed] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, removed);

  return reordered;
}

export function createDraggableContainerHandlers({
  enabled,
  onDragEnd,
  onDragStart,
  onDrop,
}: ReorderContainerHandlerOptions): ReorderHandlers {
  if (!enabled) {
    return {};
  }

  return {
    onContainerDragStart: (event: DragEvent<HTMLDivElement>) => {
      event.stopPropagation();
      onDragStart();
    },
    onContainerDragOver: (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
    },
    onContainerDrop: (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      onDrop();
    },
    onContainerDragEnd: onDragEnd,
  };
}

export function preventControlDragStart(event: BasicDragEvent): void {
  event.preventDefault();
  event.stopPropagation();
}

export function stopDragPropagation(event: DragPropagationEvent): void {
  event.stopPropagation();
}
