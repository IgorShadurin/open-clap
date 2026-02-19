import { HttpDaemonApiClient, NoopDaemonApiClient } from "./api-client";
import { loadDaemonConfig } from "./config";
import { runTaskExecutionCycle } from "./execution-cycle";
import { handleImmediateActions } from "./immediate-action-handler";
import { createImmediateActionPoller } from "./immediate-action-poller";
import { createLogger } from "./logger";
import { TaskScheduler } from "./scheduler";
import { StatusReporter } from "./status-reporter";
import { pathToFileURL } from "node:url";

export interface DaemonRuntime {
  poller: { start(): void; stop(): void };
  scheduler: TaskScheduler;
  stop(): void;
}

export function startDaemon(): DaemonRuntime {
  const logger = createLogger();
  const apiBaseUrl = process.env.DAEMON_API_BASE_URL?.trim();
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

  const poller = createImmediateActionPoller({
    intervalMs: config.pollIntervalMs,
    onPoll: async () => {
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
        logger,
        runningTasks,
        runningTaskScopeById,
        scheduler,
        statusReporter,
        templates,
      });
    },
  });

  poller.start();

  return {
    poller,
    scheduler,
    stop(): void {
      poller.stop();
      logger.log("stopped", "Daemon stopped");
    },
  };
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  startDaemon();
}
