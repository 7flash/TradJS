import { expect, test } from "bun:test";
import {
  mkdtempSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { matchRoute, patternToRegex, type Route } from "../src/server/router";
import { buildToDisk } from "../src/server/cli-build";

function route(pattern: string, paramNames: string[], mw: string): Route {
  return {
    pattern, pathname: pattern, paramNames,
    regex: patternToRegex(pattern), filePath: "/virtual/page.tsx",
    type: "page", layouts: [], middlewares: [mw],
  };
}
const routes = [
  route("/admin", [], "admin-auth"),
  route("/:slug", ["slug"], "public"),
  route("/*rest", ["rest"], "catchall"),
];
const pathname = (value: string) => new URL(value, "https://example.test").pathname;

test("encoded static route and trailing slash select protected middleware", () => {
  for (const request of ["/%61dmin", "/%61dmi%6E", "/admin/"]) {
    const match = matchRoute(pathname(request), routes);
    expect(match?.route.pattern).toBe("/admin");
    expect(match?.route.middlewares).toEqual(["admin-auth"]);
  }
});

test("ambiguous or malformed encoding never reaches a dynamic route", () => {
  for (const request of [
    "/abc%2Fdef", "/abc%5cdef", "/abc%00", "/%252e%252e",
    "/%252F", "/%ZZ", "/abc//def",
  ]) {
    expect(matchRoute(pathname(request), routes)).toBeNull();
  }
});

test("URL-normalized dot segments still select the final route", () => {
  const request = pathname("/ignored/%2E%2e/admin");
  expect(matchRoute(request, routes)?.route.pattern).toBe("/admin");
});

test("implicit app CSS may not resolve outside app via a symlink", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "tradjs-input-"));
  try {
    const app = path.join(root, "app");
    mkdirSync(app);
    const external = path.join(root, "external.css");
    writeFileSync(external, "body { color: red; }");
    symlinkSync(external, path.join(app, "globals.css"));
    await expect(buildToDisk({ appDir: app, outDir: path.join(root, "dist") }))
      .rejects.toThrow(/outside app directory/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI does not write through an output directory symlink", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "tradjs-output-"));
  try {
    const outside = path.join(root, "outside");
    mkdirSync(outside);
    const outDir = path.join(root, "dist");
    symlinkSync(outside, outDir, "dir");
    const entry = path.join(root, "client.ts");
    writeFileSync(entry, "export const value = 1;");
    await expect(buildToDisk({ entries: [entry], outDir }))
      .rejects.toThrow(/symlink/i);
    expect(readdirSync(outside)).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
