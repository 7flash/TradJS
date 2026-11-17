import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppRouter } from "../src/server/app-router";

let appDir = "";
const hits: string[] = [];
(globalThis as any).__csrfHits = hits;

beforeAll(async () => {
  appDir = await mkdtemp(join(tmpdir(), "tradjs-csrf-"));
  await mkdir(join(appDir, "api", "transfer"), { recursive: true });
  await writeFile(join(appDir, "middleware.ts"),
    "export default function mw() { (globalThis as any).__csrfHits.push('middleware'); }");
  await writeFile(join(appDir, "api", "transfer", "route.ts"),
    "export function POST() { (globalThis as any).__csrfHits.push('handler'); return Response.json({ ok: true }); }\n" +
    "export function GET() { return Response.json({ ok: true }); }");
});
afterAll(async () => { await rm(appDir, { recursive: true, force: true }); });

function send(app: any, headers: Record<string, string>, method = "POST") {
  return app(new Request("http://app.test/api/transfer", { method, headers })) as Promise<Response>;
}

test("a cookie-bearing write from another site is refused before middleware runs", async () => {
  const app = createAppRouter({ appDir, mode: "production" });
  hits.length = 0;
  const res = await send(app, { cookie: "session=1", origin: "https://evil.example" });
  expect(res.status).toBe(403);
  expect(hits).toEqual([]);
});

test("same-site writes, writes without cookies and safe methods pass", async () => {
  const app = createAppRouter({ appDir, mode: "production" });
  expect((await send(app, { cookie: "session=1", origin: "http://app.test" })).status).toBe(200);
  expect((await send(app, { origin: "https://evil.example" })).status).toBe(200); // no cookies
  expect((await send(app, { cookie: "session=1" })).status).toBe(200); // a script: no Origin
  expect((await send(app, { cookie: "session=1", origin: "https://evil.example" }, "GET")).status).toBe(200);
});

test("Sec-Fetch-Site and Origin null are understood", async () => {
  const app = createAppRouter({ appDir, mode: "production" });
  expect((await send(app, { cookie: "s=1", "sec-fetch-site": "cross-site" })).status).toBe(403);
  expect((await send(app, { cookie: "s=1", "sec-fetch-site": "same-origin" })).status).toBe(200);
  expect((await send(app, { cookie: "s=1", origin: "null" })).status).toBe(403);
});

test("allowedOrigins admits named sites; csrf: false turns the check off", async () => {
  const allowed = createAppRouter({ appDir, mode: "production", csrf: { allowedOrigins: ["https://admin.example"] } });
  expect((await send(allowed, { cookie: "s=1", origin: "https://admin.example" })).status).toBe(200);
  expect((await send(allowed, { cookie: "s=1", origin: "https://evil.example" })).status).toBe(403);
  const off = createAppRouter({ appDir, mode: "production", csrf: false });
  expect((await send(off, { cookie: "s=1", origin: "https://evil.example" })).status).toBe(200);
});
