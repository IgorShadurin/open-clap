export interface Poller {
  start(): void;
  stop(): void;
}

export interface CreateImmediateActionPollerOptions {
  intervalMs?: number;
  onPoll: () => Promise<void> | void;
}

export function createImmediateActionPoller(
  options: CreateImmediateActionPollerOptions,
): Poller {
  const intervalMs = options.intervalMs ?? 1000;
  let timer: NodeJS.Timeout | null = null;

  return {
    start(): void {
      if (timer) {
        return;
      }

      timer = setInterval(() => {
        void options.onPoll();
      }, intervalMs);
    },
    stop(): void {
      if (!timer) {
        return;
      }
      clearInterval(timer);
      timer = null;
    },
  };
}
