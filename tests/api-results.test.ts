import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppRouter } from "../src/server/app-router";

const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});
async function api(source: string) {
  const appDir = await mkdtemp(join(tmpdir(), "tradjs-api-res-"));
  dirs.push(appDir);
  await mkdir(join(appDir, "api", "x"), { recursive: true });
  await writeFile(join(appDir, "api", "x", "route.ts"), source);
  const app = createAppRouter({ appDir });
  return (await app(new Request("http://localhost/api/x"))) as Response;
}

test("undefined gives 204 with no body", async () => {
  const res = await api(`export function GET() {}`);
  expect(res.status).toBe(204);
  expect(await res.text()).toBe("");
});

test("objects are JSON with a charset", async () => {
  const res = await api(`export function GET() { return { a: 1 }; }`);
  expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
  expect(await res.json()).toEqual({ a: 1 });
});

test("BigInt and circular values give a clear 500, not a crash", async () => {
  const big = await api(`export function GET() { return { n: 1n }; }`);
  expect(big.status).toBe(500);
  expect(await big.text()).toContain("not JSON-serializable");
  const circ = await api(`export function GET() { const o = {}; o.o = o; return o; }`);
  expect(circ.status).toBe(500);
});

test("async iterables stream", async () => {
  const res = await api(`export async function* GET() { yield "a"; yield "b"; }`);
  expect(res.status).toBe(200);
  expect(await res.text()).toBe("ab");
});

test("a thrown error gives a plain-text 500", async () => {
  const res = await api(`export function GET() { throw new Error("db down"); }`);
  expect(res.status).toBe(500);
  expect(res.headers.get("content-type")).toContain("text/plain");
});
