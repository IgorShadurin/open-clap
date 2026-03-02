import type { DaemonTask, TaskExecutionResult } from "../../shared/contracts/task";
import {
  extractListIdsFromText,
  getTaskListTypeValidationError,
  replaceListTokensInText,
} from "../../src/lib/list-tokens";
import { loadPromptTemplate } from "../../src/lib/prompt-templates";
import {
  renderTaskPrompt,
  type WorkerTemplates,
} from "./template-renderer";
import {
  executeCodexCommand,
  renderCommandTemplate,
  runCommandInShell,
} from "./worker-command";
import { LIST_SUBTASK_RETRY_COUNT } from "./list-execution-config";
import type { CommandRunner, WorkerExecutionContext } from "./worker-types";

const DEFAULT_CODEX_COMMAND_TEMPLATE = loadPromptTemplate(
  "prompts/codex-command-template.md",
);

interface TaskVariant {
  itemValue: string | null;
  label: string;
  text: string;
}

interface VariantExecutionResult {
  attempts: number;
  fullResponse: string;
  itemValue: string | null;
  status: "done" | "failed";
}

export const LIST_SUBTASK_MAX_ATTEMPTS = LIST_SUBTASK_RETRY_COUNT + 1;

function toCommand(task: DaemonTask, message: string, template: string): string {
  return renderCommandTemplate(template, {
    contextPath: task.contextPath,
    message,
    model: task.model,
    reasoning: task.reasoning,
    task: task.text,
    taskId: task.id,
  });
}

export function buildTaskMessage(
  task: DaemonTask,
  templates: WorkerTemplates,
): string {
  return renderTaskPrompt(task, templates);
}

function resolveTaskVariants(task: DaemonTask): {
  isListTask: boolean;
  listId: string | null;
  variants: TaskVariant[];
} {
  const listExecution = task.listExecution;
  if (!listExecution?.listId) {
    return {
      isListTask: false,
      listId: null,
      variants: [
        {
          itemValue: null,
          label: "single",
          text: task.text,
        },
      ],
    };
  }

  if (listExecution.items.length < 1) {
    return {
      isListTask: true,
      listId: listExecution.listId,
      variants: [],
    };
  }

  return {
    isListTask: true,
    listId: listExecution.listId,
    variants: listExecution.items.map((itemValue, index) => ({
      itemValue,
      label: `${index + 1}/${listExecution.items.length}`,
      text: replaceListTokensInText(task.text, new Map([[listExecution.listId, [itemValue]]])),
    })),
  };
}

async function executeCommandForTaskVariant(
  task: DaemonTask,
  taskText: string,
  templates: WorkerTemplates,
  codexCommandTemplate: string,
  commandRunner: CommandRunner,
  context: WorkerExecutionContext,
  variantLabel: string,
  attempt: number,
): Promise<{ fullResponse: string; status: "done" | "failed" }> {
  const message = buildTaskMessage(
    {
      ...task,
      text: taskText,
    },
    templates,
  );
  const command = toCommand(
    {
      ...task,
      text: taskText,
    },
    message,
    codexCommandTemplate,
  );
  return executeCodexCommand({
    attempt,
    command,
    commandRunner,
    context,
    taskId: task.id,
    variantLabel,
  });
}

function formatListExecutionResponse(
  listId: string,
  rows: VariantExecutionResult[],
): string {
  const failedCount = rows.filter((row) => row.status === "failed").length;
  const header =
    `[list-execution] $list-${listId} items=${rows.length} ` +
    `failed=${failedCount} retryCount=${LIST_SUBTASK_RETRY_COUNT}`;

  const body = rows.map((row, index) => {
    const itemLabel = row.itemValue ?? "";
    const sectionHeader =
      `[${index + 1}/${rows.length}] item=${itemLabel} status=${row.status} attempts=${row.attempts}`;
    return `${sectionHeader}\n${row.fullResponse}`;
  });

  return [header, ...body].join("\n\n");
}

export async function executeTask(
  task: DaemonTask,
  templates: WorkerTemplates,
  context: WorkerExecutionContext = {},
): Promise<TaskExecutionResult> {
  const codexCommandTemplate = context.codexCommandTemplate ?? DEFAULT_CODEX_COMMAND_TEMPLATE;
  const commandRunner = context.commandRunner ?? runCommandInShell;
  const referencedListIds = extractListIdsFromText(task.text);
  if (referencedListIds.length > 1) {
    const details =
      getTaskListTypeValidationError(task.text) ??
      "Task can reference only one list type.";
    context.auditLogger?.log("failure", "Task rejected: multiple list types", {
      listIds: referencedListIds,
      taskId: task.id,
    });
    return {
      status: "failed",
      fullResponse: details,
      finishedAt: new Date(),
    };
  }

  const variantPlan = resolveTaskVariants(task);

  context.auditLogger?.log("task", "Task payload", {
    contextPath: task.contextPath,
    id: task.id,
    includeHistory: task.includeHistory,
    listExecution: task.listExecution ?? null,
    model: task.model,
    priority: task.priority ?? null,
    projectId: task.projectId ?? null,
    reasoning: task.reasoning,
    subprojectId: task.subprojectId ?? null,
    text: task.text,
  });
  if (variantPlan.isListTask && variantPlan.listId) {
    context.auditLogger?.log("task", "List execution plan", {
      listId: variantPlan.listId,
      promptCount: variantPlan.variants.length,
      taskId: task.id,
    });
  }

  if (!variantPlan.isListTask) {
    const variant = variantPlan.variants[0]!;
    const result = await executeCommandForTaskVariant(
      task,
      variant.text,
      templates,
      codexCommandTemplate,
      commandRunner,
      context,
      variant.label,
      1,
    );

    return {
      status: result.status,
      fullResponse: result.fullResponse,
      finishedAt: new Date(),
    };
  }

  if (variantPlan.variants.length < 1) {
    return {
      status: "done",
      fullResponse: `No list items found for $list-${variantPlan.listId ?? ""}.`,
      finishedAt: new Date(),
    };
  }

  const rows: VariantExecutionResult[] = [];
  for (const variant of variantPlan.variants) {
    const variantStartedAt = Date.now();
    let attempts = 0;
    let latest: { fullResponse: string; status: "done" | "failed" } = {
      status: "failed",
      fullResponse: "No execution attempts were made.",
    };

    while (attempts < LIST_SUBTASK_MAX_ATTEMPTS) {
      attempts += 1;
      if (context.signal?.aborted) {
        latest = {
          status: "failed",
          fullResponse: "Task execution aborted.",
        };
        break;
      }

      latest = await executeCommandForTaskVariant(
        task,
        variant.text,
        templates,
        codexCommandTemplate,
        commandRunner,
        context,
        variant.label,
        attempts,
      );

      if (latest.status === "done") {
        break;
      }
    }

    rows.push({
      attempts,
      fullResponse: latest.fullResponse,
      itemValue: variant.itemValue,
      status: latest.status,
    });

    context.onListSubtaskComplete?.({
      attempts,
      current: rows.length,
      durationMs: Date.now() - variantStartedAt,
      itemValue: variant.itemValue,
      listId: variantPlan.listId ?? "",
      status: latest.status,
      taskId: task.id,
      total: variantPlan.variants.length,
    });
  }

  return {
    status: "done",
    fullResponse: formatListExecutionResponse(variantPlan.listId ?? "", rows),
    finishedAt: new Date(),
  };
}
