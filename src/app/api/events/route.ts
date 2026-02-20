import { getLatestAppSyncEvent, subscribeToAppSync } from "../../../lib/live-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_INTERVAL_MS = 15_000;

function encodeSseBlock(eventName: string, payload: unknown): Uint8Array {
  const content = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  return new TextEncoder().encode(content);
}

function encodeSseComment(comment: string): Uint8Array {
  return new TextEncoder().encode(`: ${comment}\n\n`);
}

export async function GET(request: Request): Promise<Response> {
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let unsubscribe: (() => void) | null = null;
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

      const safeEnqueue = (chunk: Uint8Array) => {
        if (closed) {
          return;
        }

        try {
          controller.enqueue(chunk);
        } catch {
          close();
        }
      };

      const close = () => {
        if (closed) {
          return;
        }
        closed = true;

        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }

        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }

        try {
          controller.close();
        } catch {
          // Stream already closed.
        }
      };

      cleanup = close;

      safeEnqueue(encodeSseComment("connected"));
      safeEnqueue(encodeSseBlock("ready", getLatestAppSyncEvent()));

      unsubscribe = subscribeToAppSync((event) => {
        safeEnqueue(encodeSseBlock("sync", event));
      });

      heartbeatTimer = setInterval(() => {
        safeEnqueue(encodeSseComment("heartbeat"));
      }, HEARTBEAT_INTERVAL_MS);

      request.signal.addEventListener("abort", close, { once: true });
    },
    cancel() {
      if (cleanup) {
        cleanup();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no",
    },
  });
}
