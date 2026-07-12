/**
 * melina.js router tests
 *
 * Tests the file-system routing engine — the core of Melina's
 * Next.js-style file routing. Pure logic, no server needed.
 *
 * Run: bun test src/server/router.test.ts
 */
import { describe, expect, mock, test } from "bun:test";
import {
  filePathToPattern,
  patternToRegex,
  matchRoute,
  discoverRoutes,
} from "./router";
import type { Route } from "./router";
import path from "path";

// ─── filePathToPattern ──────────────────────────────────

describe("filePathToPattern", () => {
  const appDir = "/project/app";

  test("root page → /", () => {
    const result = filePathToPattern("/project/app/page.tsx", appDir);
    expect(result.pattern).toBe("/");
    expect(result.paramNames).toEqual([]);
  });

  test("nested page → /about", () => {
    const result = filePathToPattern("/project/app/about/page.tsx", appDir);
    expect(result.pattern).toBe("/about");
    expect(result.paramNames).toEqual([]);
  });

  test("deep nested → /docs/api/reference", () => {
    const result = filePathToPattern(
      "/project/app/docs/api/reference/page.tsx",
      appDir,
    );
    expect(result.pattern).toBe("/docs/api/reference");
  });

  test("dynamic segment → /posts/:id", () => {
    const result = filePathToPattern(
      "/project/app/posts/[id]/page.tsx",
      appDir,
    );
    expect(result.pattern).toBe("/posts/:id");
    expect(result.paramNames).toEqual(["id"]);
  });

  test("multiple dynamic segments → /blog/:year/:month", () => {
    const result = filePathToPattern(
      "/project/app/blog/[year]/[month]/page.tsx",
      appDir,
    );
    expect(result.pattern).toBe("/blog/:year/:month");
    expect(result.paramNames).toEqual(["year", "month"]);
  });

  test("route group (marketing) is stripped from URL", () => {
    const result = filePathToPattern(
      "/project/app/(marketing)/pricing/page.tsx",
      appDir,
    );
    expect(result.pattern).toBe("/pricing");
    expect(result.paramNames).toEqual([]);
  });

  test("handles .ts extension", () => {
    const result = filePathToPattern("/project/app/api/health/page.ts", appDir);
    expect(result.pattern).toBe("/api/health");
  });

  test("handles route.ts (API route)", () => {
    const result = filePathToPattern("/project/app/api/users/route.ts", appDir);
    expect(result.pattern).toBe("/api/users");
  });
});

// ─── patternToRegex ─────────────────────────────────────

describe("patternToRegex", () => {
  test("root pattern matches /", () => {
    const regex = patternToRegex("/");
    expect("/".match(regex)).toBeTruthy();
    expect("/about".match(regex)).toBeFalsy();
  });

  test("static pattern matches exact path", () => {
    const regex = patternToRegex("/about");
    expect("/about".match(regex)).toBeTruthy();
    expect("/about/us".match(regex)).toBeFalsy();
    expect("/".match(regex)).toBeFalsy();
  });

  test("dynamic pattern captures parameter", () => {
    const regex = patternToRegex("/posts/:id");
    const match = "/posts/123".match(regex);
    expect(match).toBeTruthy();
    expect(match![1]).toBe("123");
  });

  test("multiple params captured in order", () => {
    const regex = patternToRegex("/blog/:year/:month");
    const match = "/blog/2026/03".match(regex);
    expect(match).toBeTruthy();
    expect(match![1]).toBe("2026");
    expect(match![2]).toBe("03");
  });

  test("dynamic segment does not match slashes", () => {
    const regex = patternToRegex("/posts/:id");
    expect("/posts/1/extra".match(regex)).toBeFalsy();
  });
});

// ─── matchRoute ─────────────────────────────────────────

