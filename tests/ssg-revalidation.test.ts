import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const routerUrl = new URL("../src/server/app-router.ts", import.meta.url).href;
const renderUrl = new URL("../src/client/render.ts", import.meta.url).href;

function runProduction(withMiddleware: boolean, checks: string): void {
  const root = mkdtempSync(join(tmpdir(), "tradjs-ssg-"));
  const appDir = join(root, "app");
  try {
    mkdirSync(appDir);
    writeFileSync(
      join(appDir, "page.ts"),
      `import { createElement } from ${JSON.stringify(renderUrl)};
export const ssg = { revalidate: 2 };
export default async function Page() {
  const count = (globalThis.__renders = (globalThis.__renders ?? 0) + 1);
  await Bun.sleep(20);
  return createElement("html", {},
    createElement("head", {}),
    createElement("body", {}, "render-" + count));
}`,
    );
    if (withMiddleware) {
      writeFileSync(
        join(appDir, "middleware.ts"),
        `export default function middleware(req: Request) {
  globalThis.__middlewareRuns = (globalThis.__middlewareRuns ?? 0) + 1;
  if (req.headers.get("x-deny") === "yes")
    return new Response("denied", { status: 403 });
}`,
      );
    }

    const script = `
import assert from "node:assert/strict";
import { createAppRouter } from ${JSON.stringify(routerUrl)};
let now = 10000;
Date.now = () => now;
const router = createAppRouter({ appDir: ${JSON.stringify(appDir)}, viewTransitions: false });
const request = (headers = {}) => router(new Request("http://localhost/", { headers }));
${checks}
console.log("SSG_CHECKS_OK");
`;
    const result = Bun.spawnSync(["bun", "-e", script], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: "production" },
    });
    const stdout = new TextDecoder().decode(result.stdout);
    const stderr = new TextDecoder().decode(result.stderr);
    expect(result.exitCode, `${stderr}\n${stdout}`).toBe(0);
    expect(stdout).toContain("SSG_CHECKS_OK");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("expired SSG pages refill once, including simultaneous misses", () => {
  runProduction(false, `
const first = await request();
assert.equal(first.headers.get("x-tradjs-ssg"), "1");
const header = first.headers.get("cache-control") ?? "";
assert.match(header, /^public, max-age=\\d+$/);
assert.ok(Number(header.split("=")[1]) <= 2);
const initial = await first.text();
assert.match(initial, /render-1/);
assert.equal(await (await request()).text(), initial);
assert.equal(globalThis.__renders, 1);
now += 2000;
const responses = await Promise.all(Array.from({ length: 10 }, () => request()));
const bodies = await Promise.all(responses.map((r) => r.text()));
assert.equal(new Set(bodies).size, 1);
assert.match(bodies[0], /render-2/);
assert.ok(responses.every((r) => r.headers.get("x-tradjs-ssg") === "1"));
assert.equal(globalThis.__renders, 2);
assert.equal(await (await request()).text(), bodies[0]);
assert.equal(globalThis.__renders, 2);
now += 2000;
assert.match(await (await request()).text(), /render-3/);
assert.equal(globalThis.__renders, 3);
`);
});

test("middleware runs before SSG hits and misses; its cache is private", () => {
  runProduction(true, `
const denied = await request({ "x-deny": "yes" });
assert.equal(denied.status, 403);
assert.equal(denied.headers.get("x-tradjs-ssg"), null);
const first = await request();
assert.match(await first.text(), /render-1/);
const header = first.headers.get("cache-control") ?? "";
assert.match(header, /^private, max-age=\\d+$/);
assert.ok(Number(header.split("=")[1]) <= 2);
assert.match(await (await request()).text(), /render-1/);
assert.equal((await request({ "x-deny": "yes" })).status, 403);
assert.equal(globalThis.__renders, 1);
now += 2000;
assert.match(await (await request()).text(), /render-2/);
assert.equal(globalThis.__renders, 2);
assert.equal(globalThis.__middlewareRuns, 5);
`);
});

