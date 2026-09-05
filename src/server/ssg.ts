/**
 * SSG — Static Site Generation (Memory-Served)
 *
 * Pre-renders pages at startup and stores HTML in an in-memory page cache.
 * App-router responses can reuse that HTML instead of re-running SSR on every request.
 *
 * Features:
 * - Pre-render all static (non-dynamic) routes at startup
 * - Store rendered HTML in a route-aware in-memory cache
 * - Skip dynamic routes ([id]) unless explicitly configured
 * - Dev mode: bypass cache for fresh renders
 * - Page exports `ssg = true` or `ssg = { revalidate: 60 }` to opt in
 *
 * @example
 * ```tsx
 * // app/about/page.tsx
 * export const ssg = true; // Pre-render at startup
 *
 * export default function AboutPage() {
 *   return <main><h1>About Us</h1></main>;
 * }
 * ```
 */

import { errorMessage } from "./errors";
import { measureNote, measureRequired, ssgMeasure } from "./measure";
import type { Route } from "./router";

// ─── Pre-rendered Page Cache ────────────────────────────────────────────────────

export interface SSGEntry {
  html: string;
  renderedAt: number;
  revalidateMs?: number; // optional freshness TTL; stale entries are evicted on read
}

const ssgCache = new Map<string, SSGEntry>();

/**
 * Check if a pre-rendered page exists and is still fresh.
 * Returns the HTML string if cached and valid, otherwise null.
 */
export function getPrerendered(pathname: string): string | null {
  const entry = ssgCache.get(pathname);
  if (!entry) return null;

  // Check TTL if configured
  if (entry.revalidateMs) {
    const age = Date.now() - entry.renderedAt;
    if (age > entry.revalidateMs) {
      ssgCache.delete(pathname);
      return null;
    }
  }

  return entry.html;
}

/**
 * Store a pre-rendered page in memory.
 */
export function setPrerendered(
  pathname: string,
  html: string,
  revalidateMs?: number,
): void {
  ssgCache.set(pathname, {
    html,
    renderedAt: Date.now(),
    revalidateMs,
  });
}

/**
 * Pre-render all eligible routes at startup.
 * Call this with the discovered routes and a render function.
 *
 * @param routes - Discovered routes from discoverRoutes()
 * @param renderRoute - Function that renders a route to HTML (provided by app-router)
 * @returns Number of pages pre-rendered
 */
export async function prerender(
  routes: Route[],
  renderRoute: (route: Route) => Promise<string>,
): Promise<number> {
  return measureRequired(
    ssgMeasure,
    {
      label: "SSG pre-render",
      routes: routes.length,
      result: (count: number) => ({ pages: count }),
    },
    async () => {
      let count = 0;

      for (const route of routes) {
        // API and dynamic routes cannot be safely pre-rendered without inputs.
        if (route.type === "api" || route.paramNames.length > 0) continue;

        try {
          const mod = await measureRequired(
            ssgMeasure,
            {
              label: "Read SSG config",
              route: route.pattern,
              result: (value: Record<string, unknown>) => ({
                enabled: Boolean(value.ssg),
              }),
            },
            () => import(route.filePath),
          );
          const ssgConfig = mod.ssg;
          if (!ssgConfig) continue;

          const revalidateSeconds =
            typeof ssgConfig === "object" && ssgConfig !== null
              ? Number(ssgConfig.revalidate ?? 0)
              : 0;
          const revalidateMs =
            Number.isFinite(revalidateSeconds) && revalidateSeconds > 0
              ? revalidateSeconds * 1000
              : undefined;

          const html = await measureRequired(
            ssgMeasure,
            {
              label: "Render route",
              route: route.pattern,
              result: (value: string) => ({ bytes: value.length }),
            },
            () => renderRoute(route),
          );

          setPrerendered(route.pattern, html, revalidateMs);
          count++;
        } catch (error) {
          await measureNote(ssgMeasure, {
            label: "SSG route skipped after failure",
            route: route.pattern,
            reason: errorMessage(error),
          });
        }
      }

      return count;
    },
  );
}

/**
 * Clear all pre-rendered pages (useful for dev mode or cache invalidation).
 */
export function clearSSGCache(): void {
  ssgCache.clear();
}
