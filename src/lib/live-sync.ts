export interface AppSyncEvent {
  at: string;
  reason: string;
  revision: number;
}

type AppSyncListener = (event: AppSyncEvent) => void;

const listeners = new Map<number, AppSyncListener>();
let latestEvent: AppSyncEvent = {
  at: new Date(0).toISOString(),
  reason: "bootstrap",
  revision: 0,
};
let nextListenerId = 1;

export function getLatestAppSyncEvent(): AppSyncEvent {
  return latestEvent;
}

export function subscribeToAppSync(listener: AppSyncListener): () => void {
  const listenerId = nextListenerId;
  nextListenerId += 1;
  listeners.set(listenerId, listener);

  return () => {
    listeners.delete(listenerId);
  };
}

export function publishAppSync(reason: string): AppSyncEvent {
  latestEvent = {
    at: new Date().toISOString(),
    reason,
    revision: latestEvent.revision + 1,
  };

  for (const [listenerId, listener] of listeners.entries()) {
    try {
      listener(latestEvent);
    } catch {
      listeners.delete(listenerId);
    }
  }

  return latestEvent;
}

export function resetAppSyncStateForTests(): void {
  listeners.clear();
  latestEvent = {
    at: new Date(0).toISOString(),
    reason: "bootstrap",
    revision: 0,
  };
  nextListenerId = 1;
}
