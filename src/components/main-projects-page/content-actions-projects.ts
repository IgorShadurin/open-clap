"use client";

import { toast } from "sonner";
import { clearTaskFormPreferences } from "@/lib/task-form-preferences";
import { moveItemInList } from "../../lib/drag-drop";
import { requestJson } from "../app-dashboard/helpers";
import type { ProjectQuickAddPayload } from "../quick-add/project-quick-add";
import type { SubprojectQuickAddPayload } from "../quick-add/subproject-quick-add";
import type { MainProjectsPageCoreState } from "./content-core-state";
import type { SubprojectWithTasks } from "./content-helpers";
import { useMainProjectsPageProjectIconActions } from "./content-actions-projects-icon";

interface ProjectActionsProps {
  state: MainProjectsPageCoreState;
  loadProjects: (options?: { silent?: boolean }) => Promise<void>;
}

export interface MainProjectsPageProjectActions {
  handleQuickProjectCreate: (payload: ProjectQuickAddPayload) => Promise<void>;
  startProjectNameEdit: (project: { id: string; name: string }) => void;
  cancelProjectNameEdit: () => void;
  saveProjectNameEdit: () => Promise<void>;
  startSubprojectNameEdit: (subproject: SubprojectWithTasks) => void;
  cancelSubprojectNameEdit: () => void;
  saveSubprojectNameEdit: () => Promise<void>;
  handleProjectDrop: (targetProjectId: string) => Promise<void>;
  handleProjectPauseToggle: (project: { id: string; paused: boolean }) => Promise<void>;
  handleProjectCollapsedToggle: (project: {
    id: string;
    mainPageCollapsed: boolean;
    name: string;
  }) => Promise<void>;
  handleProjectIconUpload: (projectId: string, file: File) => Promise<void>;
  handleProjectIconDelete: (projectId: string) => Promise<void>;
  handleSubprojectPauseToggle: (subproject: { id: string; paused: boolean }) => Promise<void>;
  handleQuickSubprojectCreate: (
    project: { id: string; path: string },
    payload: SubprojectQuickAddPayload,
  ) => Promise<void>;
  handleProjectTasksListToggle: (project: { id: string; mainPageTasksVisible: boolean }) => Promise<void>;
  handleProjectSubprojectsListToggle: (project: {
    id: string;
    mainPageSubprojectsVisible: boolean;
  }) => Promise<void>;
  handleSubprojectDrop: (projectId: string, targetSubprojectId: string) => Promise<void>;
  handleConfirmProjectDelete: () => Promise<void>;
  handleConfirmProjectTasksDelete: () => Promise<void>;
}

