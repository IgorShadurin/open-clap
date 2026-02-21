"use client";

import { toast } from "sonner";
import { requestJson } from "../app-dashboard/helpers";
import type { MainProjectsPageCoreState } from "./content-core-state";

interface ProjectIconActionsProps {
  state: MainProjectsPageCoreState;
  loadProjects: (options?: { silent?: boolean }) => Promise<void>;
}

export interface MainProjectsPageProjectIconActions {
  handleProjectIconUpload: (projectId: string, file: File) => Promise<void>;
  handleProjectIconDelete: (projectId: string) => Promise<void>;
}

export const useMainProjectsPageProjectIconActions = ({
  state,
  loadProjects,
}: ProjectIconActionsProps): MainProjectsPageProjectIconActions => {
  const handleProjectIconUpload = async (projectId: string, file: File) => {
    state.setProjectIconUploadProjectId(projectId);
    try {
      const formData = new FormData();
      formData.set("file", file);

      const response = await fetch(`/api/projects/${projectId}/icon`, {
        body: formData,
        method: "POST",
      });

      if (!response.ok) {
        let message = `Project icon upload failed with HTTP ${response.status}`;
        try {
          const payload = (await response.json()) as {
            details?: string;
            error?: { message?: string };
          };
          message = payload.error?.message?.trim() || payload.details?.trim() || message;
        } catch {
          // no-op
        }
        throw new Error(message);
      }

      await loadProjects({ silent: true });
      state.setProjectIconCacheBustByProjectId((current) => ({
        ...current,
        [projectId]: (current[projectId] ?? 0) + 1,
      }));
      state.setProjectIconLoadErrors((current) => {
        const next = { ...current };
        delete next[projectId];
        return next;
      });
      toast.success("Project icon uploaded");
    } catch (error) {
      state.setErrorMessage(error instanceof Error ? error.message : "Failed to upload project icon");
    } finally {
      state.setProjectIconUploadProjectId(null);
    }
  };

  const handleProjectIconDelete = async (projectId: string) => {
    state.setProjectIconDeleteProjectId(projectId);
    try {
      await requestJson(`/api/projects/${projectId}/icon`, { method: "DELETE" });
      await loadProjects({ silent: true });
      state.setProjectIconCacheBustByProjectId((current) => ({
        ...current,
        [projectId]: (current[projectId] ?? 0) + 1,
      }));
      state.setProjectIconLoadErrors((current) => {
        const next = { ...current };
        delete next[projectId];
        return next;
      });
      toast.success("Uploaded project icon deleted");
    } catch (error) {
      state.setErrorMessage(
        error instanceof Error ? error.message : "Failed to delete uploaded project icon",
      );
    } finally {
      state.setProjectIconDeleteProjectId(null);
    }
  };

  return {
    handleProjectIconUpload,
    handleProjectIconDelete,
  };
};
