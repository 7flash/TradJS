export type RequestFunction = (
  url: string,
  init: RequestInit,
) => Promise<Response>;
export type BenchmarkOptions = {
  url: string;
  concurrency: number;
  durationMs: number;
  timeoutMs: number;
  maxRequests: number;
};
export type RequestResult = {
  index: number;
  status: number;
  durationMs: number;
  outcome: "success" | "http-error" | "network-error" | "timeout" | "cancelled";
};
export type BenchmarkSnapshot = {
  url: string;
  sent: number;
  active: number;
  succeeded: number;
  httpErrors: number;
  networkErrors: number;
  timeouts: number;
  cancelled: number;
  elapsedMs: number;
  averageMs: number;
  p50Ms: number;
  p95Ms: number;
  successfulPerSecond: number;
  recent: RequestResult[];
  reason: "running" | "duration" | "limit" | "stopped";
};
export function normalizeTarget(value: string, base: string): string {
  if (!value.trim()) throw new Error("Enter a target URL or a relative path.");
  const url = new URL(value.trim(), base);
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("Use an HTTP or HTTPS URL.");
  if (url.username || url.password)
    throw new Error("Put credentials outside the URL.");
  url.hash = "";
  return url.href;
}
export function validateOptions(options: BenchmarkOptions): void {
  const bounds = {
    concurrency: [1, 32],
    durationMs: [100, 60000],
    timeoutMs: [100, 30000],
    maxRequests: [1, 10000],
  };
  for (const [key, [minimum, maximum]] of Object.entries(bounds)) {
    const value = options[key as keyof typeof bounds];
    if (!Number.isInteger(value) || value < minimum! || value > maximum!)
      throw new Error(
        `${key} must be an integer between ${minimum} and ${maximum}.`,
      );
  }
  normalizeTarget(options.url, options.url);
}
export async function runBenchmark(
  options: BenchmarkOptions,
  signal: AbortSignal,
  onProgress: (snapshot: BenchmarkSnapshot) => void = () => {},
  request: RequestFunction = fetch,
): Promise<BenchmarkSnapshot> {
  validateOptions(options);
  const controller = new AbortController();
  const start = performance.now();
  const latencies: number[] = [];
  const recent: RequestResult[] = [];
  let sent = 0,
    active = 0,
    succeeded = 0,
    httpErrors = 0,
    networkErrors = 0,
    timeouts = 0,
    cancelled = 0;
  let reason: BenchmarkSnapshot["reason"] = "running";
  const stop = () => {
    if (reason !== "running") return;
    reason = "stopped";
    controller.abort();
  };
  signal.addEventListener("abort", stop, { once: true });
  if (signal.aborted) stop();
  const deadline = setTimeout(() => {
    if (reason !== "running") return;
    reason = "duration";
    controller.abort();
  }, options.durationMs);
  function snapshot(): BenchmarkSnapshot {
    const sorted = latencies.slice().sort((a, b) => a - b);
    const elapsedMs = performance.now() - start;
    const percentile = (percent: number) =>
      sorted[Math.max(0, Math.ceil(sorted.length * percent) - 1)] ?? 0;
    return {
      url: options.url,
      sent,
      active,
      succeeded,
      httpErrors,
      networkErrors,
      timeouts,
      cancelled,
      elapsedMs,
      averageMs: latencies.length
        ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length
        : 0,
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      successfulPerSecond: elapsedMs > 0 ? (succeeded * 1000) / elapsedMs : 0,
      recent: recent.slice(),
      reason,
    };
  }
  const progressErrors: unknown[] = [];
  const progress = setInterval(() => {
    try {
      onProgress(snapshot());
    } catch (error) {
      progressErrors.push(error);
      stop();
    }
  }, 200);
  async function worker() {
    while (!controller.signal.aborted && sent < options.maxRequests) {
      if (performance.now() - start >= options.durationMs) {
        reason = "duration";
        controller.abort();
        break;
      }
      const index = ++sent;
      active++;
      const requestController = new AbortController();
      const cancel = () => requestController.abort();
      controller.signal.addEventListener("abort", cancel, { once: true });
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        requestController.abort();
      }, options.timeoutMs);
      const requestStart = performance.now();
      let status = 0;
      let outcome: RequestResult["outcome"];
      try {
        const response = await request(options.url, {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
          signal: requestController.signal,
        });
        status = response.status;
        if (response.body) {
          const reader = response.body.getReader();
          try {
            while (!(await reader.read()).done) {}
          } finally {
            reader.releaseLock();
          }
        }
        if (requestController.signal.aborted)
          throw new Error("Request aborted");
        outcome = response.ok ? "success" : "http-error";
        if (response.ok) succeeded++;
        else httpErrors++;
        latencies.push(performance.now() - requestStart);
      } catch {
        if (controller.signal.aborted) {
          outcome = "cancelled";
          cancelled++;
        } else if (timedOut) {
          outcome = "timeout";
          timeouts++;
        } else {
          outcome = "network-error";
          networkErrors++;
        }
      } finally {
        clearTimeout(timeout);
        controller.signal.removeEventListener("abort", cancel);
        active--;
      }
      recent.push({
        index,
        status,
        durationMs: performance.now() - requestStart,
        outcome,
      });
      if (recent.length > 50) recent.shift();
    }
  }
  try {
    await Promise.all(
      Array.from(
        { length: Math.min(options.concurrency, options.maxRequests) },
        worker,
      ),
    );
    if (progressErrors.length) throw progressErrors[0];
    if (reason === "running") reason = "limit";
    return snapshot();
  } finally {
    clearTimeout(deadline);
    clearInterval(progress);
    signal.removeEventListener("abort", stop);
    controller.abort();
  }
}