export const useMainProjectsPageProjectActions = ({
  state,
  loadProjects,
}: ProjectActionsProps): MainProjectsPageProjectActions => {
  const iconActions = useMainProjectsPageProjectIconActions({ loadProjects, state });

  const handleQuickProjectCreate = async (payload: ProjectQuickAddPayload) => {
    try {
      await requestJson("/api/projects", {
        body: JSON.stringify({
          metadata: payload.metadata || undefined,
          name: payload.name,
          path: payload.path,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await loadProjects();
      toast.success("Project created");
    } catch (error) {
      state.setErrorMessage(error instanceof Error ? error.message : "Failed to create project");
    }
  };

  const startProjectNameEdit = (project: { id: string; name: string }) => {
    state.setEditingProjectId(project.id);
    state.setEditingProjectName(project.name);
  };

  const cancelProjectNameEdit = () => {
    state.setEditingProjectId(null);
    state.setEditingProjectName("");
  };

  const saveProjectNameEdit = async () => {
    if (!state.editingProjectId) {
      return;
    }

    const nextName = state.editingProjectName.trim();
    if (nextName.length < 1) {
      state.setErrorMessage("Project name is required");
      return;
    }

    state.setEditingProjectSubmitting(true);
    try {
      await requestJson(`/api/projects/${state.editingProjectId}`, {
        body: JSON.stringify({ name: nextName }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      cancelProjectNameEdit();
      await loadProjects();
      toast.success("Project renamed");
    } catch (error) {
      state.setErrorMessage(error instanceof Error ? error.message : "Failed to rename project");
    } finally {
      state.setEditingProjectSubmitting(false);
    }
  };

  const startSubprojectNameEdit = (subproject: SubprojectWithTasks) => {
    state.setEditingSubprojectId(subproject.id);
    state.setEditingSubprojectName(subproject.name);
  };

  const cancelSubprojectNameEdit = () => {
    state.setEditingSubprojectId(null);
    state.setEditingSubprojectName("");
  };

  const saveSubprojectNameEdit = async () => {
    if (!state.editingSubprojectId) {
      return;
    }

    const nextName = state.editingSubprojectName.trim();
    if (nextName.length < 1) {
      state.setErrorMessage("Subproject name is required");
      return;
    }

    state.setEditingSubprojectSubmitting(true);
    try {
      await requestJson(`/api/subprojects/${state.editingSubprojectId}`, {
        body: JSON.stringify({ name: nextName }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      cancelSubprojectNameEdit();
      await loadProjects();
      toast.success("Subproject renamed");
    } catch (error) {
      state.setErrorMessage(error instanceof Error ? error.message : "Failed to rename subproject");
    } finally {
      state.setEditingSubprojectSubmitting(false);
    }
  };

  const handleProjectDrop = async (targetProjectId: string) => {
    if (!state.draggingProjectId || state.draggingProjectId === targetProjectId) {
      return;
    }

    const currentOrder = state.projects.map((project) => project.id);
    const reordered = moveItemInList(currentOrder, state.draggingProjectId, targetProjectId);
    if (!reordered) {
      return;
    }

    try {
      await requestJson("/api/projects/reorder", {
        body: JSON.stringify({ orderedIds: reordered }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await loadProjects();
      toast.success("Project priority updated");
    } catch (error) {
      state.setErrorMessage(error instanceof Error ? error.message : "Failed to reorder projects");
    } finally {
      state.setDraggingProjectId(null);
    }
  };

  const handleProjectPauseToggle = async (project: { id: string; paused: boolean }) => {
    try {
      await requestJson(`/api/projects/${project.id}`, {
        body: JSON.stringify({ paused: !project.paused }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      await loadProjects();
    } catch (error) {
      state.setErrorMessage(
        error instanceof Error ? error.message : "Failed to update project status",
      );
    }
  };

  const handleProjectCollapsedToggle = async (project: { id: string; mainPageCollapsed: boolean }) => {
    const nextCollapsed = !project.mainPageCollapsed;

    try {
      await requestJson(`/api/projects/${project.id}`, {
        body: JSON.stringify({ mainPageCollapsed: nextCollapsed }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      await loadProjects();
      toast.success(nextCollapsed ? "Project collapsed" : "Project expanded");
    } catch (error) {
      state.setErrorMessage(
        error instanceof Error ? error.message : "Failed to update project settings",
      );
    }
  };

  const handleSubprojectPauseToggle = async (subproject: { id: string; paused: boolean }) => {
    try {
      await requestJson(`/api/subprojects/${subproject.id}`, {
        body: JSON.stringify({ paused: !subproject.paused }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      await loadProjects();
    } catch (error) {
      state.setErrorMessage(error instanceof Error ? error.message : "Failed to update subproject status");
    }
  };

  const handleQuickSubprojectCreate = async (
    project: { id: string; path: string },
    payload: SubprojectQuickAddPayload,
  ) => {
    try {
      await requestJson("/api/subprojects", {
        body: JSON.stringify({
          metadata: payload.metadata || undefined,
          name: payload.name,
          path: payload.path || project.path,
          projectId: project.id,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await loadProjects();
      toast.success("Subproject created");
    } catch (error) {
      state.setErrorMessage(error instanceof Error ? error.message : "Failed to create subproject");
    }
  };

  const handleProjectTasksListToggle = async (project: { id: string; mainPageTasksVisible: boolean }) => {
    const nextVisible = !project.mainPageTasksVisible;
    try {
      await requestJson(`/api/projects/${project.id}`, {
        body: JSON.stringify({ mainPageTasksVisible: nextVisible }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      await loadProjects();
    } catch (error) {
      state.setErrorMessage(error instanceof Error ? error.message : "Failed to update project settings");
    }
  };

  const handleProjectSubprojectsListToggle = async (
    project: { id: string; mainPageSubprojectsVisible: boolean },
  ) => {
    const nextVisible = !project.mainPageSubprojectsVisible;
    try {
      await requestJson(`/api/projects/${project.id}`, {
        body: JSON.stringify({ mainPageSubprojectsVisible: nextVisible }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      await loadProjects();
    } catch (error) {
      state.setErrorMessage(error instanceof Error ? error.message : "Failed to update project settings");
    }
  };

  const handleSubprojectDrop = async (projectId: string, targetSubprojectId: string) => {
    if (!state.draggingSubproject || state.draggingSubproject.subprojectId === targetSubprojectId) {
      return;
    }
    if (state.draggingSubproject.projectId !== projectId) {
      return;
    }

    const project = state.projects.find((item) => item.id === projectId);
    if (!project) {
      return;
    }

    const currentOrder = project.subprojects.map((subproject) => subproject.id);
    const reordered = moveItemInList(currentOrder, state.draggingSubproject.subprojectId, targetSubprojectId);
    if (!reordered) {
      return;
    }

    try {
      await requestJson("/api/subprojects/reorder", {
        body: JSON.stringify({ orderedIds: reordered, projectId }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await loadProjects();
      toast.success("Subproject priority updated");
    } catch (error) {
      state.setErrorMessage(
        error instanceof Error ? error.message : "Failed to reorder subprojects",
      );
    } finally {
      state.setDraggingSubproject(null);
    }
  };

  const handleConfirmProjectDelete = async () => {
    if (!state.deleteProjectTarget) {
      return;
    }

    const projectId = state.deleteProjectTarget.id;
    try {
      await requestJson(`/api/projects/${projectId}`, { method: "DELETE" });
      clearTaskFormPreferences(projectId);
      state.setDeleteProjectTarget(null);
      await loadProjects();
      toast.success("Project removed");
    } catch (error) {
      state.setErrorMessage(error instanceof Error ? error.message : "Failed to delete project");
    }
  };

  const handleConfirmProjectTasksDelete = async () => {
    if (!state.clearProjectTasksTarget) {
      return;
    }

    const { id, name, taskCount } = state.clearProjectTasksTarget;
    try {
      await requestJson(`/api/projects/${id}/tasks`, { method: "DELETE" });
      state.setClearProjectTasksTarget(null);
      await loadProjects();
      toast.success(taskCount > 0 ? `Cleared ${taskCount} tasks from ${name}` : "No tasks to clear");
    } catch (error) {
      state.setErrorMessage(error instanceof Error ? error.message : "Failed to clear project tasks");
    }
  };

  return {
    handleQuickProjectCreate,
    startProjectNameEdit,
    cancelProjectNameEdit,
    saveProjectNameEdit,
    startSubprojectNameEdit,
    cancelSubprojectNameEdit,
    saveSubprojectNameEdit,
    handleProjectDrop,
    handleProjectPauseToggle,
    handleProjectCollapsedToggle,
    ...iconActions,
    handleSubprojectPauseToggle,
    handleQuickSubprojectCreate,
    handleProjectTasksListToggle,
    handleProjectSubprojectsListToggle,
    handleSubprojectDrop,
    handleConfirmProjectDelete,
    handleConfirmProjectTasksDelete,
  };
};
