import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  discoverRoutes,
  filePathToPattern,
  matchRoute,
  patternToRegex,
  type Route,
} from "../src/server/router";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempApp(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "tradjs-router-"));
  tempDirs.push(dir);
  return dir;
}

describe("router contracts", () => {
  test("treats regex metacharacters in static routes literally", () => {
    const regex = patternToRegex("/releases/v1.0+stable");
    expect(regex.test("/releases/v1.0+stable")).toBe(true);
    expect(regex.test("/releases/v1x00stable")).toBe(false);
  });

  test("decodes route parameters after matching", () => {
    const route: Route = {
      filePath: "/app/items/[id]/page.tsx",
      pattern: "/items/:id",
      pathname: "/items/:id",
      paramNames: ["id"],
      regex: patternToRegex("/items/:id"),
      layouts: [],
      middlewares: [],
      type: "page",
    };

    expect(matchRoute("/items/hello%20world", [route])?.params).toEqual({
      id: "hello world",
    });
  });

  test("rejects duplicate parameter names", () => {
    expect(() => filePathToPattern("/app/[id]/[id]/page.tsx", "/app")).toThrow(
      'Duplicate route parameter "id"',
    );
  });

  test("fails for a missing app root instead of silently returning no routes", () => {
    const root = path.join(tempApp(), "missing");
    expect(() => discoverRoutes(root, { quiet: true })).toThrow(
      "Could not scan app directory",
    );
  });

  test("rejects dynamic routes with equivalent matchers", () => {
    const root = tempApp();
    for (const param of ["[id]", "[slug]"]) {
      const dir = path.join(root, param);
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, "page.ts"), "export default () => null;");
    }

    expect(() => discoverRoutes(root, { quiet: true })).toThrow(
      "Route conflict",
    );
  });

  test("orders overlapping dynamic routes by segment specificity", () => {
    const root = tempApp();
    for (const relative of ["[section]/new", "users/[id]"]) {
      const dir = path.join(root, relative);
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, "page.ts"), "export default () => null;");
    }

    const routes = discoverRoutes(root, { quiet: true });
    expect(matchRoute("/users/new", routes)?.route.pattern).toBe("/users/:id");
  });

  test("rejects route groups that collapse to the same URL", () => {
    const root = tempApp();
    for (const group of ["(a)", "(b)"]) {
      const dir = path.join(root, group);
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, "page.ts"), "export default () => null;");
    }

    expect(() => discoverRoutes(root, { quiet: true })).toThrow(
      'Route conflict for "/"',
    );
  });
});
