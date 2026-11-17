import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppRouter } from "../src/server/app-router";

const tempDirs: string[] = [];

async function makeApp(source: string) {
  const appDir = await mkdtemp(join(tmpdir(), "tradjs-api-"));
  tempDirs.push(appDir);
  const routeDir = join(appDir, "api", "x");
  await mkdir(routeDir, { recursive: true });
  await writeFile(join(routeDir, "route.ts"), source);
  return await createAppRouter({ appDir });
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

test("HEAD falls back to GET and returns no body", async () => {
  const app = await makeApp(`
    export function GET() {
      return new Response("get body", {
        headers: { "X-Route": "get" },
      });
    }
  `);
  const response = await app(new Request("http://localhost/api/x", {
    method: "HEAD",
  }));

  expect(response.status).toBe(200);
  expect(response.headers.get("X-Route")).toBe("get");
  expect(await response.text()).toBe("");
});

test("OPTIONS returns 204 and lists exported methods", async () => {
  const app = await makeApp(`
    export function GET() { return "get"; }
    export function POST() { return "post"; }
  `);
  const response = await app(new Request("http://localhost/api/x", {
    method: "OPTIONS",
  }));

  expect(response.status).toBe(204);
  expect(response.headers.get("Allow")).toBe("GET, POST, HEAD, OPTIONS");
  expect(await response.text()).toBe("");
});

test("unsupported methods return 405 with Allow", async () => {
  const app = await makeApp(`
    export function GET() { return "get"; }
    export function POST() { return "post"; }
  `);
  const response = await app(new Request("http://localhost/api/x", {
    method: "DELETE",
  }));

  expect(response.status).toBe(405);
  expect(response.headers.get("Allow")).toBe("GET, POST, HEAD, OPTIONS");
});

test("request method matching is case-insensitive", async () => {
  const app = await makeApp(`
    export function GET() { return new Response("matched"); }
  `);
  const request = new Request("http://localhost/api/x");
  Object.defineProperty(request, "method", { value: "gEt" });
  const response = await app(request);

  expect(response.status).toBe(200);
  expect(await response.text()).toBe("matched");
});

test("an exported OPTIONS handler (CORS preflight) is not overridden", async () => {
  const app = await makeApp(`
    export function GET() { return new Response("ok"); }
    export function OPTIONS() {
      return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*" } });
    }
  `);
  const response = await app(new Request("http://localhost/api/x", { method: "OPTIONS" }));
  expect(response.status).toBe(204);
  expect(response.headers.get("access-control-allow-origin")).toBe("*");
});
