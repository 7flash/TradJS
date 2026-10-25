import { describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { injectViewTransitions } from "../src/server/document";
import { inspectDocument } from "../examples/showcase/navigation-diagnostics";
const shell =
  '<html><head></head><body><aside class="sidebar"><nav class="sidebar-nav"><a href="/counter" class="nav-link" aria-current="page">Counter</a></nav></aside></body></html>';
function inspect(html: string, reducedMotion: boolean) {
  const dom = new JSDOM(html, {
    url: "https://showcase.test/counter?private=omitted",
    runScripts: "outside-only",
  });
  Object.defineProperty(dom.window, "matchMedia", {
    value: () => ({ matches: reducedMotion }),
  });
  Object.defineProperty(dom.window.performance, "getEntriesByType", {
    value: () => [],
  });
  const before = dom.window.document.documentElement.outerHTML;
  const report = dom.window.eval(
    `(${inspectDocument.toString()})();`,
  ) as ReturnType<typeof inspectDocument>;
  return { dom, report, before };
}
describe("navigation diagnostic", () => {
  for (const reducedMotion of [false, true]) {
    test(`reports actual setup with reduced motion ${reducedMotion} without changing DOM`, () => {
      const {
        dom,
        report: current,
        before,
      } = inspect(injectViewTransitions(shell, true), reducedMotion);
      try {
        expect(current.diagnosticsVersion).toBe("showcase-panel-v1");
        expect(current.observerInHead).toBe(false);
        expect(current.transitionPolicy).toBe("stable-root-v3");
        expect(current.reducedMotion).toBe(reducedMotion);
        expect(current.transitionCSS).toBe(
          dom.window.document.querySelector("style")!.textContent!.trim(),
        );
        expect(current.transitionCSS).not.toContain("navigation: none");
        expect(current.activeLinks).toEqual(["/counter"]);
        expect(current.path).toBe("/counter");
        expect(current.documentReadiness.target).toBe("#tradjs-document-end");
        expect(current.documentReadiness.blocking).toBe("render");
        expect(current.documentReadiness.elementParsed).toBe(true);
        expect(current.recordedTransitions).toEqual([]);
        expect(JSON.stringify(current)).not.toContain("private=omitted");
        expect(dom.window.document.documentElement.outerHTML).toBe(before);
      } finally {
        dom.window.close();
      }
    });
  }
  test("exposes the previous policy's reduced-motion opt-out rather than inferring success from its marker", () => {
    const css =
      "@view-transition { navigation: auto; } @media (prefers-reduced-motion: reduce) { @view-transition { navigation: none; } }";
    const { dom, report: current } = inspect(
      shell.replace(
        "</head>",
        `<style data-tradjs-view-transitions="stable-root">${css}</style></head>`,
      ),
      true,
    );
    try {
      expect(current.transitionPolicy).toBe("stable-root");
      expect(current.reducedMotion).toBe(true);
      expect(current.transitionCSS).toBe(css);
      expect("browserCreatedTransition" in current).toBe(false);
    } finally {
      dom.window.close();
    }
  });
});
