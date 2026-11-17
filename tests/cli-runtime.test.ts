import { expect, test } from "bun:test";
import { parseServeArgs } from "../src/server/cli-serve";
import { mkdtemp, mkdir, writeFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const cli = resolve(import.meta.dir, "../bin/tradjs.ts");
test("host and malformed serve flags", () => {
  expect(parseServeArgs(["--hostname", "::1"]).hostname).toBe("::1");
  expect(() => parseServeArgs(["--host", "-h"])).toThrow("Missing value");
  expect(() => parseServeArgs(["--host", "localhost", "--unix", "/tmp/s"])).toThrow("Cannot combine");
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "tradjs-cli-")), app = join(root, "app");
  await mkdir(app); await writeFile(join(app, "page.ts"), "export default () => 'ok'");
  return { root, app };
}
// Windows lets Bun bind a port another socket already holds, so there is no
// conflict to observe there; the rule is checked on Linux and macOS.
test.skipIf(process.platform === "win32")("production BUN_PORT conflict does not select another port", async () => {
  const { root, app } = await fixture();
  const held = Bun.serve({ port: 0, hostname: "0.0.0.0", fetch: () => new Response("busy") });
  const child = Bun.spawn([process.execPath, cli, "serve", "--appdir", app], {
    env: { ...process.env, NODE_ENV: "production", BUN_PORT: String(held.port) }, stdout: "ignore", stderr: "ignore",
  });
  try {
    const code = await Promise.race([child.exited, Bun.sleep(3000).then(() => -999)]);
    expect(code).not.toBe(-999); expect(code).not.toBe(0);
  } finally {
    child.kill("SIGKILL"); await child.exited; await held.stop(true);
    await rm(root, { recursive: true, force: true });
  }
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
test(`start restricts socket permissions and cleans up on ${signal}`, async () => {
  if (process.platform === "win32") return;
  const { root, app } = await fixture();
  const socket = join(root, "app.sock");
  const child = Bun.spawn([process.execPath, cli, "start", "--appdir", app, "--unix", socket], {
    env: { ...process.env, NODE_ENV: "development" }, stdout: "ignore", stderr: "ignore",
  });
  try {
    let mode: number | undefined;
    for (let i = 0; i < 100; i++) {
      try { mode = (await stat(socket)).mode & 0o777; break; }
      catch { await Bun.sleep(50); }
    }
    expect(mode).toBe(0o600);
    child.kill(signal); expect(await child.exited).toBe(0);
    expect(await Bun.file(socket).exists()).toBe(false);
  } finally {
    child.kill("SIGKILL"); await child.exited;
    await rm(root, { recursive: true, force: true });
  }
});
