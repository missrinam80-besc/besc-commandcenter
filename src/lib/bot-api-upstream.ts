export const BOT_UPSTREAM_TIMEOUT_MS = 5000;

export class BotUpstreamAborted extends Error {
  constructor() { super("bot_upstream_aborted"); }
}

// One budget for the complete API operation, including SDK parsing of response bodies.
// Promise.race bounds latency; the shared AbortSignal also cancels real network I/O.
export async function withBotUpstream<T>(
  operation: (fetcher: typeof fetch) => Promise<T>,
  options: { signal?: AbortSignal; timeoutMs?: number; fetcher?: typeof fetch } = {},
): Promise<T> {
  const controller = new AbortController();
  const parent = options.signal;
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? BOT_UPSTREAM_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw Error("invalid_upstream_timeout");
  const abort = () => controller.abort(new BotUpstreamAborted());
  const timer = setTimeout(abort, timeoutMs);
  const onParentAbort = () => abort();
  parent?.addEventListener("abort", onParentAbort, { once: true });
  if (parent?.aborted) abort();
  let onAbort: () => void = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new BotUpstreamAborted());
    controller.signal.addEventListener("abort", onAbort, { once: true });
    if (controller.signal.aborted) onAbort();
  });
  const boundedFetch: typeof fetch = (input, init) => {
    // Prevent SDK retries from issuing fresh network requests after cancellation.
    controller.signal.throwIfAborted();
    const inputSignal = input instanceof Request ? input.signal : undefined;
    const signals = [controller.signal, init?.signal, inputSignal].filter((s): s is AbortSignal => Boolean(s));
    return fetcher(input, { ...init, signal: AbortSignal.any(signals) });
  };
  try {
    return await Promise.race([Promise.resolve().then(() => {
      controller.signal.throwIfAborted();
      return operation(boundedFetch);
    }), cancelled]);
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", onParentAbort);
    controller.signal.removeEventListener("abort", onAbort);
    // Also cancel any unfinished fetch started by a failing operation.
    abort();
  }
}
