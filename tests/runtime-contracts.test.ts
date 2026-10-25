import { describe, expect, test } from "bun:test";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createAppRouter, renderPage } from "../src/server/app-router";
import { serve } from "../src/server/serve";
import { Head } from "../src/server/head";
import { createElement as h } from "../src/client/render";
import { clearCaches, builtAssets } from "../src/server/build";
const renderer = JSON.stringify(
  pathToFileURL(path.resolve(import.meta.dir, "../src/client/render.ts")).href,
);
async function fixture(run: (dir: string) => Promise<void>) {
  const dir = mkdtempSync(path.join(tmpdir(), "tradjs-runtime-contract-"));
  try {
    await run(dir);
  } finally {
    clearCaches();
    rmSync(dir, { recursive: true, force: true });
  }
}
describe("native router and transport contracts", () => {
  test("SSG uses the common document renderer and still runs middleware", () =>
    fixture(async (dir) => {
      writeFileSync(
        path.join(dir, "page.ts"),
        `import { createElement as h } from ${renderer}; export const ssg=true; export default () => h('main',null,'cached page');`,
      );
      writeFileSync(
        path.join(dir, "middleware.ts"),
        `export default request => request.headers.get('authorization') ? undefined : new Response('denied',{status:401});`,
      );
      const previous = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      try {
        const router = createAppRouter({
          appDir: dir,
          defaultTitle: "Contract",
        });
        expect(await router.ready).toBe(1);
        const denied = (await router(new Request("http://test/"))) as Response;
        expect(denied.status).toBe(401);
        const request = (url: string) =>
          router(
            new Request(url, { headers: { authorization: "yes" } }),
          ) as Promise<Response>;
        const cached = await request("http://test/"),
          dynamic = await request("http://test/?fresh=1");
        expect(cached.headers.get("X-TradJS-SSG")).toBe("1");
        expect(cached.headers.get("Cache-Control")).toContain("private");
        expect(await cached.text()).toBe(await dynamic.text());
        const head = (await router(
          new Request("http://test/", {
            method: "HEAD",
            headers: { authorization: "yes" },
          }),
        )) as Response;
        expect(head.status).toBe(200);
        expect(await head.text()).toBe("");
      } finally {
        if (previous === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previous;
      }
    }));
  test("API HEAD falls back to GET and OPTIONS advertises supported methods", () =>
    fixture(async (dir) => {
      mkdirSync(path.join(dir, "api"));
      writeFileSync(
        path.join(dir, "api/route.ts"),
        "export const GET=()=>Response.json({ok:true});",
      );
      const router = createAppRouter({ appDir: dir });
      await router.ready;
      const head = (await router(
        new Request("http://test/api", { method: "HEAD" }),
      )) as Response;
      expect(head.status).toBe(200);
      expect(await head.text()).toBe("");
      const options = (await router(
        new Request("http://test/api", { method: "OPTIONS" }),
      )) as Response;
      expect(options.status).toBe(204);
      expect(options.headers.get("Allow")).toContain("HEAD");
      const post = (await router(
        new Request("http://test/api", { method: "POST" }),
      )) as Response;
      expect(post.status).toBe(405);
      expect(post.headers.get("Allow")).toContain("GET");
    }));
  test("standalone SSR propagates failures and collects Head", async () => {
    const cause = new Error("SSR cause");
    await expect(
      renderPage({
        component: () => {
          throw cause;
        },
      }),
    ).rejects.toBe(cause);
    const html = await renderPage({
      component: () =>
        h("main", null, h(Head, null, h("title", null, "Page title")), "body"),
    });
    expect(html).toContain("<title>Page title</title>");
    expect(html).not.toContain("<title>TradJS App</title>");
  });
  test("explicit conflicting listener options and existing Unix paths fail without deletion", () =>
    fixture(async (dir) => {
      await expect(
        serve(() => "ok", { port: 0, unix: path.join(dir, "socket") }),
      ).rejects.toThrow("both");
      const file = path.join(dir, "existing");
      writeFileSync(file, "keep");
      await expect(serve(() => "ok", { unix: file })).rejects.toThrow(
        "already exists",
      );
      expect(readFileSync(file, "utf8")).toBe("keep");
    }));
  test("transport strips HEAD bodies and serves assets only for GET and HEAD", async () => {
    const asset = "/contract-test.css";
    builtAssets[asset] = {
      content: new TextEncoder().encode("body{}").buffer,
      contentType: "text/css",
    };
    const server = await serve(() => new Response("body", { status: 201 }), {
      port: 0,
    });
    try {
      const url = `http://localhost:${server.port}`;
      const head = await fetch(url + "/", { method: "HEAD" });
      expect(head.status).toBe(201);
      expect(await head.text()).toBe("");
      const assetHead = await fetch(url + asset, { method: "HEAD" });
      expect(assetHead.status).toBe(200);
      expect(await assetHead.text()).toBe("");
      expect((await fetch(url + asset, { method: "POST" })).status).toBe(405);
    } finally {
      await server.stop(true);
      delete builtAssets[asset];
    }
  });
});
