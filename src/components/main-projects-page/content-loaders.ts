"use client";

import { useCallback, useEffect } from "react";

import type { CodexUsageApiResponse, SkillSetTreeItem } from "../../../shared/contracts";
import { requestJson } from "../app-dashboard/helpers";
import { useRealtimeSync } from "../task-controls/use-realtime-sync";
import {
  DEFAULT_CODEX_AUTH_FILE,
  CODEX_USAGE_POLL_INTERVAL_MS,
  resolveCodexModelDisplayLabel,
} from "./content-helpers";
import type { MainProjectsPageCoreState } from "./content-core-state";
import { useMemo } from "react";
import type { ProjectTree } from "./content-helpers";

export interface MainProjectsPageLoaders {
  sortedInstructionSets: SkillSetTreeItem[];
  loadProjects: (options?: { silent?: boolean }) => Promise<void>;
  loadInstructionSets: () => Promise<void>;
  loadCodexUsage: () => Promise<void>;
}

export const useMainProjectsPageLoaders = (state: MainProjectsPageCoreState): MainProjectsPageLoaders => {
  const sortedInstructionSets = useMemo(
    () =>
      [...state.instructionSets].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    [state.instructionSets],
  );

  const loadProjects = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      state.setLoading(true);
    }

    try {
      const tree = await requestJson<ProjectTree[]>("/api/projects/tree", {
        cache: "no-store",
      });
      state.setProjects(tree);
    } catch (error) {
      state.setErrorMessage(error instanceof Error ? error.message : "Failed to load projects");
    } finally {
      if (!options?.silent) {
        state.setLoading(false);
      }
      state.setHasLoadedOnce(true);
    }
  }, [state]);

  const loadInstructionSets = useCallback(async () => {
    try {
      const result = await requestJson<SkillSetTreeItem[]>("/api/skills", {
        cache: "no-store",
      });
      state.setInstructionSets(result);
    } catch (error) {
      state.setErrorMessage(error instanceof Error ? error.message : "Failed to load skill sets");
    }
  }, [state]);

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

      state.setCodexResolvedAuthFilePath(result.authFile || DEFAULT_CODEX_AUTH_FILE);

      if (!result.ok || !result.usage) {
        const rawError = (result.error || "Unknown usage API error").trim();
        const compactError = rawError.replace(/\s+/g, " ").slice(0, 220);
        state.setCodexConnected(false);
        state.setCodexConnectionError(compactError);
        state.setCodexUsageModelSummaries([]);
        state.setCodexWeeklyLimitUsedPercent(0);
        state.setCodexFiveHourLimitUsedPercent(0);
        state.setCodexFiveHourResetAt(null);
        state.setCodexWeeklyResetAt(null);
        state.setCodexUsageEndpoint(result.endpoint ?? null);
        state.setCodexUsageCheckedAt(new Date().toISOString());
        return;
      }

      state.setCodexConnected(true);
      state.setCodexConnectionError(null);
      state.setCodexUsageModelSummaries(
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
      state.setCodexWeeklyLimitUsedPercent(result.usage.weeklyUsedPercent ?? 0);
      state.setCodexFiveHourLimitUsedPercent(result.usage.fiveHourUsedPercent);
      state.setCodexFiveHourResetAt(result.usage.fiveHourResetAt || null);
      state.setCodexWeeklyResetAt(result.usage.weeklyResetAt || null);
      state.setCodexUsageEndpoint(result.endpoint ?? null);
      state.setCodexUsageCheckedAt(new Date().toISOString());
    } catch (error) {
      const message = (error instanceof Error ? error.message : "Failed to check Codex usage")
        .replace(/\s+/g, " ")
        .slice(0, 220);
      state.setCodexConnected(false);
      state.setCodexConnectionError(message);
      state.setCodexUsageModelSummaries([]);
      state.setCodexWeeklyLimitUsedPercent(0);
      state.setCodexFiveHourLimitUsedPercent(0);
      state.setCodexFiveHourResetAt(null);
      state.setCodexWeeklyResetAt(null);
      state.setCodexUsageEndpoint(null);
      state.setCodexUsageCheckedAt(new Date().toISOString());
    } finally {
      state.setCodexUsageLoaded(true);
    }
  }, [state]);

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
    state.setTaskDetailsTarget((current) => {
      if (!current) {
        return current;
      }

      const latestTask = findTaskInProjects(state.projects, current.task.id);
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
  }, [state, state.projects]);

  useEffect(() => {
    if (!state.openProjectMenuId && !state.openProjectIconMenuId) {
      return;
    }
    if (
      state.openProjectMenuId &&
      !state.projects.some((project) => project.id === state.openProjectMenuId)
    ) {
      state.setOpenProjectMenuId(null);
      return;
    }
    if (
      state.openProjectIconMenuId &&
      !state.projects.some((project) => project.id === state.openProjectIconMenuId)
    ) {
      state.setOpenProjectIconMenuId(null);
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

      state.setOpenProjectMenuId(null);
      state.setOpenProjectIconMenuId(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        state.setOpenProjectMenuId(null);
        state.setOpenProjectIconMenuId(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [
    state.openProjectIconMenuId,
    state.openProjectMenuId,
    state.projects,
    state,
  ]);

  useEffect(() => {
    if (!state.codexInfoOpenModel) {
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

      state.setCodexInfoOpenModel(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        state.setCodexInfoOpenModel(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [state.codexInfoOpenModel, state]);

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
