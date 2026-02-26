export type WaitFunction = (ms: number) => Promise<void>;

export interface RetryOptions {
  attempts: number;
  delayMs: number;
  wait?: WaitFunction;
}

export const DAEMON_RETRY_POLICY: Pick<RetryOptions, "attempts" | "delayMs"> = {
  attempts: 10,
  delayMs: 3000,
};

const defaultWait: WaitFunction = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function normalizeAttempts(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.max(1, Math.floor(value));
}

function normalizeDelay(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

export async function retryAsync<T>(
  operation: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const attempts = normalizeAttempts(options.attempts);
  const delayMs = normalizeDelay(options.delayMs);
  const wait = options.wait ?? defaultWait;

  let lastError: unknown = new Error("Retry operation did not run");
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) {
        break;
      }
      await wait(delayMs);
    }
  }

  throw lastError;
}
