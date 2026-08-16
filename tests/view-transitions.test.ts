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
