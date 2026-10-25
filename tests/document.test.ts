import { describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import {
  createClientInitializer,
  injectViewTransitions,
} from "../src/server/document";
import { createElement } from "../src/client/render";
import { Fragment } from "../src/client/types";
import { renderToString, renderToStringAsync } from "../src/server/ssr";
import RootLayout from "../examples/showcase/app/layout";
const shell =
  "<!DOCTYPE html><html><head><title>Test</title></head><body><main>Content</main></body></html>";
describe("document navigation", () => {
  test("opts in once, respects reduced motion, and keeps the old snapshot visible", () => {
    const html = injectViewTransitions(shell, true);
    const document = new JSDOM(html).window.document;
    expect(
      document.head.querySelectorAll("style[data-tradjs-view-transitions]")
        .length,
    ).toBe(1);
    expect(html).toContain("@view-transition { navigation: auto; }");
    expect(html).not.toContain("navigation: none");
    expect(html).toContain('data-tradjs-view-transitions="stable-root-v3"');
    expect(html).not.toContain("opacity: 0");
    expect(injectViewTransitions(html, true)).toBe(html);
    expect(injectViewTransitions(shell, false)).toBe(shell);
  });
  test("waits for the end of SSR HTML even when a page has no client initializer", () => {
    const html = injectViewTransitions(shell, true);
    const dom = new JSDOM(html);
    try {
      const document = dom.window.document;
      const link =
        document.head.querySelector<HTMLLinkElement>('link[rel="expect"]')!;
      expect(link.getAttribute("blocking")).toBe("render");
      const marker = document.querySelector<HTMLElement>(
        link.getAttribute("href")!,
      )!;
      expect(marker.hidden).toBe(true);
      expect(marker.hasAttribute("data-tradjs-document-end")).toBe(true);
      expect(document.body.lastElementChild).toBe(marker);
      expect(document.querySelector("main")!.textContent).toBe("Content");
      const prefix = new JSDOM(html.slice(0, html.indexOf("<main>")));
      try {
        expect(
          prefix.window.document.head.querySelector('link[rel="expect"]'),
        ).not.toBeNull();
        expect(
          prefix.window.document.querySelector(link.getAttribute("href")!),
        ).toBeNull();
      } finally {
        prefix.window.close();
      }
      expect(document.querySelectorAll("script").length).toBe(0);
      expect(injectViewTransitions(html, true)).toBe(html);
    } finally {
      dom.window.close();
    }
  });
  test("chooses a unique readiness marker and supports case-insensitive document tags", () => {
    const html = injectViewTransitions(
      '<HTML><HEAD></HEAD><BODY><main id="tradjs-document-end"><b id="tradjs-document-end-1">Content</b></main></BODY ></HTML>',
      true,
    );
    const dom = new JSDOM(html);
    try {
      const document = dom.window.document;
      const marker = document.querySelector("[data-tradjs-document-end]")!;
      expect(marker.id).toBe("tradjs-document-end-2");
      expect(document.body.lastElementChild).toBe(marker);
      expect(
        document.head.querySelector('link[rel="expect"]')!.getAttribute("href"),
      ).toBe("#" + marker.id);
      expect(document.querySelector("#tradjs-document-end")!.textContent).toBe(
        "Content",
      );
    } finally {
      dom.window.close();
    }
  });
  test("does not create a dangling readiness link for document fragments", () => {
    for (const html of [
      "<main>Content</main>",
      "<html><head></head><main>Content</main></html>",
    ]) {
      const result = injectViewTransitions(html, true);
      expect(result).toContain("@view-transition { navigation: auto; }");
      expect(result).not.toContain('rel="expect"');
    }
  });
  test("initializer uses static imports and safely serializes route context", async () => {
    const context = {
      params: { id: "</script><script>bad()</script>" },
      pathname: '/items/a"b',
    };
    const moduleURL = (code: string) =>
      `data:text/javascript,${encodeURIComponent(code)}`;
    const urls = [
      moduleURL(
        'export default async context => { globalThis.__tradjsInit = [context]; await Promise.resolve(); globalThis.__tradjsInit.push("layout"); }',
      ),
      moduleURL(
        'export default context => { globalThis.__tradjsInit.push("page", context); }',
      ),
    ];
    const tag = createClientInitializer(urls, context, true);
    expect(tag).toContain('type="module" blocking="render"');
    expect(tag).not.toContain("await import(");
    expect(tag.match(/<\/script>/g)?.length).toBe(1);
    const code = new JSDOM(tag).window.document.querySelector(
      "script",
    )!.textContent!;
    try {
      await import(moduleURL(code));
      expect((globalThis as any).__tradjsInit).toEqual([
        context,
        "layout",
        "page",
        context,
      ]);
    } finally {
      delete (globalThis as any).__tradjsInit;
    }
    expect(createClientInitializer([], context, true)).toBe("");
    expect(createClientInitializer(urls, context, false)).not.toContain(
      "blocking=",
    );
  });
  test("layouts render active navigation and stable chrome on the server", () => {
    const vnode = createElement(RootLayout, {
      pathname: "/items/alpha",
      children: "Test",
    });
    const first = renderToString(vnode);
    expect(renderToString(vnode)).toBe(first);
    const document = new JSDOM(first).window.document;
    expect(document.querySelectorAll('[aria-current="page"]').length).toBe(1);
    expect(
      document.querySelector('[aria-current="page"]')!.getAttribute("href"),
    ).toBe("/items/alpha");
    expect(document.querySelector("aside")!.getAttribute("style")).toContain(
      "view-transition-name:showcase-sidebar",
    );
    expect(document.querySelectorAll('link[rel="stylesheet"]').length).toBe(0);
  });
  test("fragments survive separate package instances", async () => {
    const moduleURL =
      'data:text/javascript,export const Fragment = Symbol.for("tradjs.fragment")';
    const copy = await import(moduleURL);
    expect(copy.Fragment).toBe(Fragment);
    const vnode = createElement(
      copy.Fragment,
      null,
      createElement("b", null, "one"),
      "two",
    );
    expect(renderToString(vnode)).toBe("<b>one</b>two");
    expect(await renderToStringAsync(vnode)).toBe("<b>one</b>two");
  });
});
