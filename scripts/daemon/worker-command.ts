import { spawn } from "node:child_process";

import type { WorkerExecutionContext, CommandRunner, ShellCommandResult } from "./worker-types";
import { formatTimeoutDuration } from "./task-timeout-config";

const PLACEHOLDER_REGEX = /\{\{([a-zA-Z0-9_]+)\}\}/g;

export function renderCommandTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replaceAll(PLACEHOLDER_REGEX, (_match, key: string) => values[key] ?? "");
}

export async function runCommandInShell(
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

function selectSemanticFailureInput(stdout: string, stderr: string): string {
  const trimmedStdout = stdout.trim();
  if (trimmedStdout.length > 0) {
    return trimmedStdout;
  }

  const trimmedStderr = stderr.trim();
  if (trimmedStderr.length <= 4000) {
    return trimmedStderr;
  }

  return trimmedStderr.slice(-4000);
}

function detectSemanticFailure(stdout: string, stderr: string): string | null {
  const combined = selectSemanticFailureInput(stdout, stderr).toLowerCase();
  const patterns = [
    /write access is blocked/,
    /read-only sandbox/,
    /operation not permitted/,
    /permission denied/,
    /\btask (?:was|is) not completed\b/,
    /\b(?:i|we)\s+(?:can(?:not|['’]t)|could(?: not|['’]t)|am unable to|are unable to)\b[\s\S]{0,140}\b(?:complete|finish|proceed|execute|deliver|write|modify|create)\b/,
    /\b(?:unable|failed)\s+to\s+(?:complete|finish|proceed|execute|deliver|write|modify|create)\b/,
  ];

  for (const pattern of patterns) {
    if (pattern.test(combined)) {
      return `Codex output indicates task was not completed (${pattern.source})`;
    }
  }

  return null;
}

export async function executeCodexCommand(input: {
  attempt: number;
  command: string;
  commandRunner: CommandRunner;
  context: WorkerExecutionContext;
  taskId: string;
  variantLabel: string;
}): Promise<{ fullResponse: string; status: "done" | "failed" }> {
  const { attempt, command, commandRunner, context, taskId, variantLabel } = input;
  const startedAt = Date.now();
  const rawTimeoutMs = context.taskTimeoutMs;
  const timeoutMs = typeof rawTimeoutMs === "number" && Number.isFinite(rawTimeoutMs) && rawTimeoutMs > 0
    ? Math.floor(rawTimeoutMs)
    : null;
  const timeoutLabel = timeoutMs === null ? null : formatTimeoutDuration(timeoutMs);

  context.auditLogger?.log("command", "Executing codex command", {
    attempt,
    command,
    timeoutMs,
    taskId,
    variantLabel,
  });

  const commandAbortController = new AbortController();
  let timedOut = false;
  let timeoutHandle: NodeJS.Timeout | null = null;

  const onParentAbort = (): void => {
    commandAbortController.abort();
  };

  if (context.signal) {
    if (context.signal.aborted) {
      onParentAbort();
    } else {
      context.signal.addEventListener("abort", onParentAbort, { once: true });
    }
  }

  if (timeoutMs !== null) {
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      context.onCommandTimeout?.({
        attempt,
        taskId,
        timeoutMs,
        variantLabel,
      });
      commandAbortController.abort();
    }, timeoutMs);
    timeoutHandle.unref();
  }

  let result: ShellCommandResult;
  try {
    result = await commandRunner(command, { signal: commandAbortController.signal });
  } catch (error) {
    if (context.signal) {
      context.signal.removeEventListener("abort", onParentAbort);
    }
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (timedOut && timeoutLabel) {
      const timeoutReason =
        `Codex command timed out after ${timeoutLabel} for task ${taskId} ` +
        `(variant=${variantLabel}, attempt=${attempt})`;
      context.auditLogger?.log("failure", "Codex command timed out", {
        attempt,
        errorMessage,
        reason: timeoutReason,
        taskId,
        timeoutMs,
        variantLabel,
      });
      return {
        status: "failed",
        fullResponse: `${timeoutReason}\n\n${errorMessage}`,
      };
    }
    context.auditLogger?.log("failure", "Codex command execution error", {
      attempt,
      message: errorMessage,
      taskId,
      variantLabel,
    });
    return {
      status: "failed",
      fullResponse: `Codex command execution error: ${errorMessage}`,
    };
  }

  if (context.signal) {
    context.signal.removeEventListener("abort", onParentAbort);
  }
  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
  }

  const durationMs = Date.now() - startedAt;
  const fullResponse = toFullResponse(result.stdout, result.stderr);
  const semanticFailure = detectSemanticFailure(result.stdout, result.stderr);

  if (timedOut && timeoutLabel) {
    const reason =
      `Codex command timed out after ${timeoutLabel} for task ${taskId} ` +
      `(variant=${variantLabel}, attempt=${attempt})`;
    context.auditLogger?.log("failure", "Codex command timed out", {
      attempt,
      code: result.code,
      durationMs,
      reason,
      signal: result.signal,
      stderr: truncateForLog(result.stderr),
      stdout: truncateForLog(result.stdout),
      taskId,
      timeoutMs,
      variantLabel,
    });
    return {
      status: "failed",
      fullResponse: `${reason}\n\n${fullResponse}`,
    };
  }

  if (result.code !== 0 || semanticFailure) {
    const reason =
      semanticFailure ??
      `Codex command failed for task ${taskId} (code=${result.code}, signal=${result.signal ?? "none"})`;

    context.auditLogger?.log("failure", "Codex command failed", {
      attempt,
      code: result.code,
      durationMs,
      reason,
      signal: result.signal,
      stderr: truncateForLog(result.stderr),
      stdout: truncateForLog(result.stdout),
      taskId,
      variantLabel,
    });
    return {
      status: "failed",
      fullResponse: `${reason}\n\n${fullResponse}`,
    };
  }

  context.auditLogger?.log("output", "Codex command output", {
    attempt,
    code: result.code,
    durationMs,
    responseLength: fullResponse.length,
    stderr: truncateForLog(result.stderr),
    stdout: truncateForLog(result.stdout),
    taskId,
    variantLabel,
  });
  context.auditLogger?.log("success", "Codex command completed", {
    attempt,
    durationMs,
    taskId,
    variantLabel,
  });

  return {
    status: "done",
    fullResponse,
  };
}
