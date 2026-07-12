import path from "path";
import { discoverRoutes, matchRoute } from "./router";

export interface RouteExpectation {
  pathname: string;
  pattern: string;
  params?: Record<string, string>;
}

export function discoverContractRoutes(appDir: string) {
  return discoverRoutes(path.resolve(appDir), { quiet: true });
}

export function assertRouteExpectation(
  routes: ReturnType<typeof discoverRoutes>,
  expectation: RouteExpectation,
) {
  const result = matchRoute(expectation.pathname, routes);
  if (!result) {
    throw new Error(
      `Expected route for ${expectation.pathname}, but none matched`,
    );
  }
  if (result.route.pattern !== expectation.pattern) {
    throw new Error(
      `Expected ${expectation.pathname} to match ${expectation.pattern}, got ${result.route.pattern}`,
    );
  }
  if (expectation.params) {
    const actual = JSON.stringify(result.params);
    const expected = JSON.stringify(expectation.params);
    if (actual !== expected) {
      throw new Error(
        `Expected params ${expected} for ${expectation.pathname}, got ${actual}`,
      );
    }
  }
  return result;
}

export const catchAllRoutingContract: RouteExpectation[] = [
  { pathname: "/", pattern: "/" },
  { pathname: "/galaxy-canvas", pattern: "/galaxy-canvas" },
  { pathname: "/api/version", pattern: "/api/version" },
  { pathname: "/starwar", pattern: "/*slug", params: { slug: "starwar" } },
  {
    pathname: "/team/platform/tools/gitmaps",
    pattern: "/*slug",
    params: { slug: "team/platform/tools/gitmaps" },
  },
];
