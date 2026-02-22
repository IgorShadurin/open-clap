"use client";

import { useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { CodexUsageModelDisplay, ProjectTree } from "./content-helpers";
import type { SkillSetTreeItem } from "../../../shared/contracts";
import { usePreventUnhandledFileDrop } from "../task-controls/use-prevent-unhandled-file-drop";

export type Setter<T> = Dispatch<SetStateAction<T>>;

export interface MainProjectsPageCoreState {
  projects: ProjectTree[];
  setProjects: Setter<ProjectTree[]>;
  loading: boolean;
  setLoading: Setter<boolean>;
  instructionSets: SkillSetTreeItem[];
  setInstructionSets: Setter<SkillSetTreeItem[]>;
  hasLoadedOnce: boolean;
  setHasLoadedOnce: Setter<boolean>;
  errorMessage: string | null;
  setErrorMessage: Setter<string | null>;
  selectedInstructionSetByComposer: Record<string, string>;
  setSelectedInstructionSetByComposer: Setter<Record<string, string>>;
  quickAddClearSignalByScope: Record<string, number>;
  setQuickAddClearSignalByScope: Setter<Record<string, number>>;
  draggingProjectId: string | null;
  setDraggingProjectId: Setter<string | null>;
  draggingSubproject: { projectId: string; subprojectId: string } | null;
  setDraggingSubproject: Setter<{ projectId: string; subprojectId: string } | null>;
  draggingProjectTask: { projectId: string; taskId: string } | null;
  setDraggingProjectTask: Setter<{ projectId: string; taskId: string } | null>;
  deleteTaskTarget: { id: string; text: string } | null;
  setDeleteTaskTarget: Setter<{ id: string; text: string } | null>;
  stopTaskTarget: { id: string; text: string } | null;
  setStopTaskTarget: Setter<{ id: string; text: string } | null>;
  deleteProjectTarget: { id: string; name: string } | null;
  setDeleteProjectTarget: Setter<{ id: string; name: string } | null>;
  openProjectMenuId: string | null;
  setOpenProjectMenuId: Setter<string | null>;
  clearProjectTasksTarget: { id: string; name: string; taskCount: number } | null;
  setClearProjectTasksTarget: Setter<{ id: string; name: string; taskCount: number } | null>;
  openProjectIconMenuId: string | null;
  setOpenProjectIconMenuId: Setter<string | null>;
  projectIconPickerProjectId: string | null;
  setProjectIconPickerProjectId: Setter<string | null>;
  projectIconUploadProjectId: string | null;
  setProjectIconUploadProjectId: Setter<string | null>;
  projectIconDeleteProjectId: string | null;
  setProjectIconDeleteProjectId: Setter<string | null>;
  deleteSubprojectTarget: { id: string; name: string } | null;
  setDeleteSubprojectTarget: Setter<{ id: string; name: string } | null>;
  editingProjectId: string | null;
  setEditingProjectId: Setter<string | null>;
  editingProjectName: string;
  setEditingProjectName: Setter<string>;
  editingProjectSubmitting: boolean;
  setEditingProjectSubmitting: Setter<boolean>;
  editingSubprojectId: string | null;
  setEditingSubprojectId: Setter<string | null>;
  editingSubprojectName: string;
  setEditingSubprojectName: Setter<string>;
  editingSubprojectSubmitting: boolean;
  setEditingSubprojectSubmitting: Setter<boolean>;
  expandedSubprojectTasks: Record<string, boolean>;
  setExpandedSubprojectTasks: Setter<Record<string, boolean>>;
  taskDetailsTarget: { projectName: string; task: ProjectTree["tasks"][number] } | null;
  setTaskDetailsTarget: Setter<
    { projectName: string; task: ProjectTree["tasks"][number] } | null
  >;
  taskDetailsText: string;
  setTaskDetailsText: Setter<string>;
  taskDetailsModel: string;
  setTaskDetailsModel: Setter<string>;
  taskDetailsReasoning: string;
  setTaskDetailsReasoning: Setter<string>;
  taskDetailsIncludeContext: boolean;
  setTaskDetailsIncludeContext: Setter<boolean>;
  taskDetailsContextCount: number;
  setTaskDetailsContextCount: Setter<number>;
  taskDetailsSubmitting: boolean;
  setTaskDetailsSubmitting: Setter<boolean>;
  codexConnected: boolean;
  setCodexConnected: Setter<boolean>;
  codexUsageLoaded: boolean;
  setCodexUsageLoaded: Setter<boolean>;
  codexWeeklyLimitUsedPercent: number;
  setCodexWeeklyLimitUsedPercent: Setter<number>;
  codexFiveHourLimitUsedPercent: number;
  setCodexFiveHourLimitUsedPercent: Setter<number>;
  codexConnectionError: string | null;
  setCodexConnectionError: Setter<string | null>;
  codexResolvedAuthFilePath: string;
  setCodexResolvedAuthFilePath: Setter<string>;
  codexFiveHourResetAt: string | null;
  setCodexFiveHourResetAt: Setter<string | null>;
  codexWeeklyResetAt: string | null;
  setCodexWeeklyResetAt: Setter<string | null>;
  codexUsageModelSummaries: CodexUsageModelDisplay[];
  setCodexUsageModelSummaries: Setter<CodexUsageModelDisplay[]>;
  codexUsageEndpoint: string | null;
  setCodexUsageEndpoint: Setter<string | null>;
  codexUsageCheckedAt: string | null;
  setCodexUsageCheckedAt: Setter<string | null>;
  codexInfoOpenModel: string | null;
  setCodexInfoOpenModel: Setter<string | null>;
  projectIconLoadErrors: Record<string, boolean>;
  setProjectIconLoadErrors: Setter<Record<string, boolean>>;
  projectIconCacheBustByProjectId: Record<string, number>;
  setProjectIconCacheBustByProjectId: Setter<Record<string, number>>;
  projectIconInputRef: React.RefObject<HTMLInputElement | null>;
}

export const useMainProjectsPageCoreState = (): MainProjectsPageCoreState => {
  usePreventUnhandledFileDrop();

  const [projects, setProjects] = useState<ProjectTree[]>([]);
  const [loading, setLoading] = useState(true);
  const [instructionSets, setInstructionSets] = useState<SkillSetTreeItem[]>([]);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedInstructionSetByComposer, setSelectedInstructionSetByComposer] = useState<
    Record<string, string>
  >({});
  const [quickAddClearSignalByScope, setQuickAddClearSignalByScope] = useState<Record<string, number>>(
    {},
  );
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null);
  const [draggingSubproject, setDraggingSubproject] = useState<
    | {
        projectId: string;
        subprojectId: string;
      }
    | null
  >(null);
  const [draggingProjectTask, setDraggingProjectTask] = useState<
    | {
        projectId: string;
        taskId: string;
      }
    | null
  >(null);
  const [deleteTaskTarget, setDeleteTaskTarget] = useState<{ id: string; text: string } | null>(
    null,
  );
  const [stopTaskTarget, setStopTaskTarget] = useState<{ id: string; text: string } | null>(
    null,
  );
  const [deleteProjectTarget, setDeleteProjectTarget] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [openProjectMenuId, setOpenProjectMenuId] = useState<string | null>(null);
  const [clearProjectTasksTarget, setClearProjectTasksTarget] = useState<
    { id: string; name: string; taskCount: number } | null
  >(null);
  const [openProjectIconMenuId, setOpenProjectIconMenuId] = useState<string | null>(null);
  const [projectIconPickerProjectId, setProjectIconPickerProjectId] = useState<string | null>(
    null,
  );
  const [projectIconUploadProjectId, setProjectIconUploadProjectId] = useState<string | null>(
    null,
  );
  const [projectIconDeleteProjectId, setProjectIconDeleteProjectId] = useState<string | null>(
    null,
  );
  const [deleteSubprojectTarget, setDeleteSubprojectTarget] = useState<
    | { id: string; name: string }
    | null
  >(null);

  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState("");
  const [editingProjectSubmitting, setEditingProjectSubmitting] = useState(false);
  const [editingSubprojectId, setEditingSubprojectId] = useState<string | null>(null);
  const [editingSubprojectName, setEditingSubprojectName] = useState("");
  const [editingSubprojectSubmitting, setEditingSubprojectSubmitting] = useState(false);
  const [expandedSubprojectTasks, setExpandedSubprojectTasks] = useState<Record<string, boolean>>(
    {},
  );

  const [taskDetailsTarget, setTaskDetailsTarget] = useState<
    | {
        projectName: string;
        task: ProjectTree["tasks"][number];
      }
    | null
  >(null);
  const [taskDetailsText, setTaskDetailsText] = useState("");
  const [taskDetailsModel, setTaskDetailsModel] = useState("");
  const [taskDetailsReasoning, setTaskDetailsReasoning] = useState("");
  const [taskDetailsIncludeContext, setTaskDetailsIncludeContext] = useState(false);
  const [taskDetailsContextCount, setTaskDetailsContextCount] = useState(0);
  const [taskDetailsSubmitting, setTaskDetailsSubmitting] = useState(false);

  const [codexConnected, setCodexConnected] = useState(false);
  const [codexUsageLoaded, setCodexUsageLoaded] = useState(false);
  const [codexWeeklyLimitUsedPercent, setCodexWeeklyLimitUsedPercent] = useState(0);
  const [codexFiveHourLimitUsedPercent, setCodexFiveHourLimitUsedPercent] = useState(0);
  const [codexConnectionError, setCodexConnectionError] = useState<string | null>(null);
  const [codexResolvedAuthFilePath, setCodexResolvedAuthFilePath] = useState("~/.codex/auth.json");
  const [codexFiveHourResetAt, setCodexFiveHourResetAt] = useState<string | null>(null);
  const [codexWeeklyResetAt, setCodexWeeklyResetAt] = useState<string | null>(null);
  const [codexUsageModelSummaries, setCodexUsageModelSummaries] = useState<
    CodexUsageModelDisplay[]
  >([]);
  const [codexUsageEndpoint, setCodexUsageEndpoint] = useState<string | null>(null);
  const [codexUsageCheckedAt, setCodexUsageCheckedAt] = useState<string | null>(null);
  const [codexInfoOpenModel, setCodexInfoOpenModel] = useState<string | null>(null);

  const [projectIconLoadErrors, setProjectIconLoadErrors] = useState<Record<string, boolean>>({});
  const [projectIconCacheBustByProjectId, setProjectIconCacheBustByProjectId] = useState<
    Record<string, number>
  >({});

  const projectIconInputRef = useRef<HTMLInputElement | null>(null);

  return {
    projects,
    setProjects,
    loading,
    setLoading,
    instructionSets,
    setInstructionSets,
    hasLoadedOnce,
    setHasLoadedOnce,
    errorMessage,
    setErrorMessage,
    selectedInstructionSetByComposer,
    setSelectedInstructionSetByComposer,
    quickAddClearSignalByScope,
    setQuickAddClearSignalByScope,
    draggingProjectId,
    setDraggingProjectId,
    draggingSubproject,
    setDraggingSubproject,
    draggingProjectTask,
    setDraggingProjectTask,
    deleteTaskTarget,
    setDeleteTaskTarget,
    stopTaskTarget,
    setStopTaskTarget,
    deleteProjectTarget,
    setDeleteProjectTarget,
    openProjectMenuId,
    setOpenProjectMenuId,
    clearProjectTasksTarget,
    setClearProjectTasksTarget,
    openProjectIconMenuId,
    setOpenProjectIconMenuId,
    projectIconPickerProjectId,
    setProjectIconPickerProjectId,
    projectIconUploadProjectId,
    setProjectIconUploadProjectId,
    projectIconDeleteProjectId,
    setProjectIconDeleteProjectId,
    deleteSubprojectTarget,
    setDeleteSubprojectTarget,
    editingProjectId,
    setEditingProjectId,
    editingProjectName,
    setEditingProjectName,
    editingProjectSubmitting,
    setEditingProjectSubmitting,
    editingSubprojectId,
    setEditingSubprojectId,
    editingSubprojectName,
    setEditingSubprojectName,
    editingSubprojectSubmitting,
    setEditingSubprojectSubmitting,
    expandedSubprojectTasks,
    setExpandedSubprojectTasks,
    taskDetailsTarget,
    setTaskDetailsTarget,
    taskDetailsText,
    setTaskDetailsText,
    taskDetailsModel,
    setTaskDetailsModel,
    taskDetailsReasoning,
    setTaskDetailsReasoning,
    taskDetailsIncludeContext,
    setTaskDetailsIncludeContext,
    taskDetailsContextCount,
    setTaskDetailsContextCount,
    taskDetailsSubmitting,
    setTaskDetailsSubmitting,
    codexConnected,
    setCodexConnected,
    codexUsageLoaded,
    setCodexUsageLoaded,
    codexWeeklyLimitUsedPercent,
    setCodexWeeklyLimitUsedPercent,
    codexFiveHourLimitUsedPercent,
    setCodexFiveHourLimitUsedPercent,
    codexConnectionError,
    setCodexConnectionError,
    codexResolvedAuthFilePath,
    setCodexResolvedAuthFilePath,
    codexFiveHourResetAt,
    setCodexFiveHourResetAt,
    codexWeeklyResetAt,
    setCodexWeeklyResetAt,
    codexUsageModelSummaries,
    setCodexUsageModelSummaries,
    codexUsageEndpoint,
    setCodexUsageEndpoint,
    codexUsageCheckedAt,
    setCodexUsageCheckedAt,
    codexInfoOpenModel,
    setCodexInfoOpenModel,
    projectIconLoadErrors,
    setProjectIconLoadErrors,
    projectIconCacheBustByProjectId,
    setProjectIconCacheBustByProjectId,
    projectIconInputRef,
  };
};

export const useMainProjectsPageSortedInstructionSets = (state: {
  instructionSets: SkillSetTreeItem[];
}) =>
  useMemo(
    () =>
      [...state.instructionSets].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    [state.instructionSets],
  );
