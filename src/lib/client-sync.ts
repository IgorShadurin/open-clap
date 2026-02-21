export const CLIENT_SYNC_CHANNEL = "openclap-ui-sync";

interface ClientSyncSignal {
  reason: string;
  sequence: number;
}

let nextSequence = 1;

function createClientSyncPayload(reason: string): ClientSyncSignal {
  return {
    reason,
    sequence: nextSequence += 1,
  };
}

function safeStringify(value: ClientSyncSignal): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export function emitClientSync(reason: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const payload = createClientSyncPayload(reason);
  const serialized = safeStringify(payload);
  if (serialized === null) {
    return;
  }

  try {
    localStorage.setItem(CLIENT_SYNC_CHANNEL, serialized);
  } catch {
    // Ignore storage errors (private mode, quota, etc.).
  }

  if (typeof BroadcastChannel !== "undefined") {
    try {
      const channel = new BroadcastChannel(CLIENT_SYNC_CHANNEL);
      channel.postMessage(payload);
      channel.close();
    } catch {
      // Ignore broadcast failures.
    }
  }
}
