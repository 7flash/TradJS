/**
 * SSG — Static Site Generation (Memory-Served)
 * 
 * Pre-renders pages at startup and stores the HTML in the `builtAssets` map.
 * Pages are served from memory (zero syscalls) instead of re-running SSR on every request.
 * 
 * Features:
 * - Pre-render all static (non-dynamic) routes at startup
 * - Store rendered HTML in memory-served `builtAssets`
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

import { builtAssets } from "./build";
import { ssgMeasure } from './measure';
import type { Route } from "./router";

// ─── Pre-rendered Page Cache ────────────────────────────────────────────────────

export interface SSGEntry {
    html: string;
    renderedAt: number;
    revalidateMs?: number; // optional TTL for stale-while-revalidate
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
export function setPrerendered(pathname: string, html: string, revalidateMs?: number): void {
    ssgCache.set(pathname, {
        html,
        renderedAt: Date.now(),
        revalidateMs,
    });

    // Also store in builtAssets for direct serving from the asset pipeline
    const content = new TextEncoder().encode(html).buffer as ArrayBuffer;
    builtAssets[`__ssg:${pathname}`] = { content, contentType: 'text/html' };
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
    return await ssgMeasure.measure('SSG pre-render', async () => {
        let count = 0;

        for (const route of routes) {
            // Skip API routes
            if (route.type === 'api') continue;

            // Skip dynamic routes (have parameters)
            if (route.paramNames.length > 0) continue;

            // Check if page opts in to SSG
            try {
                const mod = await import(route.filePath);
                const ssgConfig = mod.ssg;

                if (!ssgConfig) continue; // Page must export `ssg = true` or `ssg = { revalidate: N }`

                const revalidateMs = typeof ssgConfig === 'object' ? (ssgConfig.revalidate ?? 0) * 1000 : undefined;

                const html = await ssgMeasure.measure(`Route: ${route.pattern}`, () => renderRoute(route));
                if (html) {
                    setPrerendered(route.pattern, html, revalidateMs);
                    count++;
                }
            } catch (e: any) {
                console.warn(`   ⚠ Failed to pre-render ${route.pattern}:`, e.message);
            }
        }

        return count;
    });
}

/**
 * Clear all pre-rendered pages (useful for dev mode or cache invalidation).
 */
export function clearSSGCache(): void {
    for (const [key] of ssgCache) {
        delete builtAssets[`__ssg:${key}`];
    }
    ssgCache.clear();
}