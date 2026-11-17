import { expect, test } from "bun:test";
import { isLoopbackAddress, serve } from "../src/server/serve";

test("loopback detection", () => {
  for (const a of ["127.0.0.1", "127.1.2.3", "::1", "::ffff:127.0.0.1"])
    expect(isLoopbackAddress(a)).toBe(true);
  for (const a of ["10.0.0.5", "192.168.1.20", "::ffff:10.0.0.5", "fe80::1", "", undefined])
    expect(isLoopbackAddress(a as any)).toBe(false);
});

test("a local request in dev still gets the detailed error page", async () => {
  const server = await serve(() => {
    throw new Error("boom detail");
  }, { port: 0 });
  try {
    const res = await fetch(`http://127.0.0.1:${server.port}/`);
    expect(res.status).toBe(500);
    expect(await res.text()).toContain("boom detail");
  } finally {
    server.stop();
  }
});
