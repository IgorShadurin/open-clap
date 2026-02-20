"use client";

import { FolderSearch, FolderPlus, Loader2, RefreshCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import type { PathSortMode, SettingRecord } from "../../shared/contracts";
import { requestJson } from "./app-dashboard-helpers";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select } from "./ui/select";
import { Textarea } from "./ui/textarea";

interface PathDirectory {
  modifiedAt: string;
  name: string;
  path: string;
}

export interface ProjectQuickAddPayload {
  metadata: string;
  name: string;
  path: string;
}

interface ProjectQuickAddProps {
  onError: (message: string) => void;
  onSubmit: (payload: ProjectQuickAddPayload) => Promise<void> | void;
  placeholder?: string;
  submitAriaLabel: string;
  submitTitle: string;
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

export function ProjectQuickAdd({
  onError,
  onSubmit,
  placeholder = "Create project",
  submitAriaLabel,
  submitTitle,
}: ProjectQuickAddProps) {
  const [projectName, setProjectName] = useState("");
  const [projectPath, setProjectPath] = useState("");
  const [projectMetadata, setProjectMetadata] = useState("");
  const [pathBase, setPathBase] = useState("");
  const [pathSort, setPathSort] = useState<PathSortMode>("modified");
  const [pathDirectories, setPathDirectories] = useState<PathDirectory[]>([]);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [defaultsLoaded, setDefaultsLoaded] = useState(false);
  const [loadingDirectories, setLoadingDirectories] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

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
      setDefaultsLoaded(true);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Failed to load settings");
    }
  }, [loadDirectories, onError]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      if (formRef.current?.contains(target)) {
        return;
      }

      setDetailsExpanded(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  const expandDetails = () => {
    setDetailsExpanded(true);
    if (!defaultsLoaded) {
      void loadDefaults();
    }
  };

  const reset = () => {
    setProjectName("");
    setProjectPath("");
    setProjectMetadata("");
    setDetailsExpanded(false);
  };

  const handleSubmit = async () => {
    if (projectName.trim().length < 1 || projectPath.trim().length < 1 || submitting) {
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        metadata: projectMetadata.trim(),
        name: projectName.trim(),
        path: projectPath.trim(),
      });
      reset();
    } finally {
      setSubmitting(false);
    }
  };

  const handleNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Tab" || event.shiftKey) {
      return;
    }

    if (event.currentTarget.value.trim().length < 1) {
      return;
    }

    event.preventDefault();
    void handleSubmit();
  };

  return (
    <form
      className="relative rounded-md border border-black/10 bg-white px-3 py-2"
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <div className="flex items-center gap-2">
        <Input
          className="h-9 text-sm"
          onChange={(event) => setProjectName(event.target.value)}
          onFocus={expandDetails}
          onKeyDown={handleNameKeyDown}
          placeholder={placeholder}
          value={projectName}
        />
        <Button
          aria-label={submitAriaLabel}
          className="h-9 w-9 shrink-0 p-0"
          disabled={
            submitting || projectName.trim().length < 1 || projectPath.trim().length < 1
          }
          title={submitTitle}
          type="submit"
          variant="outline"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FolderPlus className="h-4 w-4" />
          )}
        </Button>
      </div>

      {detailsExpanded ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-2 space-y-2 rounded-md border border-black/15 bg-white p-2 shadow-lg">
          <div className="flex items-center gap-2">
            <Input
              className="h-9 text-sm"
              onChange={(event) => setPathBase(event.target.value)}
              onFocus={expandDetails}
              placeholder="Base path for directory selection"
              value={pathBase}
            />
            <Select
              className="h-9 text-sm"
              onChange={(event) => {
                const nextSort = event.target.value as PathSortMode;
                setPathSort(nextSort);
                void loadDirectories(pathBase, nextSort);
              }}
              onFocus={expandDetails}
              value={pathSort}
            >
              <option value="modified">Sort by modified</option>
              <option value="name">Sort by name</option>
            </Select>
            <Button
              className="h-9 px-3"
              disabled={loadingDirectories}
              onClick={() => void loadDirectories(pathBase, pathSort)}
              type="button"
              variant="outline"
            >
              {loadingDirectories ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4" />
              )}
            </Button>
          </div>

          <div className="max-h-36 space-y-1 overflow-auto rounded border border-black/10 bg-white p-2 text-xs">
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

          <Input
            className="h-9 text-sm"
            onChange={(event) => setProjectPath(event.target.value)}
            onFocus={expandDetails}
            placeholder="Project path"
            value={projectPath}
          />
          <Textarea
            className="min-h-[84px] text-sm"
            onChange={(event) => setProjectMetadata(event.target.value)}
            onFocus={expandDetails}
            placeholder='Project metadata (optional JSON), e.g. {"team":"automation"}'
            value={projectMetadata}
          />
        </div>
      ) : null}
    </form>
  );
}
