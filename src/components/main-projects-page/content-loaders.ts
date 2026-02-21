"use client";

import { useCallback, useEffect, useMemo } from "react";

import type { CodexUsageApiResponse, SkillSetTreeItem } from "../../../shared/contracts";
import { requestJson } from "../app-dashboard/helpers";
import { useRealtimeSync } from "../task-controls/use-realtime-sync";
import {
  DEFAULT_CODEX_AUTH_FILE,
  CODEX_USAGE_POLL_INTERVAL_MS,
  resolveCodexModelDisplayLabel,
} from "./content-helpers";
import type { MainProjectsPageCoreState } from "./content-core-state";
import type { ProjectTree } from "./content-helpers";

export interface MainProjectsPageLoaders {
  sortedInstructionSets: SkillSetTreeItem[];
  loadProjects: (options?: { silent?: boolean }) => Promise<void>;
  loadInstructionSets: () => Promise<void>;
  loadCodexUsage: () => Promise<void>;
}

export const useMainProjectsPageLoaders = (state: MainProjectsPageCoreState): MainProjectsPageLoaders => {
  const {
    instructionSets,
    projects,
    openProjectMenuId,
    openProjectIconMenuId,
    setLoading,
    setProjects,
    setHasLoadedOnce,
    setErrorMessage,
    setInstructionSets,
    setCodexResolvedAuthFilePath,
    setCodexConnected,
    setCodexConnectionError,
    setCodexUsageModelSummaries,
    setCodexWeeklyLimitUsedPercent,
    setCodexFiveHourLimitUsedPercent,
    setCodexFiveHourResetAt,
    setCodexWeeklyResetAt,
    setCodexUsageEndpoint,
    setCodexUsageCheckedAt,
    setCodexUsageLoaded,
    setOpenProjectMenuId,
    setOpenProjectIconMenuId,
    setTaskDetailsTarget,
    codexInfoOpenModel,
    setCodexInfoOpenModel,
  } = state;

  const sortedInstructionSets = useMemo(
    () =>
      [...instructionSets].sort((left, right) =>
        left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
      ),
    [instructionSets],
  );

  const loadProjects = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }

    try {
      const tree = await requestJson<ProjectTree[]>("/api/projects/tree", {
        cache: "no-store",
      });
      setProjects(tree);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load projects");
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
      setHasLoadedOnce(true);
    }
  }, [setErrorMessage, setHasLoadedOnce, setLoading, setProjects]);

  const loadInstructionSets = useCallback(async () => {
    try {
      const result = await requestJson<SkillSetTreeItem[]>("/api/skills", {
        cache: "no-store",
      });
      setInstructionSets(result);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load skill sets");
    }
  }, [setErrorMessage, setInstructionSets]);

  const loadCodexUsage = useCallback(async () => {
    try {
      const usageResponse = await requestJson<CodexUsageApiResponse>("/api/codex/usage", {
        body: JSON.stringify({}),
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      const result = usageResponse.results[0];
      if (!result) {
        throw new Error("Usage API returned an empty result");
      }

      setCodexResolvedAuthFilePath(result.authFile || DEFAULT_CODEX_AUTH_FILE);

      if (!result.ok || !result.usage) {
        const rawError = (result.error || "Unknown usage API error").trim();
        const compactError = rawError.replace(/\s+/g, " ").slice(0, 220);

        setCodexConnected(false);
        setCodexConnectionError(compactError);
        setCodexUsageModelSummaries([]);
        setCodexWeeklyLimitUsedPercent(0);
        setCodexFiveHourLimitUsedPercent(0);
        setCodexFiveHourResetAt(null);
        setCodexWeeklyResetAt(null);
        setCodexUsageEndpoint(result.endpoint ?? null);
        setCodexUsageCheckedAt(new Date().toISOString());
        return;
      }

      setCodexConnected(true);
      setCodexConnectionError(null);
      setCodexUsageModelSummaries(
        (result.usage.models ?? [])
          .map((model) => ({
            ...model,
            displayLabel: resolveCodexModelDisplayLabel(model.model, model.modelLabel),
          }))
          .sort((first, second) =>
            resolveCodexModelDisplayLabel(first.model).localeCompare(
              resolveCodexModelDisplayLabel(second.model),
            ),
          ),
      );
      setCodexWeeklyLimitUsedPercent(result.usage.weeklyUsedPercent ?? 0);
      setCodexFiveHourLimitUsedPercent(result.usage.fiveHourUsedPercent);
      setCodexFiveHourResetAt(result.usage.fiveHourResetAt || null);
      setCodexWeeklyResetAt(result.usage.weeklyResetAt || null);
      setCodexUsageEndpoint(result.endpoint ?? null);
      setCodexUsageCheckedAt(new Date().toISOString());
    } catch (error) {
      const message = (error instanceof Error ? error.message : "Failed to check Codex usage")
        .replace(/\s+/g, " ")
        .slice(0, 220);
      setCodexConnected(false);
      setCodexConnectionError(message);
      setCodexUsageModelSummaries([]);
      setCodexWeeklyLimitUsedPercent(0);
      setCodexFiveHourLimitUsedPercent(0);
      setCodexFiveHourResetAt(null);
      setCodexWeeklyResetAt(null);
      setCodexUsageEndpoint(null);
      setCodexUsageCheckedAt(new Date().toISOString());
    } finally {
      setCodexUsageLoaded(true);
    }
  }, [
    setCodexConnected,
    setCodexConnectionError,
    setCodexFiveHourLimitUsedPercent,
    setCodexFiveHourResetAt,
    setCodexResolvedAuthFilePath,
    setCodexUsageCheckedAt,
    setCodexUsageEndpoint,
    setCodexUsageLoaded,
    setCodexUsageModelSummaries,
    setCodexWeeklyLimitUsedPercent,
    setCodexWeeklyResetAt,
  ]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    void loadInstructionSets();
  }, [loadInstructionSets]);

  useEffect(() => {
    void loadCodexUsage();

    const intervalId = window.setInterval(() => {
      void loadCodexUsage();
    }, CODEX_USAGE_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadCodexUsage]);

  useRealtimeSync(() => {
    void loadProjects({ silent: true });
    void loadInstructionSets();
  });

  useEffect(() => {
    setTaskDetailsTarget((current) => {
      if (!current) {
        return current;
      }

      const latestTask = findTaskInProjects(projects, current.task.id);
      if (!latestTask) {
        return null;
      }

      if (latestTask === current.task) {
        return current;
      }

      return {
        ...current,
        task: latestTask,
      };
    });
  }, [projects, setTaskDetailsTarget]);

  useEffect(() => {
    if (!openProjectMenuId && !openProjectIconMenuId) {
      return;
    }
    if (openProjectMenuId && !projects.some((project) => project.id === openProjectMenuId)) {
      setOpenProjectMenuId(null);
      return;
    }
    if (
      openProjectIconMenuId &&
      !projects.some((project) => project.id === openProjectIconMenuId)
    ) {
      setOpenProjectIconMenuId(null);
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) {
        return;
      }

      if (event.target.closest("[data-project-actions-menu]")) {
        return;
      }

      if (event.target.closest("[data-project-icon-menu]")) {
        return;
      }

      setOpenProjectMenuId(null);
      setOpenProjectIconMenuId(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenProjectMenuId(null);
        setOpenProjectIconMenuId(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [
    openProjectIconMenuId,
    openProjectMenuId,
    projects,
    setOpenProjectIconMenuId,
    setOpenProjectMenuId,
  ]);

  useEffect(() => {
    if (!codexInfoOpenModel) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) {
        return;
      }

      if (
        event.target instanceof Element &&
        event.target.closest("[data-codex-usage-info-card]")
      ) {
        return;
      }

      setCodexInfoOpenModel(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCodexInfoOpenModel(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [codexInfoOpenModel, setCodexInfoOpenModel]);

  return {
    sortedInstructionSets,
    loadProjects,
    loadInstructionSets,
    loadCodexUsage,
  };
};

function findTaskInProjects(projects: ProjectTree[], taskId: string) {
  for (const project of projects) {
    const projectTask = project.tasks.find((task) => task.id === taskId);
    if (projectTask) {
      return projectTask;
    }

    for (const subproject of project.subprojects) {
      const subprojectTask = subproject.tasks.find((task) => task.id === taskId);
      if (subprojectTask) {
        return subprojectTask;
      }
    }
  }

  return null;
}
