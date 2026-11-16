import { test, expect } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { renderToString, renderToStringAsync } from "../src/server/ssr";
import { Head, collectHead } from "../src/server/head";
import { renderPage, createAppRouter } from "../src/server/app-router";

const node = (type: string, props: Record<string, unknown> = {}) =>
  ({ type, props }) as any;

test("SSR rejects event props, invalid names and executable URLs", async () => {
  const evilKey = 'data-x" onmouseover="alert(1)" x';
  const vnode = node("a", {
    ONCLICK: "alert(1)",
    [evilKey]: "value",
    href: "\njaVa\tsCript:alert(1)",
    children: "<script>alert(2)</script>",
  });
  for (const html of [
    renderToString(vnode),
    await renderToStringAsync(vnode),
  ]) {
    expect(html).not.toMatch(/onmouseover|onclick|href=/i);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  }
  const badTag = node('div><script>alert(1)</script><div');
  expect(() => renderToString(badTag)).toThrow();
  expect(renderToStringAsync(badTag)).rejects.toThrow();
});

test("srcdoc and active data URLs are not generic attributes", () => {
  const html = renderToString(node("iframe", {
    srcdoc: "<script>alert(1)</script>",
    src: "data:text/html,<script>alert(2)</script>",
  }));
  expect(html).not.toContain("srcdoc=");
  expect(html).not.toContain("src=");
});

test("raster data images stay allowed; SVG data images and data links do not", () => {
  const png = "data:image/png;base64,iVBORw0KGgo=";
  expect(renderToString(node("img", { src: png }))).toContain(`src="${png}"`);
  expect(renderToString(node("img", { srcset: `${png} 1x, /a.png 2x` }))).toContain("srcset=");
  expect(renderToString(node("img", { src: "data:image/svg+xml,<svg onload=alert(1)>" })))
    .not.toContain("src=");
  expect(renderToString(node("a", { href: png }))).not.toContain("href=");
  expect(renderToString(node("a", { href: "/ok?x=1" }))).toContain('href="/ok?x=1"');
  expect(renderToString(node("a", { href: " JaVaScRiPt:alert(1)" }))).not.toContain("href=");
});

test("Head rejects executable URLs without losing safe attributes", () => {
  const { head } = collectHead(() => Head({
    children: node("a", {
      href: "javascript:alert(1)",
      className: "safe",
      children: "Click",
    }),
  }));
  expect(head.join("")).not.toContain("href=");
  expect(head.join("")).toContain('class="safe"');
});

test("document metadata cannot inject HTML", async () => {
  const html = await renderPage({
    component: () => "ok",
    title: "</title><script>alert(1)</script>",
    viewport: '" onload="alert(2)',
    meta: [{
      name: 'x" onmouseover="alert(3)',
      content: '"><img src=x onerror=alert(4)>',
    }],
    viewTransitions: false,
  } as any);
  expect(html).not.toContain("<script>alert(1)</script>");
  expect(html).not.toContain("<img src=x");
  expect(html).not.toContain(' onload="alert(2)');
  expect(html).not.toContain(' onmouseover="alert(3)');
  expect(html).toContain("&lt;/title&gt;");
});

test("async Head isolation and private SSR caching", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tradjs-security-"));
  const headUrl = pathToFileURL(
    resolve(import.meta.dir, "../src/server/head.ts"),
  ).href;
  try {
    await mkdir(join(dir, "u", "[id]"), { recursive: true });
    await mkdir(join(dir, "account"), { recursive: true });
    await writeFile(join(dir, "layout.ts"), `
      export default function Layout({children}) {
        return {type:"html",props:{children:[
          {type:"head",props:{}},
          {type:"body",props:{children}}
        ]}};
      }
    `);
    await writeFile(join(dir, "u", "[id]", "page.ts"), `
      import {Head} from ${JSON.stringify(headUrl)};
      export default async function Page({params}) {
        Head({children:{
          type:"title",props:{children:params.id}
        }});
        if(params.id==="slow") globalThis.__headGate?.();
        await Bun.sleep(params.id==="slow"?80:1);
        return {type:"main",props:{children:params.id}};
      }
    `);
    await writeFile(join(dir, "account", "page.ts"), `
      export default () => ({type:"main",props:{children:"secret"}});
    `);
    await writeFile(join(dir, "account", "middleware.ts"), `
      export default () => undefined;
    `);
    const router = createAppRouter({ appDir: dir, viewTransitions: false });
    let release!: () => void;
    const started = new Promise<void>((r) => { release = r; });
    (globalThis as any).__headGate = release;
    const slow = router(new Request("http://test/u/slow"));
    await started;
    const fast = router(new Request("http://test/u/fast"));
    const [a, b] = await Promise.all([slow, fast]);
    const [ah, bh] = await Promise.all([a.text(), b.text()]);
    expect(ah).toContain("<title>slow</title>");
    expect(ah).not.toContain("<title>fast</title>");
    expect(bh).toContain("<title>fast</title>");
    expect(bh).not.toContain("<title>slow</title>");

    const account = await router(new Request("http://test/account"));
    expect(account.status).toBe(200);
    expect(account.headers.get("Cache-Control")).toBe("no-store");
    expect(await account.text()).toContain("secret");
  } finally {
    delete (globalThis as any).__headGate;
    await rm(dir, { recursive: true, force: true });
  }
});
