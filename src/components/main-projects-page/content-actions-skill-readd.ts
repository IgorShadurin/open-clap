"use client";

import { toast } from "sonner";

import { requestJson } from "../app-dashboard/helpers";
import type { MainProjectsPageCoreState } from "./content-core-state";

interface SkillSetReAddActionOptions {
  loadProjects: (options?: { silent?: boolean }) => Promise<void>;
  state: MainProjectsPageCoreState;
}

export function createHandleConfirmSkillSetReAdd({
  loadProjects,
  state,
}: SkillSetReAddActionOptions): () => Promise<void> {
  return async () => {
    if (!state.skillSetReAddTarget) {
      return;
    }

    state.setSkillSetReAddSubmitting(true);
    try {
      await requestJson(`/api/projects/${state.skillSetReAddTarget.projectId}/skills/readd`, {
        body: JSON.stringify({
          instructionSetId: state.skillSetReAddTarget.instructionSetId,
          subprojectId: state.skillSetReAddTarget.subprojectId,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      state.setSkillSetReAddTarget(null);
      state.setErrorMessage(null);
      await loadProjects();
      toast.success("Skill set tasks re-added");
    } catch (error) {
      state.setErrorMessage(error instanceof Error ? error.message : "Failed to re-add skill set tasks");
    } finally {
      state.setSkillSetReAddSubmitting(false);
    }
  };
}
