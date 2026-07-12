/**
 * melina/server — Router Unit Tests
 *
 * Tests file-based route discovery and route matching.
 * Uses the showcase app as a real fixture.
 *
 * Run: bun test tests/router.test.ts
 */

import { describe, test, expect } from "bun:test";
import { discoverRoutes, matchRoute } from "../src/server/router";
import path from "path";

const showcaseDir = path.join(
  import.meta.dir,
  "..",
  "examples",
  "showcase",
  "app",
);

describe("Route Discovery", () => {
  let routes: Awaited<ReturnType<typeof discoverRoutes>>;

  test("discovers routes from showcase app", async () => {
    routes = await discoverRoutes(showcaseDir);
    expect(routes.length).toBeGreaterThan(0);
  });

  test("finds home page route", async () => {
    routes = await discoverRoutes(showcaseDir);
    const home = routes.find((r) => r.pattern === "/");
    expect(home).toBeDefined();
    expect(home!.type).toBe("page");
  });

  test("finds API routes", async () => {
    routes = await discoverRoutes(showcaseDir);
    const apiRoutes = routes.filter((r) => r.type === "api");
    expect(apiRoutes.length).toBeGreaterThan(0);

    const benchmarkApi = apiRoutes.find((r) =>
      r.pattern.includes("benchmark-ssg"),
    );
    expect(benchmarkApi).toBeDefined();
  });

  test("finds nested page routes", async () => {
    routes = await discoverRoutes(showcaseDir);
    const patterns = routes.map((r) => r.pattern);

    expect(patterns).toContain("/counter");
    expect(patterns).toContain("/features/ssg");
  });

  test("associates layouts with routes", async () => {
    routes = await discoverRoutes(showcaseDir);
    const home = routes.find((r) => r.pattern === "/");
    expect(home).toBeDefined();
    expect(home!.layouts.length).toBeGreaterThan(0);
  });
});

describe("Route Matching", () => {
  let routes: Awaited<ReturnType<typeof discoverRoutes>>;

  test("matches exact routes", async () => {
    routes = await discoverRoutes(showcaseDir);

    const match = matchRoute("/", routes);
    expect(match).not.toBeNull();
    expect(match!.route.pattern).toBe("/");
  });

  test("matches nested routes", async () => {
    routes = await discoverRoutes(showcaseDir);

    const match = matchRoute("/counter", routes);
    expect(match).not.toBeNull();
    expect(match!.route.pattern).toBe("/counter");
  });

  test("returns null for non-existent routes", async () => {
    routes = await discoverRoutes(showcaseDir);

    const match = matchRoute("/this-does-not-exist", routes);
    expect(match).toBeNull();
  });

  test("matches API routes", async () => {
    routes = await discoverRoutes(showcaseDir);

    const match = matchRoute("/api/benchmark-ssg", routes);
    expect(match).not.toBeNull();
    expect(match!.route.type).toBe("api");
  });
});
