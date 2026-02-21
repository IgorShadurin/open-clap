import type { ComponentPropsWithoutRef } from "react";

import {
  TASK_MODEL_OPTIONS,
  TASK_MODEL_OPTIONS_WITH_EMOJI,
  TASK_REASONING_OPTIONS,
  TASK_REASONING_OPTIONS_WITH_EMOJI,
  type TaskModelOption,
  type TaskReasoningOption,
} from "@/lib/task-reasoning";
import { Select } from "../ui/select";

type SelectProps = Omit<
  ComponentPropsWithoutRef<"select">,
  "children" | "onChange" | "value"
>;

interface BaseTaskSelectProps extends SelectProps {
  allowUnknown?: boolean;
  onValueChange: (value: string) => void;
  value: string;
}

interface TaskModelSelectProps extends BaseTaskSelectProps {
  value: string;
}

interface TaskReasoningSelectProps extends BaseTaskSelectProps {
  value: string;
}

function shouldShowUnknownOption<T extends { value: string }>(
  knownOptions: readonly T[],
  value: string,
  allowUnknown = true,
): boolean {
  const trimmed = value.trim();
  if (!allowUnknown || trimmed.length < 1) {
    return false;
  }

  return !knownOptions.some((option) => option.value === value);
}

function renderModelOptions() {
  return TASK_MODEL_OPTIONS_WITH_EMOJI.map((option: (typeof TASK_MODEL_OPTIONS_WITH_EMOJI)[number]) => (
    <option key={option.value} value={option.value}>
      {option.displayLabel}
    </option>
  ));
}

function renderReasoningOptions() {
  return TASK_REASONING_OPTIONS_WITH_EMOJI.map(
    (option: (typeof TASK_REASONING_OPTIONS_WITH_EMOJI)[number]) => (
      <option key={option.value} value={option.value}>
        {option.displayLabel}
      </option>
    ),
  );
}

export function TaskModelSelect({
  allowUnknown = true,
  className,
  disabled,
  onBlur,
  onFocus,
  onPointerDown,
  onMouseDown,
  onMouseEnter,
  onMouseLeave,
  onTouchStart,
  onTouchEnd,
  onKeyDown,
  onKeyUp,
  onValueChange,
  value,
  ...selectProps
}: TaskModelSelectProps) {
  return (
    <Select
      className={className}
      disabled={disabled}
      onBlur={onBlur}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseDown={onMouseDown}
      onPointerDown={onPointerDown}
      onTouchEnd={onTouchEnd}
      onTouchStart={onTouchStart}
      onChange={(event) => onValueChange(event.target.value)}
      value={value}
      {...selectProps}
    >
      {shouldShowUnknownOption<TaskModelOption>(TASK_MODEL_OPTIONS, value, allowUnknown) ? (
        <option value={value}>{value}</option>
      ) : null}
      {renderModelOptions()}
    </Select>
  );
}

export function TaskReasoningSelect({
  allowUnknown = true,
  className,
  disabled,
  onBlur,
  onFocus,
  onPointerDown,
  onMouseDown,
  onMouseEnter,
  onMouseLeave,
  onTouchStart,
  onTouchEnd,
  onKeyDown,
  onKeyUp,
  onValueChange,
  value,
  ...selectProps
}: TaskReasoningSelectProps) {
  return (
    <Select
      className={className}
      disabled={disabled}
      onBlur={onBlur}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseDown={onMouseDown}
      onPointerDown={onPointerDown}
      onTouchEnd={onTouchEnd}
      onTouchStart={onTouchStart}
      onChange={(event) => onValueChange(event.target.value)}
      value={value}
      {...selectProps}
    >
      {shouldShowUnknownOption<TaskReasoningOption>(TASK_REASONING_OPTIONS, value, allowUnknown) ? (
        <option value={value}>{value}</option>
      ) : null}
      {renderReasoningOptions()}
    </Select>
  );
}
