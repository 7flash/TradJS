import { describe, expect, test } from "bun:test";
import {
  normalizeTarget,
  runBenchmark,
  validateOptions,
  type BenchmarkOptions,
  type RequestFunction,
} from "../examples/showcase/app/stress/benchmark";
const options: BenchmarkOptions = {
  url: "https://target.test/path?q=1",
  concurrency: 3,
  durationMs: 1000,
  timeoutMs: 500,
  maxRequests: 9,
};
const waitForAbort = ((_url: unknown, init: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init.signal!.addEventListener("abort", () => reject(new Error("aborted")), {
      once: true,
    });
  })) as RequestFunction;
describe("throughput runner", () => {
  test("accepts local and cross-origin HTTP targets, preserving queries", () => {
    expect(
      normalizeTarget("/api?q=1#part", "https://showcase.test/stress"),
    ).toBe("https://showcase.test/api?q=1");
    expect(
      normalizeTarget("https://other.test/data", "https://showcase.test"),
    ).toBe("https://other.test/data");
    expect(() =>
      normalizeTarget("javascript:alert(1)", "https://showcase.test"),
    ).toThrow("HTTP");
    expect(() =>
      normalizeTarget(
        "https://user:secret@other.test",
        "https://showcase.test",
      ),
    ).toThrow("credentials");
    expect(() => normalizeTarget(" ", "https://showcase.test")).toThrow(
      "Enter",
    );
  });
  test("validates the work bounds before making requests", () => {
    for (const value of [0, 33, NaN, 1.5])
      expect(() =>
        validateOptions({ ...options, concurrency: value }),
      ).toThrow();
    expect(() => validateOptions({ ...options, maxRequests: 10001 })).toThrow();
    expect(() =>
      validateOptions({ ...options, durationMs: Infinity }),
    ).toThrow();
  });
  test("bounds in-flight requests, drains bodies, and reports actual completions", async () => {
    let active = 0,
      maximum = 0,
      bodies = 0,
      requests = 0;
    const request = (async (url: unknown, init: RequestInit) => {
      expect(url).toBe(options.url);
      expect(init.cache).toBe("no-store");
      expect(init.credentials).toBe("same-origin");
      active++;
      requests++;
      maximum = Math.max(maximum, active);
      return new Response(
        new ReadableStream({
          start(controller) {
            setTimeout(() => {
              controller.enqueue(new Uint8Array([1]));
              controller.close();
              active--;
              bodies++;
            }, 20);
          },
        }),
        { status: requests % 3 === 0 ? 503 : 200 },
      );
    }) as RequestFunction;
    const result = await runBenchmark(
      options,
      new AbortController().signal,
      undefined,
      request,
    );
    expect(maximum).toBe(3);
    expect(active).toBe(0);
    expect(bodies).toBe(9);
    expect(result.sent).toBe(9);
    expect(result.succeeded).toBe(6);
    expect(result.httpErrors).toBe(3);
    expect(result.reason).toBe("limit");
    expect(result.p50Ms).toBeGreaterThanOrEqual(15);
    expect(result.successfulPerSecond).toBeCloseTo(6000 / result.elapsedMs);
  });
  test("classifies unreadable responses separately from HTTP failures", async () => {
    const request = (async () => {
      throw new TypeError("Failed to fetch");
    }) as RequestFunction;
    const result = await runBenchmark(
      options,
      new AbortController().signal,
      undefined,
      request,
    );
    expect(result.networkErrors).toBe(9);
    expect(result.httpErrors).toBe(0);
    expect(result.successfulPerSecond).toBe(0);
    expect(result.p95Ms).toBe(0);
  });
  test("request timeouts terminate hanging requests", async () => {
    const result = await runBenchmark(
      { ...options, timeoutMs: 100, maxRequests: 3 },
      new AbortController().signal,
      undefined,
      waitForAbort,
    );
    expect(result.timeouts).toBe(3);
    expect(result.cancelled).toBe(0);
    expect(result.active).toBe(0);
  });
  test("duration ends a run and aborts active requests", async () => {
    const result = await runBenchmark(
      { ...options, durationMs: 100 },
      new AbortController().signal,
      undefined,
      waitForAbort,
    );
    expect(result.reason).toBe("duration");
    expect(result.cancelled).toBe(3);
    expect(result.sent).toBe(3);
  });
  test("Stop aborts every worker without launching replacements", async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20);
    try {
      const result = await runBenchmark(
        options,
        controller.signal,
        undefined,
        waitForAbort,
      );
      expect(result.reason).toBe("stopped");
      expect(result.cancelled).toBe(3);
      expect(result.sent).toBe(3);
    } finally {
      clearTimeout(timer);
    }
  });
  test("an already stopped run makes no requests", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await runBenchmark(
      options,
      controller.signal,
      undefined,
      (() => {
        throw new Error("must not run");
      }) as RequestFunction,
    );
    expect(result.sent).toBe(0);
    expect(result.reason).toBe("stopped");
  });
  test("retains bounded logs while counting every response", async () => {
    const result = await runBenchmark(
      { ...options, maxRequests: 75 },
      new AbortController().signal,
      undefined,
      (async () => new Response(null, { status: 204 })) as RequestFunction,
    );
    expect(result.succeeded).toBe(75);
    expect(result.recent.length).toBe(50);
  });
  test("a progress failure stops the run and reaches the caller", async () => {
    await expect(
      runBenchmark(
        options,
        new AbortController().signal,
        () => {
          throw new Error("progress failed");
        },
        waitForAbort,
      ),
    ).rejects.toThrow("progress failed");
  });
});
