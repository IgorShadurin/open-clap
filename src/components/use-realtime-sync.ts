"use client";

import { useEffect, useRef } from "react";
import { CLIENT_SYNC_CHANNEL } from "../lib/client-sync";

interface UseRealtimeSyncOptions {
  debounceMs?: number;
  retryDelayMs?: number;
}

export function useRealtimeSync(
  onSync: () => void,
  options?: UseRealtimeSyncOptions,
): void {
  const debounceMs = options?.debounceMs ?? 120;
  const retryDelayMs = options?.retryDelayMs ?? 1_000;
  const onSyncRef = useRef(onSync);

  useEffect(() => {
    onSyncRef.current = onSync;
  }, [onSync]);

  useEffect(() => {
    let stopped = false;
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const clearRetryTimer = () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const clearDebounceTimer = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
    };

    const triggerSync = () => {
      if (stopped) {
        return;
      }
      scheduleSync();
    };

    const storageListener = (event: StorageEvent) => {
      if (event.key !== CLIENT_SYNC_CHANNEL || !event.newValue) {
        return;
      }
      triggerSync();
    };

    const attachBroadcastChannel = (): (() => void) | null => {
      if (typeof BroadcastChannel === "undefined") {
        return null;
      }

      const channel = new BroadcastChannel(CLIENT_SYNC_CHANNEL);
      channel.onmessage = () => {
        triggerSync();
      };
      return () => {
        channel.close();
      };
    };

    const handleWindowFocus = () => {
      triggerSync();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        triggerSync();
      }
    };

    const scheduleSync = () => {
      if (debounceTimer) {
        return;
      }

      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        onSyncRef.current();
      }, debounceMs);
    };

    const connect = () => {
      if (stopped) {
        return;
      }

      source = new EventSource("/api/events");
      source.addEventListener("sync", scheduleSync);

      source.onerror = () => {
        if (source) {
          source.close();
          source = null;
        }

        if (stopped || retryTimer) {
          return;
        }

        retryTimer = setTimeout(() => {
          retryTimer = null;
          connect();
        }, retryDelayMs);
      };
    };

    window.addEventListener("storage", storageListener);
    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const cleanupBroadcastChannel = attachBroadcastChannel();
    connect();

    return () => {
      stopped = true;
      clearRetryTimer();
      clearDebounceTimer();
      if (source) {
        source.close();
        source = null;
      }
      window.removeEventListener("storage", storageListener);
      if (cleanupBroadcastChannel) {
        cleanupBroadcastChannel();
      }
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [debounceMs, retryDelayMs]);
}
