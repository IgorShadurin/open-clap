"use client";

import { ArrowUp, ChevronDown, EyeOff, ListTodo } from "lucide-react";
import { canEditTask } from "../app-dashboard/helpers";
import {
  createDraggableContainerHandlers,
  preventControlDragStart,
  stopDragPropagation,
} from "../../lib/drag-drop";
import { TaskInlineRow } from "../task-controls/task-inline-row";
import type { MainProjectsPageController } from "./content-controller";
import { getTaskComposerScopeKey, isFinishedTask, type ProjectTree } from "./content-helpers";

interface MainProjectsPageProjectTasksSectionProps {
  controller: MainProjectsPageController;
  project: ProjectTree;
  projectTasksVisible: boolean;
  visibleProjectTasks: ProjectTree["tasks"];
}

export const MainProjectsPageProjectTasksSection = ({
  controller,
  project,
  projectTasksVisible,
  visibleProjectTasks,
}: MainProjectsPageProjectTasksSectionProps) => {
  const {
    handleProjectTasksListToggle,
    handleQuickTaskCreate,
    handleProjectTaskPauseToggle,
    handleProjectTaskDrop,
    openTaskDetails,
    renderTaskComposer,
    setDeleteTaskTarget,
    setDraggingProjectTask,
    setStopTaskTarget,
    getTaskSourceLabel,
  } = controller;

  if (!projectTasksVisible) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
            <ListTodo className="h-3.5 w-3.5" />
            <span>Tasks</span>
          </div>
          <button
            aria-label="Show project tasks"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/15 text-sm text-zinc-700 hover:bg-zinc-100"
            onMouseDown={stopDragPropagation}
            onPointerDown={stopDragPropagation}
            onClick={() => void handleProjectTasksListToggle(project)}
            type="button"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-dashed border-amber-300 bg-amber-50/70 px-3 py-2 text-sm text-amber-800">
          <EyeOff className="h-4 w-4" />
          <span>Task list is hidden. Click the arrow button to show tasks.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
          <ListTodo className="h-3.5 w-3.5" />
          <span>Tasks</span>
        </div>
        <button
          aria-label="Hide project tasks"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/15 text-sm text-zinc-700 hover:bg-zinc-100"
          onMouseDown={stopDragPropagation}
          onPointerDown={stopDragPropagation}
          onClick={() => void handleProjectTasksListToggle(project)}
          type="button"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </div>
      {renderTaskComposer(
        project,
        getTaskComposerScopeKey(project.id),
        {
          placeholder: "Add task",
          submitAriaLabel: `Add task to ${project.name}`,
          submitTitle: `Add task to ${project.name}`,
        },
        (payload) => handleQuickTaskCreate(project, payload, null),
      )}
      {visibleProjectTasks.length < 1 ? (
        <div className="rounded-md border border-dashed border-black/15 px-3 py-2 text-sm text-zinc-500">
          No active tasks
        </div>
      ) : (
        visibleProjectTasks.map((task) => {
          const taskLocked = isFinishedTask(task) ? false : !canEditTask(task);
          const taskInProgress = task.status === "in_progress";

          return (
            <TaskInlineRow
              deleteAriaLabel={`Remove task ${task.text}`}
              deleteDisabled={taskLocked}
              deleteTitle={
                taskLocked
                  ? "Task is currently executing and cannot be changed"
                  : `Remove task ${task.text}`
              }
              disableText={taskLocked}
              draggable={!taskLocked}
              inProgress={taskInProgress}
              key={task.id}
              locked={taskLocked}
              sourceInstructionSetName={getTaskSourceLabel(task)}
              {...createDraggableContainerHandlers({
                enabled: !taskLocked,
                onDragEnd: () => setDraggingProjectTask(null),
                onDragStart: () => {
                  setDraggingProjectTask({ projectId: project.id, taskId: task.id });
                },
                onDrop: () => void handleProjectTaskDrop(project.id, task.id),
              })}
              onDelete={() =>
                setDeleteTaskTarget({
                  id: task.id,
                  text: task.text,
                })
              }
              onOpen={() => openTaskDetails(project, task)}
              onPauseToggle={() => void handleProjectTaskPauseToggle(task)}
              onStop={
                taskInProgress
                  ? () =>
                      setStopTaskTarget({
                        id: task.id,
                        text: task.text,
                      })
                  : undefined
              }
              onControlDragStart={preventControlDragStart}
              onControlMouseDown={stopDragPropagation}
              onControlPointerDown={stopDragPropagation}
              paused={task.paused}
              text={task.text}
              textActionTitle={
                taskLocked ? "Task is currently executing and cannot be edited" : "Edit task"
              }
            />
          );
        })
      )}
    </div>
  );
};
