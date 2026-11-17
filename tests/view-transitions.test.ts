import { describe, expect, test } from "bun:test";
import { createElement } from "../src/client/render";
import { renderPage } from "../src/server/app-router";

function Page() {
  return createElement("main", null, "Hello");
}

describe("cross-document view transitions", () => {
  test("renderPage enables browser-native transitions by default", async () => {
    const html = await renderPage({ component: Page });

    expect(html).toContain("data-tradjs-view-transitions");
    expect(html).toContain("@view-transition { navigation: auto; }");
    expect(html).toContain("prefers-reduced-motion: reduce");
  });

  test("renderPage can opt out explicitly", async () => {
    const html = await renderPage({
      component: Page,
      viewTransitions: false,
    });

    expect(html).not.toContain("data-tradjs-view-transitions");
    expect(html).not.toContain("@view-transition");
  });
});

test("a page's own @view-transition rule comes after the framework default", async () => {
  const { injectViewTransitions } = await import("../src/server/document");
  const html = '<!doctype html><html><head><style>@view-transition { navigation: none; }</style></head><body><main>x</main></body></html>';
  const out = injectViewTransitions(html, true);
  expect(out.indexOf("@view-transition { navigation: auto; }"))
    .toBeLessThan(out.indexOf("@view-transition { navigation: none; }"));
  // The readiness link still sits at the end of <head>, after the page's CSS.
  expect(out.indexOf("data-tradjs-document-ready")).toBeGreaterThan(out.indexOf("navigation: none"));
  expect(out).toContain("data-tradjs-document-end");
});
