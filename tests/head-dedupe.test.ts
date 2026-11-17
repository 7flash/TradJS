import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAppRouter } from "../src/server/app-router";
import { dedupeHead } from "../src/server/head";

test("dedupeHead: last wins per key, charset and viewport first, others kept in order", () => {
  expect(
    dedupeHead([
      "<title>Layout</title>",
      '<meta name="description" content="layout">',
      "<script>a()</script>",
      '<meta name="viewport" content="width=device-width">',
      "<title>Page</title>",
      '<meta name="description" content="page">',
      '<meta charset="utf-8">',
    ]),
  ).toEqual([
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width">',
    "<script>a()</script>",
    "<title>Page</title>",
    '<meta name="description" content="page">',
  ]);
});

test("a page <Head> title overrides the layout's", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "tradjs-head-"));
  const src = (f: string) => JSON.stringify(path.join(import.meta.dir, "..", "src", f));
  try {
    writeFileSync(path.join(dir, "layout.jsx"),
      `import { createElement as h } from ${src("client/render.ts")}; import { Head } from ${src("server/head.ts")};
       export default ({ children }) => h("html", {}, h("head", {}), h("body", {}, h(Head, {}, h("title", {}, "Site")), children));`);
    writeFileSync(path.join(dir, "page.jsx"),
      `import { createElement as h } from ${src("client/render.ts")}; import { Head } from ${src("server/head.ts")};
       export default () => h("main", {}, h(Head, {}, h("title", {}, "Item page")), "x");`);
    const res = (await createAppRouter({ appDir: dir })(new Request("http://x/"))) as Response;
    const html = await res.text();
    expect(html).toContain("<title>Item page</title>");
    expect(html).not.toContain("<title>Site</title>");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
