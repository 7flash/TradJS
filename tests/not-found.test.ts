import { afterEach, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAppRouter } from "../src/server/app-router";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const nf = JSON.stringify(path.join(import.meta.dir, "..", "src", "server", "not-found.ts"));
const h = JSON.stringify(path.join(import.meta.dir, "..", "src", "client", "render.ts"));

function app(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(tmpdir(), "tradjs-nf-"));
  dirs.push(dir);
  for (const [file, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), body);
  }
  return createAppRouter({ appDir: dir });
}

test("notFound() in a page answers 404 with the built-in page, without a router error log", async () => {
  const errors = spyOn(console, "error").mockImplementation(() => {});
  try {
    const router = app({
      "items/[id]/page.jsx": `import { notFound } from ${nf}; export default function P() { notFound(); }`,
    });
    const res = (await router(new Request("http://x/items/42"))) as Response;
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('<meta name="viewport"');
    // measure-fn may trace the thrown signal; the router must not log an error.
    const messages = errors.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.startsWith("Error rendering page"))).toBe(false);
  } finally {
    errors.mockRestore();
  }
});

test("the nearest not-found page renders inside the layouts above it", async () => {
  const router = app({
    "layout.jsx": `import { createElement as h } from ${h}; export default ({ children }) => h("html", {}, h("head", {}), h("body", {}, h("nav", {}, "site"), children));`,
    "items/not-found.jsx": `export default function NF() { return "no such item"; }`,
    "items/[id]/page.jsx": `import { notFound } from ${nf}; export default function P() { notFound(); }`,
  });
  const res = (await router(new Request("http://x/items/42"))) as Response;
  expect(res.status).toBe(404);
  const html = await res.text();
  expect(html).toContain("no such item");
  expect(html).toContain("site");
});

test("an ordinary error is still a 500", async () => {
  const errors = spyOn(console, "error").mockImplementation(() => {});
  try {
    const router = app({ "page.jsx": `export default function P() { throw new Error("x"); }` });
    const res = (await router(new Request("http://x/"))) as Response;
    expect(res.status).toBe(500);
  } finally {
    errors.mockRestore();
  }
});
