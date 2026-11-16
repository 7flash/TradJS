import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { createAppRouter } from "../src/server/app-router";

const showcaseDir = path.join(import.meta.dir, "..", "examples", "showcase", "app");

const get = async (handler: any, pathname: string) => {
  const res = (await handler(new Request(`http://localhost:3000${pathname}`))) as Response;
  return { res, html: await res.text() };
};

describe("router HTML for mobile navigation", () => {
  test("layouts receive the request pathname, so the current link is marked", async () => {
    const handler = createAppRouter({ appDir: showcaseDir, defaultTitle: "Test" });
    const { html } = await get(handler, "/counter");
    const current = [...html.matchAll(/<a\b[^>]*aria-current="page"[^>]*>/g)].map((m) => m[0]);
    expect(current.length).toBe(1);
    expect(current[0]).toContain('href="/counter"');
  });

  test("the 404 document declares a mobile viewport", async () => {
    const handler = createAppRouter({ appDir: showcaseDir, defaultTitle: "Test" });
    const { res, html } = await get(handler, "/no-such-page");
    expect(res.status).toBe(404);
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
  });

  test("a page.jsx route without page.client.tsx gets no client bootstrap", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tradjs-jsx-route-"));
    try {
      writeFileSync(
        path.join(dir, "page.jsx"),
        `export default function Page() { return "<p>server only</p>"; }\n`,
      );
      // A layout with <body>, so a wrongly bundled page would get a bootstrap.
      const render = JSON.stringify(path.join(import.meta.dir, "..", "src", "client", "render.ts"));
      writeFileSync(
        path.join(dir, "layout.jsx"),
        `import { createElement as h } from ${render};\n` +
          `export default function Layout({ children }) {\n` +
          `  return h("html", {}, h("head", {}), h("body", {}, children));\n}\n`,
      );
      const handler = createAppRouter({ appDir: dir, defaultTitle: "Test" });
      const { res, html } = await get(handler, "/");
      expect(res.status).toBe(200);
      expect(html).toContain("server only");
      expect(html).not.toContain("__tradjsScripts");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("SSG output keeps client assets", () => {
  test("a prerendered page with page.client.tsx carries the same bootstrap as a dynamic render", async () => {
    // SSG runs only in production, decided when the router module loads.
    const script = `
      process.env.NODE_ENV = "production";
      const { createAppRouter } = await import(${JSON.stringify(path.join(import.meta.dir, "..", "src", "server", "app-router.ts"))});
      const handler = createAppRouter({ appDir: ${JSON.stringify(showcaseDir)}, defaultTitle: "Test" });
      let res, html;
      for (let i = 0; i < 100; i++) {
        res = await handler(new Request("http://localhost:3000/features/ssg"));
        html = await res.text();
        if (res.headers.get("X-TradJS-SSG") === "1") break;
        await new Promise((r) => setTimeout(r, 100));
      }
      console.log(JSON.stringify({ ssg: res.headers.get("X-TradJS-SSG"), html }));
    `;
    const proc = Bun.spawnSync(["bun", "-e", script], {
      cwd: path.join(import.meta.dir, ".."),
      env: { ...process.env, NODE_ENV: "production" },
    });
    const out = proc.stdout.toString().trim().split("\n").pop()!;
    const { ssg, html } = JSON.parse(out);
    expect(ssg).toBe("1");
    expect(html).toContain("__tradjsScripts");
    expect(html).toContain('"type":"page"');
  }, 30_000);
});
