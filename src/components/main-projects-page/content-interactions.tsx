"use client";

import { Select } from "../ui/select";
import {
  limitProgressClass,
  normalizePercent,
  progressWidth,
  type LimitResetLabel,
} from "./content-helpers";
import type { JSX } from "react";
import { TaskQuickAdd, type TaskQuickAddPayload } from "../task-quick-add";
import type { MainProjectsPageCoreState } from "./content-core-state";
import type { SkillSetTreeItem } from "../../../shared/contracts";

export interface MainProjectsPageInteractions {
  renderTaskComposerInstructionAddon: (scopeKey: string) => JSX.Element;
  renderTaskComposer: (
    project: { id: string },
    scopeKey: string,
    options: {
      placeholder: string;
      submitAriaLabel: string;
      submitTitle: string;
    },
    onSubmit: (payload: TaskQuickAddPayload, instructionSetId: string) => Promise<void> | void,
  ) => JSX.Element;
  shouldBlockContainerDragStart: (event: {
    target: EventTarget | null;
    currentTarget: EventTarget | null;
    nativeEvent: Event;
  }) => boolean;
  isCodexInfoOpen: (model: string) => boolean;
  toggleCodexInfo: (model: string) => void;
  renderUsageLimits: (label: string, usedPercent: number, resetLabel: LimitResetLabel) => JSX.Element;
}

interface InteractionProps {
  state: MainProjectsPageCoreState;
  sortedInstructionSets: SkillSetTreeItem[];
}

export const useMainProjectsPageInteractions = ({
  state,
  sortedInstructionSets,
}: InteractionProps): MainProjectsPageInteractions => {
  const getComposerInstructionSetId = (scopeKey: string): string =>
    state.selectedInstructionSetByComposer[scopeKey] ?? "";

  const setComposerInstructionSet = (scopeKey: string, instructionSetId: string) => {
    state.setSelectedInstructionSetByComposer((current) => ({
      ...current,
      [scopeKey]: instructionSetId,
    }));
    state.setQuickAddClearSignalByScope((current) => ({
      ...current,
      [scopeKey]: (current[scopeKey] ?? 0) + 1,
    }));
  };

  const renderTaskComposerInstructionAddon = (scopeKey: string) => {
    const selectedInstructionSetId = getComposerInstructionSetId(scopeKey);

    return (
      <Select
        className="h-9 w-52 shrink-0 text-sm"
        onChange={(event) => setComposerInstructionSet(scopeKey, event.target.value)}
        value={selectedInstructionSetId}
      >
        <option value="">Custom task</option>
        {sortedInstructionSets.length < 1 ? null : (
          <>
            <option disabled value="">
              --------------------
            </option>
            {sortedInstructionSets.map((instructionSet) => (
              <option key={instructionSet.id} value={instructionSet.id}>
                {instructionSet.name}
              </option>
            ))}
          </>
        )}
      </Select>
    );
  };

  const renderTaskComposer = (
    project: { id: string },
    scopeKey: string,
    options: {
      placeholder: string;
      submitAriaLabel: string;
      submitTitle: string;
    },
    onSubmit: (payload: TaskQuickAddPayload, instructionSetId: string) => Promise<void> | void,
  ) => {
    const selectedInstructionSetId = getComposerInstructionSetId(scopeKey);
    return (
      <TaskQuickAdd
        allowEmptyText={Boolean(selectedInstructionSetId)}
        clearInputSignal={state.quickAddClearSignalByScope[scopeKey]}
        disableTextInput={Boolean(selectedInstructionSetId)}
        onSubmit={(payload) => onSubmit(payload, selectedInstructionSetId)}
        placeholder={options.placeholder}
        projectId={project.id}
        rightAddon={renderTaskComposerInstructionAddon(scopeKey)}
        stopPropagation
        submitAriaLabel={options.submitAriaLabel}
        submitTitle={options.submitTitle}
      />
    );
  };

  const shouldBlockContainerDragStart = (event: {
    target: EventTarget | null;
    currentTarget: EventTarget | null;
    nativeEvent: Event;
  }): boolean => {
    const interactiveSelector =
      "input, textarea, select, button, a, [contenteditable], [role='textbox'], [role='button'], [contenteditable='true'], [contenteditable='']";

    const isInteractiveElement = (candidate: Element | null): boolean => {
      if (!candidate) {
        return false;
      }
      return Boolean(candidate.closest(interactiveSelector));
    };

    if (isInteractiveElement(event.target as Element | null)) {
      return true;
    }

    const nativeEvent = event.nativeEvent as DragEvent & {
      composedPath?: () => EventTarget[];
    };
    const nativePath = typeof nativeEvent.composedPath === "function" ? nativeEvent.composedPath() : [];
    for (const item of nativePath) {
      if (item instanceof Element && isInteractiveElement(item)) {
        return true;
      }
    }

    if (event.currentTarget instanceof HTMLElement) {
      const activeElement = document.activeElement;
      if (
        activeElement instanceof Element &&
        event.currentTarget.contains(activeElement) &&
        isInteractiveElement(activeElement)
      ) {
        return true;
      }
    }

    return false;
  };

  const isCodexInfoOpen = (model: string): boolean => state.codexInfoOpenModel === model;
  const toggleCodexInfo = (model: string) =>
    state.setCodexInfoOpenModel((current) => (current === model ? null : model));

  const renderUsageLimits = (label: string, usedPercent: number, resetLabel: LimitResetLabel) => {
    const remainingPercent = state.codexConnected ? normalizePercent(100 - usedPercent) : 0;

    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm font-medium text-zinc-700">
          <span>{label}</span>
          <span>{remainingPercent}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded bg-zinc-200">
          <div
            className={`h-full ${limitProgressClass(remainingPercent)}`}
            style={{ width: progressWidth(remainingPercent) }}
          />
        </div>
        <div className="text-[11px] text-zinc-500">
          {resetLabel.text}{" "}
          {resetLabel.suffix ? <span className="font-semibold">{resetLabel.suffix}</span> : null}
        </div>
      </div>
    );
  };

  return {
    renderTaskComposerInstructionAddon,
    renderTaskComposer,
    shouldBlockContainerDragStart,
    isCodexInfoOpen,
    toggleCodexInfo,
    renderUsageLimits,
  };
};
