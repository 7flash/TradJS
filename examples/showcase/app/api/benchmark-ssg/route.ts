/**
 * SSG Benchmark API — compares steady-state SSG, cached SSR, and fresh SSR.
 *
 * The benchmark helper is intentionally independent of `measure-fn`: logging and
 * tracing inside a microbenchmark would perturb the timings we are trying to
 * compare. `measure-fn` remains the right tool for application observability;
 * this file measures repeated samples and summarizes their distribution.
 */
import { getPrerendered, setPrerendered } from "tradjs/server";
import { createElement } from "tradjs/client/render";
import { renderToString } from "tradjs/server/ssr";
import PageComponent from "../../features/ssg/page";

const ITERATIONS = 100;
const WARMUP_ITERATIONS = 10;
const SSG_PATH = "/features/ssg";
const HTML_HEADERS = { "Content-Type": "text/html" } as const;

interface BenchResult {
  method: string;
  avgMs: number;
  medianMs: number;
  p99Ms: number;
  description: string;
}

function roundMs(value: number): number {
  return Number(value.toFixed(4));
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.floor((sorted.length - 1) * fraction),
  );
  return sorted[index] ?? 0;
}

function summarize(
  method: string,
  description: string,
  samples: readonly number[],
): BenchResult {
  const sorted = [...samples].sort((a, b) => a - b);
  const avg = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;

  return {
    method,
    avgMs: roundMs(avg),
    medianMs: roundMs(percentile(sorted, 0.5)),
    p99Ms: roundMs(percentile(sorted, 0.99)),
    description,
  };
}

async function runBenchmark(
  method: string,
  description: string,
  operation: () => Promise<void>,
): Promise<BenchResult> {
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    await operation();
  }

  const samples: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    await operation();
    samples.push(performance.now() - start);
  }

  return summarize(method, description, samples);
}

function renderPageHtml(): string {
  const tree = createElement(PageComponent, {});
  return `<!DOCTYPE html>${renderToString(tree)}`;
}

async function consumeHtml(html: string): Promise<void> {
  const response = new Response(html, { headers: HTML_HEADERS });
  await response.text();
}

export async function GET() {
  if (!getPrerendered(SSG_PATH)) {
    setPrerendered(SSG_PATH, renderPageHtml());
  }

  // Warm the cached-SSR value before measuring steady-state cache serving.
  const cachedSsrHtml = renderPageHtml();

  // Run cases sequentially so they do not contend with each other and distort
  // the very timings this endpoint is trying to compare.
  const results = [
    await runBenchmark(
      "SSR (fresh)",
      "Component rendered to HTML for every request",
      async () => consumeHtml(renderPageHtml()),
    ),
    await runBenchmark(
      "Cached SSR",
      "Pre-rendered HTML string reused from an application cache",
      async () => consumeHtml(cachedSsrHtml),
    ),
    await runBenchmark(
      "SSG (memory)",
      "Pre-rendered HTML string fetched from TradJS's in-memory SSG cache",
      async () => {
        const html = getPrerendered(SSG_PATH);
        if (!html) {
          throw new Error("SSG cache unexpectedly empty during benchmark");
        }
        await consumeHtml(html);
      },
    ),
  ];

  const byMethod = Object.fromEntries(
    results.map((result) => [result.method, result]),
  );
  const ssrTime = byMethod["SSR (fresh)"]?.avgMs ?? 0;
  const cachedTime = byMethod["Cached SSR"]?.avgMs ?? 0;
  const ssgTime = byMethod["SSG (memory)"]?.avgMs ?? 0;

  return Response.json({
    iterations: ITERATIONS,
    warmupIterations: WARMUP_ITERATIONS,
    results,
    summary: {
      ssgVsSsr:
        ssgTime > 0
          ? `SSG is ${(ssrTime / ssgTime).toFixed(1)}x faster than SSR`
          : "SSG is near-instant (< measurable)",
      cachedVsSsr:
        cachedTime > 0
          ? `Cached SSR is ${(ssrTime / cachedTime).toFixed(1)}x faster than fresh SSR`
          : "Cached SSR is near-instant",
      ssgVsCached:
        ssgTime > 0 && cachedTime > 0
          ? `SSG is ${(cachedTime / ssgTime).toFixed(1)}x faster than Cached SSR`
          : "SSG and Cached SSR are both near-instant",
      note: "This compares steady-state request work after warmup. The SSG path reads TradJS's in-memory HTML cache; cached SSR reuses a local HTML string; fresh SSR re-renders the component each time.",
    },
  });
}