describe("matchRoute", () => {
  // Create test routes
  function makeRoute(pattern: string, paramNames: string[] = []): Route {
    return {
      filePath: `app${pattern || "/"}/page.tsx`,
      pattern,
      pathname: pattern,
      paramNames,
      regex: patternToRegex(pattern),
      layouts: [],
      middlewares: [],
      type: "page",
    };
  }

  const routes: Route[] = [
    makeRoute("/about"),
    makeRoute("/posts/:id", ["id"]),
    makeRoute("/docs/*slug", ["slug"]),
    makeRoute("/blog/:year/:month", ["year", "month"]),
    makeRoute("/"),
  ];

  test("matches static route", () => {
    const result = matchRoute("/about", routes);
    expect(result).not.toBeNull();
    expect(result!.route.pattern).toBe("/about");
    expect(result!.params).toEqual({});
  });

  test("matches dynamic route and extracts params", () => {
    const result = matchRoute("/posts/42", routes);
    expect(result).not.toBeNull();
    expect(result!.route.pattern).toBe("/posts/:id");
    expect(result!.params).toEqual({ id: "42" });
  });

  test("extracts multiple params", () => {
    const result = matchRoute("/blog/2026/03", routes);
    expect(result).not.toBeNull();
    expect(result!.params).toEqual({ year: "2026", month: "03" });
  });

  test("matches root", () => {
    const result = matchRoute("/", routes);
    expect(result).not.toBeNull();
    expect(result!.route.pattern).toBe("/");
  });

  test("returns null for unmatched path", () => {
    const result = matchRoute("/nonexistent", routes);
    expect(result).toBeNull();
  });

  test("params work with slug-style values", () => {
    const result = matchRoute("/posts/hello-world-2026", routes);
    expect(result).not.toBeNull();
    expect(result!.params.id).toBe("hello-world-2026");
  });

  test("static route takes priority over dynamic at same level", () => {
    // This is the exact bug from WARMAPS: /api/telegram/connect (static)
    // was shadowed by /api/telegram/:action (dynamic)
    const mixedRoutes: Route[] = [
      // Dynamic route discovered first (filesystem: [action] < connect)
      makeRoute("/api/telegram/:action", ["action"]),
      // Static route discovered second
      makeRoute("/api/telegram/connect"),
      makeRoute("/api/telegram/disconnect"),
      makeRoute("/api/telegram/status"),
    ];

    // After sorting, static should come before dynamic
    mixedRoutes.sort((a, b) => {
      const aCatchAll = a.pattern.includes("*");
      const bCatchAll = b.pattern.includes("*");
      const aStatic = !a.pattern.includes(":") && !aCatchAll;
      const bStatic = !b.pattern.includes(":") && !bCatchAll;
      if (aStatic && !bStatic) return -1;
      if (!aStatic && bStatic) return 1;
      if (aCatchAll && !bCatchAll) return 1;
      if (!aCatchAll && bCatchAll) return -1;
      const aDepth = a.pattern.split("/").length;
      const bDepth = b.pattern.split("/").length;
      return bDepth - aDepth;
    });

    // /api/telegram/connect should match the STATIC route, not :action
    const connectResult = matchRoute("/api/telegram/connect", mixedRoutes);
    expect(connectResult).not.toBeNull();
    expect(connectResult!.route.pattern).toBe("/api/telegram/connect");
    expect(connectResult!.params).toEqual({});

    // /api/telegram/disconnect should also match static
    const disconnectResult = matchRoute(
      "/api/telegram/disconnect",
      mixedRoutes,
    );
    expect(disconnectResult).not.toBeNull();
    expect(disconnectResult!.route.pattern).toBe("/api/telegram/disconnect");

    // /api/telegram/reconnect should fall to dynamic since no static exists
    const reconnectResult = matchRoute("/api/telegram/reconnect", mixedRoutes);
    expect(reconnectResult).not.toBeNull();
    expect(reconnectResult!.route.pattern).toBe("/api/telegram/:action");
    expect(reconnectResult!.params).toEqual({ action: "reconnect" });
  });
});

// ─── discoverRoutes (integration) ───────────────────────

describe("discoverRoutes", () => {
  test("returns empty for non-existent directory", () => {
    const routes = discoverRoutes("/tmp/melina-test-nonexistent-dir");
    expect(routes).toEqual([]);
  });

  test("discovers routes from real app directory", () => {
    // Use melina.js's own test fixtures or the starwar app
    const appDir = path.resolve(import.meta.dir, "../../../app");
    // This is the melina.js source itself — it may not have pages
    // We just verify it doesn't crash
    const routes = discoverRoutes(appDir);
    expect(Array.isArray(routes)).toBe(true);
  });

  test("supports quiet discovery without measurement logging", () => {
    const appDir = path.resolve(import.meta.dir, "../../../app");
    const originalLog = console.log;
    const logSpy = mock(() => undefined);
    console.log = logSpy as any;

    try {
      const routes = discoverRoutes(appDir, { quiet: true });
      expect(Array.isArray(routes)).toBe(true);
      expect(logSpy).not.toHaveBeenCalled();
    } finally {
      console.log = originalLog;
    }
  });
});
