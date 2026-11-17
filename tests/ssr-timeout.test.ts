import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppRouter, setRenderTimeoutForTests } from "../src/server/app-router";

afterEach(() => setRenderTimeoutForTests(null));

test("an async page that never resolves fails with the error page instead of hanging", async () => {
  setRenderTimeoutForTests(50);
  const appDir = await mkdtemp(join(tmpdir(), "tradjs-ssr-timeout-"));
  try {
    await mkdir(join(appDir, "slow"), { recursive: true });
    await writeFile(join(appDir, "slow", "page.tsx"),
      "export default async function Page() { await new Promise(() => {}); return <p>never</p>; }");
    const app = createAppRouter({ appDir, mode: "production" });
    await app.ready;
    const started = performance.now();
    const res = (await app(new Request("http://localhost/slow"))) as Response;
    expect(performance.now() - started).toBeLessThan(5_000);
    expect(res.status).toBe(500);
  } finally {
    await rm(appDir, { recursive: true, force: true });
  }
});
