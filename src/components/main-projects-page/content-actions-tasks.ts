"use client";

import { toast } from "sonner";

import {
  DEFAULT_TASK_MODEL,
  DEFAULT_TASK_REASONING,
} from "@/lib/task-reasoning";
import { canEditTask, requestJson } from "../app-dashboard/helpers";
import {
  buildMetadataForResolvedSkillTask,
  parseSkillTaskMetadata,
  resolveSkillSetTasks,
} from "@/lib/skill-set-links";
import {
  findTaskInProjects,
  isFinishedTask,
} from "./content-helpers";
import type { MainProjectsPageCoreState } from "./content-core-state";
import type { ProjectTree } from "./content-helpers";
import { moveItemInList } from "../../lib/drag-drop";
import type { TaskQuickAddPayload } from "../task-quick-add";

interface TaskActionsProps {
  state: MainProjectsPageCoreState;
  loadProjects: (options?: { silent?: boolean }) => Promise<void>;
}

export interface MainProjectsPageTaskActions {
  getTaskSourceLabel: (task: ProjectTree["tasks"][number]) => string | undefined;
  getTaskSourceLabelFromMetadata: (metadata: string | null | undefined) => string | undefined;
  handleProjectTaskPauseToggle: (task: ProjectTree["tasks"][number]) => Promise<void>;
  handleProjectTaskRemove: (task: ProjectTree["tasks"][number]) => Promise<void>;
  openTaskDetails: (project: ProjectTree, task: ProjectTree["tasks"][number]) => void;
  handleTaskDetailsSave: () => Promise<void>;
  handleQuickTaskCreate: (
    project: ProjectTree,
    payload: TaskQuickAddPayload,
    subprojectId: string | null,
    sourceInstructionSetId?: string,
  ) => Promise<void>;
  handleConfirmSubprojectDelete: () => Promise<void>;
  handleConfirmTaskDelete: () => Promise<void>;
  handleConfirmTaskStop: () => Promise<void>;
  handleProjectTaskDrop: (projectId: string, targetTaskId: string) => Promise<void>;
  getSubprojectTasksKey: (projectId: string, subprojectId: string) => string;
  toggleSubprojectTasks: (projectId: string, subprojectId: string) => void;
  isTaskInProgress: (task: ProjectTree["tasks"][number]) => boolean;
}

