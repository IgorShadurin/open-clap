"use client";

import { FolderPlus, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import type { SkillSetTreeItem } from "../../../shared/contracts";
import type { ValidatePathResponse } from "../../../shared/contracts/path";
import { requestJson } from "../app-dashboard/helpers";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import {
  PATH_VALIDATION_DEBOUNCE_MS,
  PROJECT_QUICK_ADD_SKILL_STORAGE_KEY,
  formatProjectNameFromPath,
  type PathValidationState,
} from "./project-quick-add-helpers";

export interface ProjectQuickAddPayload {
  name: string;
  path: string;
  skillSetId?: string;
}

interface ProjectQuickAddProps {
  onError: (message: string) => void;
  onSubmit: (payload: ProjectQuickAddPayload) => Promise<void> | void;
  skillSets: SkillSetTreeItem[];
  placeholder?: string;
  submitAriaLabel: string;
  submitTitle: string;
}

export function ProjectQuickAdd({
  onError,
  onSubmit,
  skillSets,
  placeholder = "Project path",
  submitAriaLabel,
  submitTitle,
}: ProjectQuickAddProps) {
  const [projectPath, setProjectPath] = useState("");
  const [projectName, setProjectName] = useState("");
  const [nameWasEditedManually, setNameWasEditedManually] = useState(false);
  const [selectedSkillSetId, setSelectedSkillSetId] = useState("");
  const [hasLoadedStoredSkillId, setHasLoadedStoredSkillId] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [pathValidation, setPathValidation] = useState<PathValidationState>({
    message: "",
    normalizedPath: "",
    status: "idle",
    validatedFrom: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const validationRequestIdRef = useRef(0);
  const formRef = useRef<HTMLFormElement | null>(null);

  const validatePath = useCallback(async (rawPath: string) => {
    const trimmedPath = rawPath.trim();
    if (!trimmedPath) {
      setPathValidation({
        message: "",
        normalizedPath: "",
        status: "idle",
        validatedFrom: "",
      });
      return null;
    }

    const requestId = validationRequestIdRef.current + 1;
    validationRequestIdRef.current = requestId;
    setPathValidation({
      message: "Checking path…",
      normalizedPath: "",
      status: "validating",
      validatedFrom: trimmedPath,
    });

    try {
      const result = await requestJson<ValidatePathResponse>("/api/paths/validate", {
        body: JSON.stringify({ path: trimmedPath }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (requestId !== validationRequestIdRef.current) {
        return null;
      }

      if (!result.exists || !result.isDirectory) {
        setPathValidation({
          message: "Path does not exist or is not a directory",
          normalizedPath: result.normalizedPath,
          status: "invalid",
          validatedFrom: trimmedPath,
        });
        return null;
      }

      setPathValidation({
        message: "Path is valid",
        normalizedPath: result.normalizedPath,
        status: "valid",
        validatedFrom: trimmedPath,
      });
      return result;
    } catch (error) {
      if (requestId !== validationRequestIdRef.current) {
        return null;
      }

      setPathValidation({
        message: error instanceof Error ? error.message : "Failed to validate path",
        normalizedPath: "",
        status: "invalid",
        validatedFrom: trimmedPath,
      });
      return null;
    }
  }, []);

  const effectiveName = useMemo(() => {
    const manualName = projectName.trim();
    if (manualName.length > 0) {
      return manualName;
    }

    if (pathValidation.status === "valid") {
      return formatProjectNameFromPath(pathValidation.normalizedPath);
    }

    return formatProjectNameFromPath(projectPath);
  }, [pathValidation, projectName, projectPath]);

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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const storedSkillId = window.localStorage.getItem(PROJECT_QUICK_ADD_SKILL_STORAGE_KEY);
      setSelectedSkillSetId(storedSkillId?.trim() ?? "");
    } catch {
      setSelectedSkillSetId("");
    } finally {
      setHasLoadedStoredSkillId(true);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedStoredSkillId) {
      return;
    }

    if (selectedSkillSetId.length < 1) {
      return;
    }

    const isKnownSkill = skillSets.some((skillSet) => skillSet.id === selectedSkillSetId);
    if (!isKnownSkill) {
      setSelectedSkillSetId("");
      try {
        window.localStorage.setItem(PROJECT_QUICK_ADD_SKILL_STORAGE_KEY, "");
      } catch {
        // Ignore storage write failures (e.g., disabled storage).
      }
    }
  }, [hasLoadedStoredSkillId, selectedSkillSetId, skillSets]);

  useEffect(() => {
    const trimmedPath = projectPath.trim();
    if (!trimmedPath) {
      setPathValidation({
        message: "",
        normalizedPath: "",
        status: "idle",
        validatedFrom: "",
      });
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void validatePath(trimmedPath).then((result) => {
        if (!result || nameWasEditedManually) {
          return;
        }

        const generatedName = formatProjectNameFromPath(result.normalizedPath);
        if (generatedName.length < 1) {
          return;
        }

        setProjectName(generatedName);
      });
    }, PATH_VALIDATION_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [nameWasEditedManually, projectPath, validatePath]);

  const reset = () => {
    setProjectName("");
    setProjectPath("");
    setNameWasEditedManually(false);
    setDetailsExpanded(false);
    setPathValidation({
      message: "",
      normalizedPath: "",
      status: "idle",
      validatedFrom: "",
    });
  };

  const handleSubmit = async () => {
    if (submitting) {
      return;
    }

    const trimmedPath = projectPath.trim();
    if (!trimmedPath) {
      onError("Project path is required");
      return;
    }

    let normalizedPath = "";
    if (pathValidation.status === "valid" && pathValidation.validatedFrom === trimmedPath) {
      normalizedPath = pathValidation.normalizedPath;
    } else {
      const validation = await validatePath(trimmedPath);
      if (!validation || !validation.exists || !validation.isDirectory) {
        onError("Project path does not exist or is not a directory");
        return;
      }
      normalizedPath = validation.normalizedPath;
    }

    const normalizedName = effectiveName.trim();
    if (normalizedName.length < 1) {
      onError("Project name is required");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        name: normalizedName,
        path: normalizedPath,
        skillSetId: selectedSkillSetId.trim() || undefined,
      });
      reset();
    } finally {
      setSubmitting(false);
    }
  };

  const handlePathOrNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    void handleSubmit();
  };

  const validationClassName =
    pathValidation.status === "valid"
      ? "text-emerald-700"
      : pathValidation.status === "invalid"
        ? "text-red-600"
        : "text-zinc-500";

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
          onChange={(event) => {
            setProjectPath(event.target.value);
            setDetailsExpanded(true);
          }}
          onFocus={() => setDetailsExpanded(true)}
          onKeyDown={handlePathOrNameKeyDown}
          placeholder={placeholder}
          value={projectPath}
        />
        <Button
          aria-label={submitAriaLabel}
          className="h-9 w-9 shrink-0 p-0"
          disabled={
            submitting ||
            pathValidation.status === "validating" ||
            projectPath.trim().length < 1 ||
            effectiveName.length < 1
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
          <div className={`text-xs ${validationClassName}`}>
            {pathValidation.message || "Enter a project path to auto-generate the project name."}
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_15rem]">
            <Input
              className="h-9 text-sm"
              onChange={(event) => {
                const nextName = event.target.value;
                setProjectName(nextName);
                setNameWasEditedManually(nextName.trim().length > 0);
              }}
              onFocus={() => setDetailsExpanded(true)}
              onKeyDown={handlePathOrNameKeyDown}
              placeholder="Project name"
              value={projectName}
            />
            <Select
              className="h-9 text-sm"
              onChange={(event) => {
                const nextSkillSetId = event.target.value;
                setSelectedSkillSetId(nextSkillSetId);
                try {
                  window.localStorage.setItem(
                    PROJECT_QUICK_ADD_SKILL_STORAGE_KEY,
                    nextSkillSetId,
                  );
                } catch {
                  // Ignore storage write failures (e.g., disabled storage).
                }
              }}
              onFocus={() => setDetailsExpanded(true)}
              value={selectedSkillSetId}
            >
              <option value="">No skill auto-add</option>
              {skillSets.map((skillSet) => (
                <option key={skillSet.id} value={skillSet.id}>
                  {skillSet.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      ) : null}
    </form>
  );
}
