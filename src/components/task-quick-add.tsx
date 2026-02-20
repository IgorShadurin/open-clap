"use client";

import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import {
  DEFAULT_TASK_MODEL,
  TASK_MODEL_OPTIONS,
  DEFAULT_TASK_REASONING,
  TASK_REASONING_OPTIONS,
} from "@/lib/task-reasoning";

import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { Select } from "./ui/select";

export interface TaskQuickAddPayload {
  contextCount: number;
  includeContext: boolean;
  model: string;
  reasoning: string;
  text: string;
}

interface TaskQuickAddProps {
  onSubmit: (payload: TaskQuickAddPayload) => Promise<void> | void;
  placeholder: string;
  stopPropagation?: boolean;
  submitAriaLabel: string;
  submitTitle: string;
}

export function TaskQuickAdd({
  onSubmit,
  placeholder,
  stopPropagation = false,
  submitAriaLabel,
  submitTitle,
}: TaskQuickAddProps) {
  const [text, setText] = useState("");
  const [model, setModel] = useState(DEFAULT_TASK_MODEL);
  const [reasoning, setReasoning] = useState(DEFAULT_TASK_REASONING);
  const [includeContext, setIncludeContext] = useState(false);
  const [contextCount, setContextCount] = useState(0);
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      if (formRef.current?.contains(target)) {
        return;
      }

      setSettingsExpanded(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  const reset = () => {
    setText("");
    setModel(DEFAULT_TASK_MODEL);
    setReasoning(DEFAULT_TASK_REASONING);
    setIncludeContext(false);
    setContextCount(0);
    setSettingsExpanded(false);
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
    const trimmedText = text.trim();
    if (trimmedText.length < 1 || submitting) {
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        contextCount,
        includeContext,
        model,
        reasoning,
        text: trimmedText,
      });
      reset();
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
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
          onChange={(event) => setText(event.target.value)}
          onFocus={() => setSettingsExpanded(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          value={text}
        />
        <Button
          aria-label={submitAriaLabel}
          className="h-9 w-9 shrink-0 p-0"
          disabled={submitting || text.trim().length < 1}
          draggable={false}
          onDragStart={preventDragStart}
          onMouseDown={stopEventPropagation}
          onPointerDown={stopEventPropagation}
          title={submitTitle}
          type="submit"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
      {settingsExpanded ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-2 grid grid-cols-1 gap-2 rounded-md border border-black/15 bg-white p-2 shadow-lg md:grid-cols-4">
          <Select
            className="h-9 text-sm"
            onChange={(event) => setModel(event.target.value)}
            onFocus={() => setSettingsExpanded(true)}
            value={model}
          >
            {!TASK_MODEL_OPTIONS.some((option) => option.value === model) && model.trim().length > 0 ? (
              <option value={model}>{model}</option>
            ) : null}
            {TASK_MODEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Select
            className="h-9 text-sm"
            onChange={(event) => setReasoning(event.target.value)}
            onFocus={() => setSettingsExpanded(true)}
            value={reasoning}
          >
            {TASK_REASONING_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <label className="flex h-9 items-center gap-2 rounded-md border border-black/15 px-3 text-sm">
            <Checkbox
              checked={includeContext}
              onCheckedChange={(checked) => setIncludeContext(Boolean(checked))}
            />
            <span>Include context</span>
          </label>
          <Input
            className="h-9 text-sm"
            disabled={!includeContext}
            min={0}
            onChange={(event) => setContextCount(Number.parseInt(event.target.value || "0", 10))}
            onFocus={() => setSettingsExpanded(true)}
            placeholder="Messages count"
            type="number"
            value={contextCount}
          />
        </div>
      ) : null}
    </form>
  );
}
