"use client";

import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, FolderGit2, GripVertical, Pause, Play, Pencil, Save, X } from "lucide-react";
import { canEditTask } from "../app-dashboard/helpers";
import { isFinishedTask, type ProjectTree } from "./content-helpers";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { TaskInlineRow } from "../task-controls/task-inline-row";
import { SubprojectQuickAdd } from "../quick-add/subproject-quick-add";
import { preventControlDragStart, stopDragPropagation } from "../../lib/drag-drop";
import { type MainProjectsPageController } from "./content-controller";

interface Props {
  controller: MainProjectsPageController;
  project: ProjectTree;
  projectSubprojectsVisible: boolean;
}

export const MainProjectsPageSubprojectsSection = ({ controller, project, projectSubprojectsVisible }: Props) => {
  const {
    shouldBlockContainerDragStart,
    handleProjectSubprojectsListToggle,
    handleQuickSubprojectCreate,
    setEditingSubprojectName,
    editingSubprojectId,
    editingSubprojectName,
    editingSubprojectSubmitting,
    cancelSubprojectNameEdit,
    saveSubprojectNameEdit,
    startSubprojectNameEdit,
    getSubprojectTasksKey,
    setDraggingSubproject,
    handleSubprojectPauseToggle,
    setDeleteSubprojectTarget,
    toggleSubprojectTasks,
    renderTaskComposer,
    setDeleteTaskTarget,
    openTaskDetails,
    setStopTaskTarget,
    handleProjectTaskPauseToggle,
    getTaskSourceLabel,
  } = controller;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
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
          {projectSubprojectsVisible ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
          <span className="sr-only">
            {projectSubprojectsVisible ? "Hide subprojects" : "Show subprojects"}
          </span>
        </Button>
      </div>
      {projectSubprojectsVisible ? (
        <>
          <SubprojectQuickAdd
            defaultPath={project.path}
            onSubmit={(payload) => handleQuickSubprojectCreate(project, payload)}
            stopPropagation
            submitAriaLabel={`Create subproject in ${project.name}`}
            submitTitle={`Create subproject in ${project.name}`}
          />
          {project.subprojects.length < 1 ? (
            <div className="rounded-md border border-dashed border-black/15 px-3 py-2 text-sm text-zinc-500">
              No subprojects
            </div>
          ) : (
            project.subprojects.map((subproject) => {
              const activeSubprojectTasks = subproject.tasks.filter((task) => !isFinishedTask(task));
              const subprojectTasksExpanded =
                getSubprojectTasksKey(project.id, subproject.id) in controller.expandedSubprojectTasks
                  ? (controller.expandedSubprojectTasks[getSubprojectTasksKey(project.id, subproject.id)] ?? false)
                  : false;
              const subprojectEditingName = editingSubprojectId === subproject.id;

              return (
                <div
                  className="rounded-md border border-zinc-300/80 bg-zinc-50/70"
                  draggable={!subprojectEditingName}
                  key={subproject.id}
                  onDragEnd={() => setDraggingSubproject(null)}
                  onDragOver={(event: { preventDefault: () => void; stopPropagation: () => void }) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onDragStart={(event: {
                    stopPropagation: () => void;
                    preventDefault: () => void;
                    target: EventTarget | null;
                    currentTarget: EventTarget | null;
                    nativeEvent: Event;
                  }) => {
                    if (subprojectEditingName || shouldBlockContainerDragStart(event)) {
                      event.preventDefault();
                      return;
                    }
                    event.stopPropagation();
                    setDraggingSubproject({
                      projectId: project.id,
                      subprojectId: subproject.id,
                    });
                  }}
                  onDrop={(event: { preventDefault: () => void; stopPropagation: () => void }) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void controller.handleSubprojectDrop(project.id, subproject.id);
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-md bg-zinc-100/70 px-3 py-2">
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
                      {subprojectEditingName ? (
                        <div
                          className="flex items-center gap-1"
                          onMouseDown={stopDragPropagation}
                          onPointerDown={stopDragPropagation}
                        >
                          <Input
                            autoFocus
                            className="h-8 w-[220px]"
                            draggable={false}
                            onChange={(event) => setEditingSubprojectName(event.target.value)}
                            onDragStart={preventControlDragStart}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void saveSubprojectNameEdit();
                                return;
                              }
                              if (event.key === "Escape") {
                                event.preventDefault();
                                cancelSubprojectNameEdit();
                              }
                            }}
                            onMouseDown={stopDragPropagation}
                            onPointerDown={stopDragPropagation}
                            value={editingSubprojectName}
                          />
                          <Button
                            aria-label="Save subproject name"
                            className="h-8 w-8 p-0"
                            disabled={editingSubprojectSubmitting}
                            draggable={false}
                            onDragStart={preventControlDragStart}
                            onMouseDown={stopDragPropagation}
                            onPointerDown={stopDragPropagation}
                            onClick={() => void saveSubprojectNameEdit()}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            <Save className="h-4 w-4" />
                          </Button>
                          <Button
                            aria-label="Cancel subproject rename"
                            className="h-8 w-8 p-0"
                            disabled={editingSubprojectSubmitting}
                            draggable={false}
                            onDragStart={preventControlDragStart}
                            onMouseDown={stopDragPropagation}
                            onPointerDown={stopDragPropagation}
                            onClick={cancelSubprojectNameEdit}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="group/subproject-name flex items-center gap-1">
                          <button
                            className="font-medium text-left underline-offset-4 hover:underline"
                            draggable={false}
                            onMouseDown={stopDragPropagation}
                            onPointerDown={stopDragPropagation}
                            onClick={() => toggleSubprojectTasks(project.id, subproject.id)}
                            type="button"
                          >
                            {subproject.name}
                          </button>
                          <Button
                            aria-label={`Rename subproject ${subproject.name}`}
                            className="h-7 w-7 p-0 opacity-0 transition-opacity group-hover/subproject-name:opacity-100"
                            draggable={false}
                            onDragStart={preventControlDragStart}
                            onMouseDown={stopDragPropagation}
                            onPointerDown={stopDragPropagation}
                            onClick={() => startSubprojectNameEdit(subproject)}
                            size="sm"
                            title={`Rename subproject ${subproject.name}`}
                            type="button"
                            variant="ghost"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        aria-label={
                          subprojectTasksExpanded
                            ? `Hide tasks for ${subproject.name}`
                            : `Show tasks for ${subproject.name}`
                        }
                        className="h-8 w-8 rounded-full p-0"
                        draggable={false}
                        onDragStart={preventControlDragStart}
                        onMouseDown={stopDragPropagation}
                        onPointerDown={stopDragPropagation}
                        onClick={() => toggleSubprojectTasks(project.id, subproject.id)}
                        size="sm"
                        title={
                          subprojectTasksExpanded
                            ? `Hide tasks for ${subproject.name}`
                            : `Show tasks for ${subproject.name}`
                        }
                        type="button"
                        variant="outline"
                      >
                        {subprojectTasksExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                        <span className="sr-only">
                          {subprojectTasksExpanded
                            ? `Hide tasks for ${subproject.name}`
                            : `Show tasks for ${subproject.name}`}
                        </span>
                      </Button>
                      <Button
                        aria-label={`Delete subproject ${subproject.name}`}
                        className="h-8 w-8 rounded-full border-black/15 p-0 text-black/70 hover:bg-black/5 hover:text-black"
                        draggable={false}
                        onDragStart={preventControlDragStart}
                        onMouseDown={stopDragPropagation}
                        onPointerDown={stopDragPropagation}
                        onClick={() =>
                          setDeleteSubprojectTarget({ id: subproject.id, name: subproject.name })
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
                  </div>

                  {subprojectTasksExpanded ? (
                    <div className="space-y-2 border-t border-black/10 p-2">
                      {renderTaskComposer(
                        project,
                        `${project.id}:subproject:${subproject.id}`,
                        {
                          placeholder: `Add task to ${subproject.name}`,
                          submitAriaLabel: `Add task to ${subproject.name}`,
                          submitTitle: `Add task to ${subproject.name}`,
                        },
                        (payload, selectedInstructionSetId) =>
                          controller.handleQuickTaskCreate(project, payload, subproject.id, selectedInstructionSetId),
                      )}

                      {activeSubprojectTasks.length < 1 ? (
                        <div className="rounded-md border border-dashed border-black/15 px-3 py-2 text-sm text-zinc-500">
                          No active tasks in this subproject
                        </div>
                      ) : (
                        activeSubprojectTasks.map((task) => {
                          const taskLocked = !canEditTask(task);
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
                              inProgress={task.status === "in_progress"}
                              key={task.id}
                              locked={taskLocked}
                              sourceInstructionSetName={getTaskSourceLabel(task)}
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
                                taskLocked
                                  ? "Task is currently executing and cannot be edited"
                                  : "Edit task"
                              }
                            />
                          );
                        })
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </>
      ) : null}
    </div>
  );
};
