import { describe, expect, test } from "bun:test";
import {
  createSSGCache,
  clearSSGCache,
  resolveSSGConfig,
} from "../src/server/ssg";
describe("SSG ownership and invalidation", () => {
  test("cache instances cannot share a pathname accidentally", () => {
    const a = createSSGCache(),
      b = createSSGCache();
    a.set("/", "a");
    b.set("/", "b");
    expect(a.get("/")).toBe("a");
    expect(b.get("/")).toBe("b");
    a.clear();
    expect(b.get("/")).toBe("b");
    clearSSGCache();
    expect(b.get("/")).toBeNull();
  });
  test("expires exactly at TTL and accepts empty documents", () => {
    const original = Date.now;
    let now = 100;
    Date.now = () => now;
    try {
      const c = createSSGCache();
      c.set("/", "", 10);
      now = 109;
      expect(c.get("/")).toBe("");
      now = 110;
      expect(c.get("/")).toBeNull();
    } finally {
      Date.now = original;
    }
  });
  test("concurrent misses share one render", async () => {
    const c = createSSGCache();
    let count = 0;
    const render = async () => {
      count++;
      return "doc";
    };
    expect(
      await Promise.all([
        c.getOrRender("/", render),
        c.getOrRender("/", render),
      ]),
    ).toEqual(["doc", "doc"]);
    expect(count).toBe(1);
  });
  test("local or global invalidation prevents an older render repopulating", async () => {
    for (const global of [false, true]) {
      const c = createSSGCache();
      let finish!: (value: string) => void;
      const pending = c.getOrRender(
        "/",
        () => new Promise((resolve) => (finish = resolve)),
      );
      await Promise.resolve();
      if (global) clearSSGCache();
      else c.clear();
      const fresh = c.getOrRender("/", async () => "new");
      finish("old");
      expect(await pending).toBe("old");
      expect(await fresh).toBe("new");
      expect(c.get("/")).toBe("new");
    }
  });
  test("failures are retryable and configuration is explicit", async () => {
    const c = createSSGCache();
    await expect(
      c.getOrRender("/", async () => {
        throw new Error("fail");
      }),
    ).rejects.toThrow("fail");
    expect(await c.getOrRender("/", async () => "ok")).toBe("ok");
    expect(resolveSSGConfig({ revalidate: 0 })).toBeNull();
    expect(resolveSSGConfig({ revalidate: 2 })).toEqual({ revalidateMs: 2000 });
    for (const value of [-1, NaN, Infinity, "1"])
      expect(() => resolveSSGConfig({ revalidate: value })).toThrow();
  });
});
