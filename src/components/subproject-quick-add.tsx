"use client";

import { FolderPlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

export interface SubprojectQuickAddPayload {
  metadata: string;
  name: string;
  path: string;
}

interface SubprojectQuickAddProps {
  defaultPath: string;
  onSubmit: (payload: SubprojectQuickAddPayload) => Promise<void> | void;
  placeholder?: string;
  stopPropagation?: boolean;
  submitAriaLabel: string;
  submitTitle: string;
}

function deriveNameFromPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    return "";
  }

  const normalized = trimmed.replace(/\\+$/g, "").replace(/\/+$/g, "");
  const lastSegment = normalized.split(/[\\/]/).filter(Boolean).pop() ?? "";
  if (!lastSegment) {
    return "";
  }

  const words = lastSegment.replace(/[-_]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length < 1) {
    return "";
  }

  const titleWords = words.map((word) => {
    const first = word.charAt(0).toUpperCase();
    const rest = word.slice(1).toLowerCase();
    return `${first}${rest}`;
  });

  return titleWords.join(" ");
}

export function SubprojectQuickAdd({
  defaultPath,
  onSubmit,
  placeholder = "Add subproject",
  stopPropagation = false,
  submitAriaLabel,
  submitTitle,
}: SubprojectQuickAddProps) {
  const [name, setName] = useState("");
  const [path, setPath] = useState(defaultPath);
  const [metadata, setMetadata] = useState("");
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const effectiveName = name.trim() || deriveNameFromPath(path);

  useEffect(() => {
    setPath((current) => (current.trim().length > 0 ? current : defaultPath));
  }, [defaultPath]);

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

  const reset = () => {
    setName("");
    setPath(defaultPath);
    setMetadata("");
    setDetailsExpanded(false);
  };

  const stopEventPropagation = <T extends { stopPropagation: () => void }>(event: T) => {
    if (stopPropagation) {
      event.stopPropagation();
    }
  };

  const preventDragStart = (event: {
    preventDefault: () => void;
    stopPropagation: () => void;
  }) => {
    event.preventDefault();
    if (stopPropagation) {
      event.stopPropagation();
    }
  };

  const handleSubmit = async () => {
    if (effectiveName.length < 1 || submitting) {
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        metadata: metadata.trim(),
        name: effectiveName,
        path: path.trim() || defaultPath,
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
      onMouseDown={stopEventPropagation}
      onPointerDown={stopEventPropagation}
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <div className="flex items-center gap-2">
        <Input
          className="h-9 text-sm"
          onChange={(event) => setName(event.target.value)}
          onFocus={() => setDetailsExpanded(true)}
          onKeyDown={handleNameKeyDown}
          placeholder={placeholder}
          value={name}
        />
        <Button
          aria-label={submitAriaLabel}
          className="h-9 w-9 shrink-0 p-0"
          disabled={submitting || effectiveName.length < 1}
          draggable={false}
          onDragStart={preventDragStart}
          onMouseDown={stopEventPropagation}
          onPointerDown={stopEventPropagation}
          title={submitTitle}
          type="submit"
          variant="outline"
        >
          <FolderPlus className="h-4 w-4" />
        </Button>
      </div>

      {detailsExpanded ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-2 grid grid-cols-1 gap-2 rounded-md border border-black/15 bg-white p-2 shadow-lg">
          <Input
            className="h-9 text-sm"
            onChange={(event) => setPath(event.target.value)}
            onFocus={() => setDetailsExpanded(true)}
            placeholder="Path"
            value={path}
          />
          <Textarea
            className="min-h-[84px] text-sm"
            onChange={(event) => setMetadata(event.target.value)}
            onFocus={() => setDetailsExpanded(true)}
            placeholder="Metadata (optional JSON)"
            value={metadata}
          />
        </div>
      ) : null}
    </form>
  );
}
