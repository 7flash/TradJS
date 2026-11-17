import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const router = JSON.stringify(path.join(import.meta.dir, "..", "src", "server", "app-router.ts"));

function run(env: string) {
  const dir = mkdtempSync(path.join(tmpdir(), "tradjs-err-"));
  try {
    writeFileSync(path.join(dir, "page.jsx"),
      `export default function Page() { throw new Error("SELECT * FROM users WHERE pw='hunter2'"); }\n`);
    writeFileSync(path.join(dir, "error.jsx"),
      `export default function E({ error }) { return "msg=" + error.message + " digest=" + error.digest; }\n`);
    const script = `
      process.env.NODE_ENV = ${JSON.stringify(env)};
      console.error = () => {};
      const { createAppRouter } = await import(${router});
      const res = await createAppRouter({ appDir: ${JSON.stringify(dir)} })(new Request("http://x/"));
      console.log(JSON.stringify({ status: res.status, html: await res.text() }));`;
    const proc = Bun.spawnSync(["bun", "-e", script], { env: { ...process.env, NODE_ENV: env } });
    const line = proc.stdout.toString().split(/\r?\n/).findLast((l) => l.startsWith("{"))!;
    return JSON.parse(line) as { status: number; html: string };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("in production error.tsx gets a generic message and a digest, not the raw error", () => {
  const { status, html } = run("production");
  expect(status).toBe(500);
  expect(html).not.toContain("hunter2");
  expect(html).toContain("An unexpected error occurred.");
  expect(html).toMatch(/digest=[0-9a-f]{8}/);
}, 30_000);

test("in development error.tsx still gets the real message", () => {
  const { html } = run("development");
  expect(html).toContain("hunter2");
}, 30_000);
