"use client";

import { useMemo } from "react";
import { canEditTask } from "../app-dashboard/helpers";
import {
  formatLimitReset,
  findTaskInProjects,
  CODex_INFO_OPEN_CARD_MODEL,
} from "./content-helpers";
import { useMainProjectsPageCoreState } from "./content-core-state";
import { useMainProjectsPageLoaders } from "./content-loaders";
import { useMainProjectsPageProjectActions } from "./content-actions-projects";
import { useMainProjectsPageTaskActions } from "./content-actions-tasks";
import { useMainProjectsPageInteractions } from "./content-interactions";

export const useMainProjectsPageController = () => {
  const state = useMainProjectsPageCoreState();
  const loaders = useMainProjectsPageLoaders(state);
  const projectActions = useMainProjectsPageProjectActions({
    state,
    loadProjects: (options?: { silent?: boolean }) => loaders.loadProjects(options),
  });
  const taskActions = useMainProjectsPageTaskActions({
    state,
    loadProjects: (options?: { silent?: boolean }) => loaders.loadProjects(options),
  });
  const interactions = useMainProjectsPageInteractions({
    state,
    sortedInstructionSets: loaders.sortedInstructionSets,
  });

  const codexConnectionInfo = useMemo(
    () =>
      [
        `Auth file: ${state.codexResolvedAuthFilePath}`,
        `Endpoint: ${state.codexUsageEndpoint ?? "n/a"}`,
        `Checked: ${
          state.codexUsageCheckedAt ? new Date(state.codexUsageCheckedAt).toLocaleString() : "n/a"
        }`,
      ].join("\n"),
    [state.codexResolvedAuthFilePath, state.codexUsageEndpoint, state.codexUsageCheckedAt],
  );
  const codexConnectionStateLabel = state.codexUsageLoaded
    ? state.codexConnected
      ? "Connected"
      : "Disconnected"
    : "Checking";
  const codexConnectionStateTitle = state.codexUsageLoaded
    ? state.codexConnected
      ? "Codex status: Connected"
      : state.codexConnectionError
        ? `Codex status: Disconnected: ${state.codexConnectionError}`
        : "Codex status: Disconnected"
    : "Codex status: Checking";
  const codexConnectionDotClass = state.codexUsageLoaded
    ? state.codexConnected
      ? "bg-emerald-500"
      : "bg-red-500"
    : "bg-zinc-400";

  const deleteTaskTargetCurrent = state.deleteTaskTarget
    ? findTaskInProjects(state.projects, state.deleteTaskTarget.id)
    : null;
  const deleteTaskTargetLocked = deleteTaskTargetCurrent ? !canEditTask(deleteTaskTargetCurrent) : false;
  const stopTaskTargetCurrent = state.stopTaskTarget
    ? findTaskInProjects(state.projects, state.stopTaskTarget.id)
    : null;
  const stopTaskTargetRunning = stopTaskTargetCurrent?.status === "in_progress";
  const fiveHourResetLabel = formatLimitReset(state.codexFiveHourResetAt);
  const weeklyResetLabel = formatLimitReset(state.codexWeeklyResetAt);

  return {
    ...state,
    ...loaders,
    ...projectActions,
    ...taskActions,
    ...interactions,
    codexConnectionInfo,
    codexConnectionStateLabel,
    codexConnectionStateTitle,
    codexConnectionDotClass,
    deleteTaskTargetCurrent,
    deleteTaskTargetLocked,
    stopTaskTargetCurrent,
    stopTaskTargetRunning,
    fiveHourResetLabel,
    weeklyResetLabel,
    codexInfoOpenCardModel: CODex_INFO_OPEN_CARD_MODEL,
    showPerModelLimits: state.codexUsageModelSummaries.length > 1,
    canEditTask,
  };
};

export type MainProjectsPageController = ReturnType<typeof useMainProjectsPageController>;
