import type { DaemonTask } from "../../shared/contracts/task";

export interface WorkerTemplates {
  defaultTemplate: string;
  historyTemplate: string;
}

const PLACEHOLDER_REGEX = /\{\{([a-zA-Z0-9_]+)\}\}/g;

type RenderContext = Record<string, string>;

const DEFAULT_REQUIRED_PLACEHOLDERS = ["context", "task"];
const HISTORY_REQUIRED_PLACEHOLDERS = ["history", "context", "task"];

function normalizeValue(value: string): string {
  return value.trim();
}

function assertRequiredFields(task: DaemonTask): void {
  if (!normalizeValue(task.text)) {
    throw new Error(`Task ${task.id} is missing required field: text`);
  }
  if (!normalizeValue(task.contextPath)) {
    throw new Error(`Task ${task.id} is missing required field: contextPath`);
  }
  if (!normalizeValue(task.model)) {
    throw new Error(`Task ${task.id} is missing required field: model`);
  }
  if (!normalizeValue(task.reasoning)) {
    throw new Error(`Task ${task.id} is missing required field: reasoning`);
  }
}

function assertTemplateHasPlaceholders(
  template: string,
  requiredPlaceholders: string[],
): void {
  for (const placeholder of requiredPlaceholders) {
    const token = `{{${placeholder}}}`;
    if (!template.includes(token)) {
      throw new Error(`Template is missing required placeholder: ${token}`);
    }
  }
}

function buildRenderContext(task: DaemonTask): RenderContext {
  return {
    context: task.contextPath,
    contextPath: task.contextPath,
    history: task.history ?? "",
    model: task.model,
    reasoning: task.reasoning,
    task: task.text,
    taskId: task.id,
  };
}

function renderTemplate(template: string, context: RenderContext): string {
  return template.replaceAll(PLACEHOLDER_REGEX, (_match, key: string) => {
    return Object.hasOwn(context, key) ? context[key] : "";
  });
}

export function renderTaskPrompt(
  task: DaemonTask,
  templates: WorkerTemplates,
): string {
  assertRequiredFields(task);

  const template = task.includeHistory
    ? templates.historyTemplate
    : templates.defaultTemplate;
  const required = task.includeHistory
    ? HISTORY_REQUIRED_PLACEHOLDERS
    : DEFAULT_REQUIRED_PLACEHOLDERS;

  assertTemplateHasPlaceholders(template, required);
  return renderTemplate(template, buildRenderContext(task));
}
