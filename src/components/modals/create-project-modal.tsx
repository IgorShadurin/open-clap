"use client";

import { FolderSearch, Loader2, Plus, RefreshCcw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { PathSortMode, SettingRecord } from "../../../shared/contracts";
import { requestJson } from "../app-dashboard/helpers";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select } from "../ui/select";
import { Textarea } from "../ui/textarea";

interface PathDirectory {
  modifiedAt: string;
  name: string;
  path: string;
}

const PATH_MODIFIED_AT_FORMATTER = new Intl.DateTimeFormat(undefined, {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function formatModifiedAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "unknown";
  }
  return PATH_MODIFIED_AT_FORMATTER.format(parsed);
}

function formatProjectNameFromDirectory(directoryName: string): string {
  const normalized = directoryName
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return "";
  }

  const lowered = normalized.toLowerCase();
  return `${lowered.charAt(0).toUpperCase()}${lowered.slice(1)}`;
}

interface CreateProjectModalProps {
  onCreated: () => Promise<void> | void;
  onError: (message: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateProjectModal({
  onCreated,
  onError,
  open,
  onOpenChange,
}: CreateProjectModalProps) {
  const [projectName, setProjectName] = useState("");
  const [projectPath, setProjectPath] = useState("");
  const [projectMetadata, setProjectMetadata] = useState("");
  const [pathBase, setPathBase] = useState("");
  const [pathSort, setPathSort] = useState<PathSortMode>("modified");
  const [pathDirectories, setPathDirectories] = useState<PathDirectory[]>([]);
  const [loadingDirectories, setLoadingDirectories] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const resetForm = useCallback(() => {
    setProjectName("");
    setProjectPath("");
    setProjectMetadata("");
    setPathDirectories([]);
  }, []);

  const loadDirectories = useCallback(
    async (basePath: string, sort: PathSortMode) => {
      setLoadingDirectories(true);
      try {
        const result = await requestJson<{
          basePath: string;
          directories: PathDirectory[];
          sort: PathSortMode;
        }>("/api/paths/list", {
          body: JSON.stringify({ basePath, sort }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        setPathBase(result.basePath);
        setPathSort(result.sort);
        setPathDirectories(result.directories);
      } catch (error) {
        onError(error instanceof Error ? error.message : "Failed to load directories");
      } finally {
        setLoadingDirectories(false);
      }
    },
    [onError],
  );

  const loadDefaults = useCallback(async () => {
    try {
      const settings = await requestJson<SettingRecord[]>("/api/settings");
      const defaultBasePath =
        settings.find((setting) => setting.key === "default_project_base_path")
          ?.effectiveValue ?? ".";
      const defaultSort =
        settings.find((setting) => setting.key === "project_path_sort_mode")
          ?.effectiveValue ?? "modified";
      const normalizedSort = defaultSort === "name" ? "name" : "modified";

      setPathBase(defaultBasePath);
      setPathSort(normalizedSort);
      await loadDirectories(defaultBasePath, normalizedSort);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Failed to load settings");
    }
  }, [loadDirectories, onError]);

  useEffect(() => {
    if (!open) {
      return;
    }

    void loadDefaults();
  }, [loadDefaults, open]);

  const handleCreateProject = async () => {
    setSubmitting(true);
    try {
      await requestJson("/api/projects", {
        body: JSON.stringify({
          metadata: projectMetadata || undefined,
          name: projectName,
          path: projectPath,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      resetForm();
      onOpenChange(false);
      await onCreated();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Failed to create project");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Create Project
          </DialogTitle>
          <DialogDescription>
            Configure a project path and metadata. Server-side path validation is applied.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border border-black/10 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Input
                onChange={(event) => setPathBase(event.target.value)}
                placeholder="Base path for directory selection"
                value={pathBase}
              />
              <Select
                onChange={(event) => {
                  const nextSort = event.target.value as PathSortMode;
                  setPathSort(nextSort);
                  void loadDirectories(pathBase, nextSort);
                }}
                value={pathSort}
              >
                <option value="modified">Sort by modified</option>
                <option value="name">Sort by name</option>
              </Select>
              <Button
                disabled={loadingDirectories}
                onClick={() => void loadDirectories(pathBase, pathSort)}
                size="sm"
                type="button"
                variant="outline"
              >
                {loadingDirectories ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCcw className="h-4 w-4" />
                )}
                Load
              </Button>
            </div>

            <div className="max-h-36 space-y-1 overflow-auto rounded bg-white p-2 text-xs">
              {pathDirectories.map((directory) => (
                <button
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-zinc-100"
                  key={directory.path}
                  onClick={() => {
                    setProjectPath(directory.path);
                    setProjectName(formatProjectNameFromDirectory(directory.name));
                  }}
                  type="button"
                >
                  <FolderSearch className="h-3.5 w-3.5" />
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{directory.name}</span>
                    <span className="shrink-0 text-[11px] text-zinc-500">
                      {formatModifiedAt(directory.modifiedAt)}
                    </span>
                  </div>
                </button>
              ))}
              {pathDirectories.length < 1 ? (
                <div className="px-2 py-1 text-zinc-500">No directories loaded.</div>
              ) : null}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="project-name">Project name</Label>
            <Input
              id="project-name"
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="Project name"
              value={projectName}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="project-path">Project path</Label>
            <Input
              id="project-path"
              onChange={(event) => setProjectPath(event.target.value)}
              placeholder="Project path"
              value={projectPath}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="project-metadata">Project metadata (optional JSON)</Label>
            <Textarea
              id="project-metadata"
              onChange={(event) => setProjectMetadata(event.target.value)}
              placeholder='{"team":"automation"}'
              value={projectMetadata}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            <X className="h-4 w-4" />
            Cancel
          </Button>
          <Button
            disabled={submitting}
            onClick={() => void handleCreateProject()}
            type="button"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
