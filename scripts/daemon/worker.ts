import type { DaemonTask, TaskExecutionResult } from "../../shared/contracts/task";
import { loadPromptTemplate } from "../../src/lib/prompt-templates";
import {
  renderTaskPrompt,
  type WorkerTemplates,
} from "./template-renderer";
import type { TaskAuditLogger } from "./task-audit-log";
import { spawn } from "node:child_process";

const PLACEHOLDER_REGEX = /\{\{([a-zA-Z0-9_]+)\}\}/g;

const DEFAULT_CODEX_COMMAND_TEMPLATE = loadPromptTemplate(
  "prompts/codex-command-template.md",
);

export interface WorkerExecutionContext {
  auditLogger?: TaskAuditLogger;
  codexCommandTemplate?: string;
  commandRunner?: CommandRunner;
  signal?: AbortSignal;
}

interface ShellCommandResult {
  code: number;
  signal: NodeJS.Signals | null;
  stderr: string;
  stdout: string;
}

export type CommandRunner = (
  command: string,
  options?: { signal?: AbortSignal },
) => Promise<ShellCommandResult>;

function renderCommandTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replaceAll(PLACEHOLDER_REGEX, (_match, key: string) => values[key] ?? "");
}

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

async function runCommandInShell(
  command: string,
  options: { signal?: AbortSignal } = {},
): Promise<ShellCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const cleanupAbortListener = (): void => {
      if (!options.signal) {
        return;
      }
      options.signal.removeEventListener("abort", onAbort);
    };

    const settle = (fn: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanupAbortListener();
      fn();
    };

    const onAbort = (): void => {
      if (child.killed) {
        return;
      }
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
      }, 1500).unref();
    };

    if (options.signal) {
      if (options.signal.aborted) {
        onAbort();
      } else {
        options.signal.addEventListener("abort", onAbort, { once: true });
      }
    }

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string | Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string | Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      settle(() => reject(error));
    });

    child.on("close", (code, signal) => {
      settle(() =>
        resolve({
          code: code ?? -1,
          signal,
          stderr: stderr.trim(),
          stdout: stdout.trim(),
        }),
      );
    });
  });
}

function toFullResponse(stdout: string, stderr: string): string {
  if (stdout && stderr) {
    return `${stdout}\n\n[stderr]\n${stderr}`;
  }
  if (stdout) {
    return stdout;
  }
  if (stderr) {
    return stderr;
  }

  return "Command completed with no output.";
}

function truncateForLog(value: string, limit = 4000): string {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, limit)}... [truncated ${value.length - limit} chars]`;
}

function detectSemanticFailure(stdout: string, stderr: string): string | null {
  const combined = `${stdout}\n${stderr}`.toLowerCase();
  const patterns = [
    /write access is blocked/,
    /read-only sandbox/,
    /operation not permitted/,
    /permission denied/,
    /couldn't create/,
    /could not create/,
    /can['’]?t create/,
    /cannot create/,
  ];

  for (const pattern of patterns) {
    if (pattern.test(combined)) {
      return `Codex output indicates task was not completed (${pattern.source})`;
    }
  }

  return null;
}

export function buildTaskMessage(
  task: DaemonTask,
  templates: WorkerTemplates,
): string {
  return renderTaskPrompt(task, templates);
}

export async function executeTask(
  task: DaemonTask,
  templates: WorkerTemplates,
  context: WorkerExecutionContext = {},
): Promise<TaskExecutionResult> {
  const message = buildTaskMessage(task, templates);
  const codexCommandTemplate = context.codexCommandTemplate ?? DEFAULT_CODEX_COMMAND_TEMPLATE;
  const command = toCommand(task, message, codexCommandTemplate);
  const commandRunner = context.commandRunner ?? runCommandInShell;
  const startedAt = Date.now();

  context.auditLogger?.log("task", "Task payload", {
    contextPath: task.contextPath,
    id: task.id,
    includeHistory: task.includeHistory,
    model: task.model,
    priority: task.priority ?? null,
    projectId: task.projectId ?? null,
    reasoning: task.reasoning,
    subprojectId: task.subprojectId ?? null,
    text: task.text,
  });
  context.auditLogger?.log("command", "Executing codex command", {
    command,
    taskId: task.id,
  });

  let result: ShellCommandResult;
  try {
    result = await commandRunner(command, { signal: context.signal });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    context.auditLogger?.log("failure", "Codex command execution error", {
      message,
      taskId: task.id,
    });
    return {
      status: "failed",
      fullResponse: `Codex command execution error: ${message}`,
      finishedAt: new Date(),
    };
  }

  const durationMs = Date.now() - startedAt;
  const fullResponse = toFullResponse(result.stdout, result.stderr);
  const semanticFailure = detectSemanticFailure(result.stdout, result.stderr);

  if (result.code !== 0 || semanticFailure) {
    const reason =
      semanticFailure ??
      `Codex command failed for task ${task.id} (code=${result.code}, signal=${result.signal ?? "none"})`;

    context.auditLogger?.log("failure", "Codex command failed", {
      code: result.code,
      durationMs,
      reason,
      signal: result.signal,
      stderr: truncateForLog(result.stderr),
      stdout: truncateForLog(result.stdout),
      taskId: task.id,
    });
    return {
      status: "failed",
      fullResponse: `${reason}\n\n${fullResponse}`,
      finishedAt: new Date(),
    };
  }

  context.auditLogger?.log("output", "Codex command output", {
    code: result.code,
    durationMs,
    responseLength: fullResponse.length,
    stderr: truncateForLog(result.stderr),
    stdout: truncateForLog(result.stdout),
    taskId: task.id,
  });
  context.auditLogger?.log("success", "Codex command completed", {
    durationMs,
    taskId: task.id,
  });

  return {
    status: "done",
    fullResponse,
    finishedAt: new Date(),
  };
}
