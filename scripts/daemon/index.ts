import { HttpDaemonApiClient, NoopDaemonApiClient } from "./api-client";
import { loadDaemonConfig } from "./config";
import { runTaskExecutionCycle } from "./execution-cycle";
import { handleImmediateActions } from "./immediate-action-handler";
import { createImmediateActionPoller } from "./immediate-action-poller";
import { createLogger } from "./logger";
import { TaskScheduler } from "./scheduler";
import { StatusReporter } from "./status-reporter";
import { createTaskAuditLogger, resolveDaemonLogFilePath } from "./task-audit-log";
import { pathToFileURL } from "node:url";
import { initializeDotenv } from "../../src/lib/settings";

export interface DaemonRuntime {
  poller: { start(): void; stop(): void };
  scheduler: TaskScheduler;
  stop(): void;
}

export function resolveDaemonApiBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const explicit = env.DAEMON_API_BASE_URL?.trim();
  if (explicit) {
    return explicit;
  }

  if (env.NODE_ENV === "test") {
    return null;
  }

  const port = env.PORT?.trim() || "3000";
  return `http://localhost:${port}`;
}

export function startDaemon(): DaemonRuntime {
  initializeDotenv();
  const logger = createLogger();
  const logFilePath = resolveDaemonLogFilePath(process.env);
  const taskAuditLogger = createTaskAuditLogger(logFilePath);
  const apiBaseUrl = resolveDaemonApiBaseUrl(process.env);
  const apiClient = apiBaseUrl
    ? new HttpDaemonApiClient(apiBaseUrl)
    : new NoopDaemonApiClient();
  const config = loadDaemonConfig();
  const scheduler = new TaskScheduler(config.maxParallelTasks);
  const runningTasks = new Map<
    string,
    { forceStop: () => Promise<void> | void }
  >();
  const runningTaskScopeById = new Map<string, string>();
  const activeWorkers = new Map<string, Promise<void>>();
  const statusReporter = new StatusReporter(apiClient);
  const templates = {
    defaultTemplate: config.taskTemplate,
    historyTemplate: config.taskTemplateWithHistory,
  };

  logger.log(
    "info",
    `Daemon started (maxParallel=${config.maxParallelTasks}, pollIntervalMs=${config.pollIntervalMs}, api=${apiBaseUrl ? apiBaseUrl : "noop"})`,
  );
  logger.log("info", `Daemon command log file: ${logFilePath}`);
  taskAuditLogger.log("meta", "Daemon started", {
    apiBaseUrl: apiBaseUrl ?? "noop",
    maxParallelTasks: config.maxParallelTasks,
    pollIntervalMs: config.pollIntervalMs,
  });

  const poller = createImmediateActionPoller({
    intervalMs: config.pollIntervalMs,
    onPoll: async () => {
      try {
        const actions = await apiClient.fetchImmediateActions();
        if (actions.length > 0) {
          const handled = await handleImmediateActions({
            actions,
            apiClient,
            runningTasks,
            log: (message) => logger.log("stopped", message),
          });
          logger.log(
            "info",
            `Immediate actions handled: acknowledged=${handled.acknowledged}, stopped=${handled.stopped}`,
          );
        }

        await runTaskExecutionCycle({
          activeWorkers,
          apiClient,
          codexCommandTemplate: config.codexCommandTemplate,
          logger,
          runningTasks,
          runningTaskScopeById,
          scheduler,
          statusReporter,
          taskAuditLogger,
          templates,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.log("failed", `Daemon poll error: ${message}`);
      }
    },
  });

  poller.start();

  return {
    poller,
    scheduler,
    stop(): void {
      poller.stop();
      for (const [taskId, control] of runningTasks.entries()) {
        void Promise.resolve(control.forceStop()).catch(() => {});
        taskAuditLogger.log("stopped", "Stop requested for running task", { taskId });
      }
      taskAuditLogger.log("meta", "Daemon stopped");
      logger.log("stopped", "Daemon stopped");
    },
  };
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const runtime = startDaemon();
  let stopped = false;

  const shutdown = (): void => {
    if (stopped) {
      return;
    }
    stopped = true;
    runtime.stop();
    setTimeout(() => {
      process.exit(0);
    }, 0);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
