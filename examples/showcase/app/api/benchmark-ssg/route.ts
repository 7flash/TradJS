/**
 * SSG Benchmark API — compares SSG vs SSR vs Cached SSR response times
 *
 * Works in both dev and prod mode by manually populating the SSG cache
 * if it's empty (dev mode skips pre-render).
 */
import { getPrerendered, setPrerendered } from "tradjs/server";

export async function GET(req: Request) {
  const iterations = 100;
  const results: {
    method: string;
    avgMs: number;
    medianMs: number;
    p99Ms: number;
    description: string;
  }[] = [];

  // Pre-populate SSG cache if empty (dev mode doesn't pre-render)
  if (!getPrerendered("/features/ssg")) {
    const { createElement } = await import("tradjs/client/render");
    const { renderToString } = await import("tradjs/server/ssr");
    const mod = await import("../../features/ssg/page");
    const tree = createElement(mod.default, {});
    const html = `<!DOCTYPE html>${renderToString(tree)}`;
    setPrerendered("/features/ssg", html);
  }

  // ── Benchmark 1: SSR (fresh render every time) ───────────────────────
  {
    const { createElement } = await import("tradjs/client/render");
    const { renderToString } = await import("tradjs/server/ssr");
    const mod = await import("../../features/ssg/page");

    const times: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      const PageComponent = mod.default;
      const tree = createElement(PageComponent, {});
      const html = renderToString(tree);
      const response = new Response(`<!DOCTYPE html>${html}`, {
        headers: { "Content-Type": "text/html" },
      });
      await response.text();
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    results.push({
      method: "SSR (fresh)",
      avgMs: +(times.reduce((a, b) => a + b) / times.length).toFixed(4),
      medianMs: +times[Math.floor(times.length / 2)].toFixed(4),
      p99Ms: +times[Math.floor(times.length * 0.99)].toFixed(4),
      description: "Component re-rendered to HTML on every request",
    });
  }

  // ── Benchmark 2: Cached SSR (render once, serve from JS string) ──────
  {
    const { createElement } = await import("tradjs/client/render");
    const { renderToString } = await import("tradjs/server/ssr");

    let cache: string | null = null;
    const times: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      if (!cache) {
        const mod = await import("../../features/ssg/page");
        const tree = createElement(mod.default, {});
        cache = `<!DOCTYPE html>${renderToString(tree)}`;
      }
      const response = new Response(cache, {
        headers: { "Content-Type": "text/html" },
      });
      await response.text();
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    results.push({
      method: "Cached SSR",
      avgMs: +(times.reduce((a, b) => a + b) / times.length).toFixed(4),
      medianMs: +times[Math.floor(times.length / 2)].toFixed(4),
      p99Ms: +times[Math.floor(times.length * 0.99)].toFixed(4),
      description: "First render cached as string, re-served from JS variable",
    });
  }

  // ── Benchmark 3: SSG (memory-served ArrayBuffer) ─────────────────────
  {
    const times: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      const html = getPrerendered("/features/ssg");
      if (html) {
        const response = new Response(html, {
          headers: { "Content-Type": "text/html" },
        });
        await response.text();
      }
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    results.push({
      method: "SSG (memory)",
      avgMs: +(times.reduce((a, b) => a + b) / times.length).toFixed(4),
      medianMs: +times[Math.floor(times.length / 2)].toFixed(4),
      p99Ms: +times[Math.floor(times.length * 0.99)].toFixed(4),
      description:
        "Pre-rendered HTML served from memory (ArrayBuffer in builtAssets)",
    });
  }

  // ── Summary ─────────────────────────────────────────────────────────
  const ssrTime = results[0].avgMs;
  const cachedTime = results[1].avgMs;
  const ssgTime = results[2].avgMs;

  return Response.json({
    iterations,
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
      note: "SSG stores the full HTML as an ArrayBuffer in builtAssets at startup. Cached SSR stores the HTML as a JS string. Fresh SSR re-runs the component on every request. SSG avoids per-request string allocation entirely.",
    },
  });
}