export const useMainProjectsPageTaskActions = ({
  state,
  loadProjects,
}: TaskActionsProps): MainProjectsPageTaskActions => {
  const getTaskSourceLabel = (task: ProjectTree["tasks"][number]): string | undefined => {
    const sourceMetadata = parseSkillTaskMetadata(task.metadata);
    return sourceMetadata?.instructionSetName;
  };

  const getTaskSourceLabelFromMetadata = (
    metadata: string | null | undefined,
  ): string | undefined => {
    const sourceMetadata = parseSkillTaskMetadata(metadata);
    return sourceMetadata?.instructionSetName;
  };

  const handleProjectTaskPauseToggle = async (task: ProjectTree["tasks"][number]) => {
    if (!canEditTask(task)) {
      state.setErrorMessage("Running tasks cannot be edited");
      return;
    }

    try {
      await requestJson(`/api/tasks/${task.id}/action`, {
        body: JSON.stringify({ action: task.paused ? "resume" : "pause" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await loadProjects();
    } catch (error) {
      state.setErrorMessage(error instanceof Error ? error.message : "Failed to update task status");
    }
  };

  const handleProjectTaskRemove = async (task: ProjectTree["tasks"][number]) => {
    if (!canEditTask(task)) {
      state.setErrorMessage("Running tasks cannot be edited");
      return;
    }

    try {
      await requestJson(`/api/tasks/${task.id}/action`, {
        body: JSON.stringify({ action: "remove" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await loadProjects();
      toast.success("Task removed");
    } catch (error) {
      state.setErrorMessage(error instanceof Error ? error.message : "Failed to remove task");
    }
  };

  const openTaskDetails = (project: ProjectTree, task: ProjectTree["tasks"][number]) => {
    if (!canEditTask(task)) {
      state.setErrorMessage("Running tasks cannot be edited");
      return;
    }

    state.setTaskDetailsTarget({
      projectName: project.name,
      task,
    });
    state.setTaskDetailsText(task.text);
    state.setTaskDetailsModel(task.model);
    state.setTaskDetailsReasoning(task.reasoning);
    state.setTaskDetailsIncludeContext(task.includePreviousContext);
    state.setTaskDetailsContextCount(task.previousContextMessages);
  };

  const handleTaskDetailsSave = async () => {
    if (!state.taskDetailsTarget) {
      return;
    }

    if (!canEditTask(state.taskDetailsTarget.task)) {
      state.setErrorMessage("Running tasks cannot be edited");
      return;
    }

    state.setTaskDetailsSubmitting(true);
    try {
      await requestJson(`/api/tasks/${state.taskDetailsTarget.task.id}`, {
        body: JSON.stringify({
          includePreviousContext: state.taskDetailsIncludeContext,
          model: state.taskDetailsModel.trim() || DEFAULT_TASK_MODEL,
          previousContextMessages: state.taskDetailsIncludeContext
            ? state.taskDetailsContextCount
            : 0,
          reasoning: state.taskDetailsReasoning.trim() || DEFAULT_TASK_REASONING,
          text: state.taskDetailsText.trim(),
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      await loadProjects();
      state.setTaskDetailsTarget(null);
      toast.success("Task updated");
    } catch (error) {
      state.setErrorMessage(error instanceof Error ? error.message : "Failed to update task");
    } finally {
      state.setTaskDetailsSubmitting(false);
    }
  };

  const isInstructionSetAddedToProject = (project: ProjectTree, instructionSetId: string): boolean => {
    const normalizedInstructionSetId = instructionSetId.trim();
    if (!normalizedInstructionSetId) {
      return false;
    }

    const allTasks = project.tasks.concat(
      project.subprojects.flatMap((subproject) => subproject.tasks),
    );
    return allTasks.some((task) => {
      const metadata = parseSkillTaskMetadata(task.metadata);
      return metadata?.instructionSetId === normalizedInstructionSetId;
    });
  };

  const handleQuickTaskCreate = async (
    project: ProjectTree,
    payload: TaskQuickAddPayload,
    subprojectId: string | null = null,
    sourceInstructionSetId = "",
  ) => {
    const trimmedSourceInstructionSetId = sourceInstructionSetId.trim();
    const selectedInstructionSet = state.instructionSets.find(
      (instructionSet) => instructionSet.id === trimmedSourceInstructionSetId,
    );

    if (trimmedSourceInstructionSetId.length > 0) {
      const resolvedTasks = resolveSkillSetTasks(state.instructionSets, trimmedSourceInstructionSetId);
      if (resolvedTasks.length < 1) {
        state.setErrorMessage("Selected skill set has no tasks to add.");
        return;
      }

      if (isInstructionSetAddedToProject(project, trimmedSourceInstructionSetId)) {
        state.setErrorMessage("Skill set already added to this project");
        return;
      }

      try {
        let isFirstResolvedTask = true;
        for (const resolvedTask of resolvedTasks) {
          const sourceInstructionSetName =
            selectedInstructionSet?.name?.trim() || resolvedTask.sourceInstructionSetName;
          const payloadMetadata = buildMetadataForResolvedSkillTask({
            composerInstructionSetId: trimmedSourceInstructionSetId,
            composerInstructionSetName: sourceInstructionSetName,
            resolvedTask,
          });
          await requestJson("/api/tasks", {
            body: JSON.stringify({
              includePreviousContext: resolvedTask.includePreviousContext,
              model: resolvedTask.model,
              metadata: payloadMetadata,
              skipInstructionSetDuplicateCheck: !isFirstResolvedTask,
              previousContextMessages: resolvedTask.includePreviousContext
                ? resolvedTask.previousContextMessages
                : 0,
              projectId: project.id,
              reasoning: resolvedTask.reasoning,
              subprojectId,
              text: resolvedTask.text,
            }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          });
          isFirstResolvedTask = false;
        }

        await loadProjects();
        toast.success("Skill set tasks added");
      } catch (error) {
        state.setErrorMessage(error instanceof Error ? error.message : "Failed to add skill set tasks");
      }

      return;
    }

    try {
      await requestJson("/api/tasks", {
        body: JSON.stringify({
          includePreviousContext: payload.includeContext,
          model: payload.model.trim() || DEFAULT_TASK_MODEL,
          previousContextMessages: payload.includeContext ? payload.contextCount : 0,
          projectId: project.id,
          reasoning: payload.reasoning.trim() || DEFAULT_TASK_REASONING,
          subprojectId,
          text: payload.text.trim(),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await loadProjects();
      toast.success("Task created");
    } catch (error) {
      state.setErrorMessage(error instanceof Error ? error.message : "Failed to create task");
    }
  };

  const handleConfirmSubprojectDelete = async () => {
    if (!state.deleteSubprojectTarget) {
      return;
    }

    try {
      await requestJson(`/api/subprojects/${state.deleteSubprojectTarget.id}`, { method: "DELETE" });
      state.setDeleteSubprojectTarget(null);
      await loadProjects();
      toast.success("Subproject removed");
    } catch (error) {
      state.setErrorMessage(error instanceof Error ? error.message : "Failed to delete subproject");
    }
  };

  const handleConfirmTaskDelete = async () => {
    if (!state.deleteTaskTarget) {
      return;
    }

    const latestTask = findTaskInProjects(state.projects, state.deleteTaskTarget.id);
    if (!latestTask) {
      state.setDeleteTaskTarget(null);
      return;
    }

    await handleProjectTaskRemove(latestTask);
    state.setDeleteTaskTarget(null);
  };

  const handleConfirmTaskStop = async () => {
    if (!state.stopTaskTarget) {
      return;
    }

    const latestTask = findTaskInProjects(state.projects, state.stopTaskTarget.id);
    if (!latestTask) {
      state.setStopTaskTarget(null);
      return;
    }

    if (latestTask.status !== "in_progress") {
      state.setStopTaskTarget(null);
      toast.info("Task is no longer running");
      return;
    }

    try {
      await requestJson(`/api/tasks/${latestTask.id}/action`, {
        body: JSON.stringify({ action: "stop" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      state.setStopTaskTarget(null);
      await loadProjects();
      toast.success("Stop requested");
    } catch (error) {
      state.setErrorMessage(error instanceof Error ? error.message : "Failed to stop task");
    }
  };

  const handleProjectTaskDrop = async (projectId: string, targetTaskId: string) => {
    if (!state.draggingProjectTask || state.draggingProjectTask.taskId === targetTaskId) {
      return;
    }
    if (state.draggingProjectTask.projectId !== projectId) {
      return;
    }

    const project = state.projects.find((item) => item.id === projectId);
    if (!project) {
      return;
    }

    const currentOrder = project.tasks
      .filter((task) => !isFinishedTask(task))
      .map((task) => task.id);
    const reordered = moveItemInList(currentOrder, state.draggingProjectTask.taskId, targetTaskId);
    if (!reordered) {
      return;
    }

    try {
      await requestJson("/api/tasks/reorder", {
        body: JSON.stringify({ orderedIds: reordered }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await loadProjects();
    } catch (error) {
      state.setErrorMessage(error instanceof Error ? error.message : "Failed to reorder tasks");
    } finally {
      state.setDraggingProjectTask(null);
    }
  };

  const getSubprojectTasksKey = (projectId: string, subprojectId: string): string =>
    `${projectId}:${subprojectId}`;

  const toggleSubprojectTasks = (projectId: string, subprojectId: string) => {
    const key = getSubprojectTasksKey(projectId, subprojectId);
    state.setExpandedSubprojectTasks((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  return {
    getTaskSourceLabel,
    getTaskSourceLabelFromMetadata,
    handleProjectTaskPauseToggle,
    handleProjectTaskRemove,
    openTaskDetails,
    handleTaskDetailsSave,
    handleQuickTaskCreate,
    handleConfirmSubprojectDelete,
    handleConfirmTaskDelete,
    handleConfirmTaskStop,
    handleProjectTaskDrop,
    getSubprojectTasksKey,
    toggleSubprojectTasks,
    isTaskInProgress: (task) => task.status === "in_progress",
  };
};
