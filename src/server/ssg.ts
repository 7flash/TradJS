import { ssgMeasure } from "./measure";
import type { Route } from "./router";
export interface SSGEntry {
  html: string;
  renderedAt: number;
  revalidateMs?: number;
}
export interface SSGConfig {
  revalidateMs?: number;
}
export interface SSGCache {
  get(pathname: string): string | null;
  set(pathname: string, html: string, revalidateMs?: number): void;
  getOrRender(
    pathname: string,
    render: () => Promise<string>,
    revalidateMs?: number,
  ): Promise<string>;
  clear(): void;
}
let globalEpoch = 0;
export function resolveSSGConfig(value: unknown): SSGConfig | null {
  if (value == null || value === false) return null;
  if (value === true) return {};
  if (typeof value !== "object" || Array.isArray(value))
    throw new Error("ssg must be true, false, or { revalidate: seconds }.");
  const seconds = (
    value as {
      revalidate?: unknown;
    }
  ).revalidate;
  if (seconds === undefined) return {};
  if (
    typeof seconds !== "number" ||
    !Number.isFinite(seconds) ||
    seconds < 0 ||
    seconds > Number.MAX_SAFE_INTEGER / 1000
  ) {
    throw new Error(
      "ssg.revalidate must be a finite, non-negative number of seconds.",
    );
  }
  return seconds === 0 ? null : { revalidateMs: seconds * 1000 };
}
export function createSSGCache(): SSGCache {
  const entries = new Map<string, SSGEntry>();
  const inFlight = new Map<string, Promise<string>>();
  let epoch = globalEpoch;
  let generation = 0;
  function clear() {
    entries.clear();
    inFlight.clear();
    generation++;
  }
  function sync() {
    if (epoch !== globalEpoch) {
      epoch = globalEpoch;
      clear();
    }
  }
  function get(pathname: string): string | null {
    sync();
    const entry = entries.get(pathname);
    if (!entry) return null;
    if (
      entry.revalidateMs !== undefined &&
      Date.now() - entry.renderedAt >= entry.revalidateMs
    ) {
      entries.delete(pathname);
      return null;
    }
    return entry.html;
  }
  function set(pathname: string, html: string, revalidateMs?: number): void {
    sync();
    if (
      revalidateMs !== undefined &&
      (!Number.isFinite(revalidateMs) || revalidateMs < 0)
    )
      throw new Error("Invalid SSG cache TTL.");
    entries.set(pathname, { html, renderedAt: Date.now(), revalidateMs });
  }
  async function getOrRender(
    pathname: string,
    render: () => Promise<string>,
    ttl?: number,
  ): Promise<string> {
    const cached = get(pathname);
    if (cached !== null) return cached;
    const pending = inFlight.get(pathname);
    if (pending) return pending;
    const startedGeneration = generation,
      startedEpoch = epoch;
    const task = Promise.resolve()
      .then(render)
      .then((html) => {
        sync();
        if (generation === startedGeneration && epoch === startedEpoch)
          set(pathname, html, ttl);
        return html;
      });
    inFlight.set(pathname, task);
    try {
      return await task;
    } finally {
      if (inFlight.get(pathname) === task) inFlight.delete(pathname);
    }
  }
  return { get, set, getOrRender, clear };
}
const standalone = createSSGCache();
export function getPrerendered(pathname: string): string | null {
  return standalone.get(pathname);
}
export function setPrerendered(
  pathname: string,
  html: string,
  revalidateMs?: number,
): void {
  standalone.set(pathname, html, revalidateMs);
}
export function clearSSGCache(): void {
  globalEpoch++;
}
export async function prerender(
  routes: Route[],
  renderRoute: (route: Route) => Promise<string>,
  cache: SSGCache = standalone,
): Promise<number> {
  return ssgMeasure.measure(
    {
      start: () => "SSG pre-render",
      end: (count: number) => ({ pages: count }),
      catch: (error: unknown) => {
        throw error;
      },
    },
    async () => {
      let count = 0;
      for (const route of routes) {
        if (route.type === "api" || route.paramNames.length) continue;
        try {
          const mod = await import(route.filePath);
          const config = resolveSSGConfig(mod.ssg);
          if (!config) continue;
          await cache.getOrRender(
            route.pattern,
            () => renderRoute(route),
            config.revalidateMs,
          );
          count++;
        } catch (error) {
          console.warn(
            `[tradjs] SSG route ${route.pattern} left dynamic after failure:`,
            error,
          );
        }
      }
      return count;
    },
  );
}
