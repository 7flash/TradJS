import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clearSSGCache, getPrerenderedOrRender, prerender,
} from "../src/server/ssg";
import { matchRoute, patternToRegex, type Route } from "../src/server/router";

function route(filePath: string, pattern: string, names: string[]): Route {
  return {
    filePath, pattern, pathname: pattern, paramNames: names,
    regex: patternToRegex(pattern), layouts: [], middlewares: [], type: "page",
  };
}

test("async ssgParams renders each concrete path and revalidates separately", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tradjs-ssg-"));
  clearSSGCache();
  try {
    const file = join(dir, "page.ts");
    writeFileSync(file, `export const ssg = { revalidate: 0.1 };
      export async function ssgParams() { return [{ slug: "a" }, { slug: "b" }]; }`);
    const blog = route(file, "/blog/:slug", ["slug"]);
    const calls: Record<string, number> = {};
    expect(await prerender([blog], async (_, params) => {
      const id = params.slug;
      calls[id] = (calls[id] ?? 0) + 1;
      return `${id}:${calls[id]}`;
    })).toBe(2);
    expect(await getPrerenderedOrRender("/blog/a")).toBe("a:1");
    expect(await getPrerenderedOrRender("/blog/b")).toBe("b:1");
    expect(await getPrerenderedOrRender("/blog/:slug")).toBeNull();
    expect(await getPrerenderedOrRender("/blog/c")).toBeNull();
    expect(matchRoute("/blog/c", [blog])?.params).toEqual({ slug: "c" });
    await Bun.sleep(130);
    expect(await getPrerenderedOrRender("/blog/a")).toBe("a:2");
    expect(await getPrerenderedOrRender("/blog/a")).toBe("a:2");
    expect(await getPrerenderedOrRender("/blog/b")).toBe("b:2");
    expect(calls).toEqual({ a: 2, b: 2 });
  } finally {
    clearSSGCache();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("static pages still prerender; params without ssgParams stay dynamic", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tradjs-ssg-"));
  clearSSGCache();
  try {
    const staticFile = join(dir, "static.ts");
    const dynamicFile = join(dir, "dynamic.ts");
    writeFileSync(staticFile, "export const ssg = true;");
    writeFileSync(dynamicFile, "export const ssg = true;");
    const staticRoute = route(staticFile, "/about", []);
    const dynamicRoute = route(dynamicFile, "/blog/:slug", ["slug"]);
    expect(await prerender([staticRoute, dynamicRoute], async () => "static"))
      .toBe(1);
    expect(await getPrerenderedOrRender("/about")).toBe("static");
    expect(await getPrerenderedOrRender("/blog/other")).toBeNull();
    expect(matchRoute("/blog/other", [dynamicRoute])).not.toBeNull();
  } finally {
    clearSSGCache();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the app router serves listed param paths as SSG and renders others dynamically", async () => {
  const { mkdir, mkdtemp, rm, writeFile } = await import("node:fs/promises");
  const { createAppRouter } = await import("../src/server/app-router");
  clearSSGCache();
  const appDir = await mkdtemp(join(tmpdir(), "tradjs-ssg-app-"));
  try {
    await mkdir(join(appDir, "blog", "[slug]"), { recursive: true });
    await writeFile(join(appDir, "blog", "[slug]", "page.tsx"), `
      export const ssg = true;
      export function ssgParams() { return [{ slug: "a" }]; }
      export default function Page({ params }: any) { return <p>post {params.slug}</p>; }
    `);
    const app = createAppRouter({ appDir, mode: "production" });
    expect(await app.ready).toBe(1);
    const listed = (await app(new Request("http://localhost/blog/a"))) as Response;
    expect(listed.headers.get("X-TradJS-SSG")).toBe("1");
    expect(await listed.text()).toContain("post a");
    const other = (await app(new Request("http://localhost/blog/z"))) as Response;
    expect(other.headers.get("X-TradJS-SSG")).toBeNull();
    expect(await other.text()).toContain("post z");
  } finally {
    clearSSGCache();
    await rm(appDir, { recursive: true, force: true });
  }
});
