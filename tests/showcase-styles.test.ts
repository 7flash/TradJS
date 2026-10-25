import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import postcss from "postcss";
import autoprefixer from "autoprefixer";
import tailwind from "@tailwindcss/postcss";
import { JSDOM } from "jsdom";
import { renderToString } from "../src/server/ssr";
import { createElement } from "../src/client/render";
import { injectViewTransitions } from "../src/server/document";
import Layout from "../examples/showcase/app/layout";
import Page from "../examples/showcase/app/features/rendering/page";
import { sections } from "../examples/showcase/navigation";
const cssPath = path.resolve(
  import.meta.dir,
  "../examples/showcase/app/globals.css",
);
const rawCss = readFileSync(cssPath, "utf8");
function matchesMotionPreference(
  node: postcss.Node,
  reducedMotion: boolean,
): boolean {
  let ancestor: postcss.Node | undefined = node.parent;
  while (ancestor) {
    if (ancestor.type === "atrule") {
      const rule = ancestor as postcss.AtRule;
      if (rule.name === "media") {
        const motion = rule.params.match(
          /prefers-reduced-motion:\s*(reduce|no-preference)/,
        );
        if (motion && (motion[1] === "reduce") !== reducedMotion) return false;
      }
    }
    ancestor = ancestor.parent;
  }
  return true;
}
function declarations(
  css: postcss.Root,
  selector: string,
  reducedMotion = false,
): Map<string, string> {
  const result = new Map<string, string>();
  css.walkRules((rule) => {
    if (
      !rule.selectors.includes(selector) ||
      !matchesMotionPreference(rule, reducedMotion)
    )
      return;
    rule.walkDecls((declaration) => {
      result.set(declaration.prop, declaration.value);
    });
  });
  return result;
}
function frameworkCSS(): postcss.Root {
  const html = injectViewTransitions(
    "<html><head></head><body></body></html>",
    true,
  );
  return postcss.parse(html.match(/<style[^>]*>([\s\S]*?)<\/style>/)![1]!);
}
describe("showcase navigation styling", () => {
  test("each showcase page has one current link, and other links share no active class", () => {
    for (const pathname of [
      "/",
      ...sections.flatMap((section) => section.items.map((item) => item.href)),
    ]) {
      const dom = new JSDOM(
        renderToString(createElement(Layout, { pathname, children: "Page" })),
      );
      try {
        const links = Array.from(
          dom.window.document.querySelectorAll(".sidebar-nav .nav-link"),
        );
        const current = links.filter((link) =>
          link.matches('[aria-current="page"]'),
        );
        expect(current.length).toBe(1);
        expect(current[0]!.getAttribute("href")).toBe(pathname);
        expect(links.every((link) => link.className === "nav-link")).toBe(true);
      } finally {
        dom.window.close();
      }
    }
  });
  test("the rendering page uses the same content and heading layout as the rest of the showcase", () => {
    const dom = new JSDOM(renderToString(createElement(Page, null)));
    try {
      expect(
        dom.window.document.querySelector(".page > .page-header > .page-title")!
          .textContent,
      ).toBe("Subtree rendering");
      expect(
        dom.window.document.querySelector(".page > #rendering-demo"),
      ).not.toBeNull();
    } finally {
      dom.window.close();
    }
  });
  test("the actual CSS processor retains current-link selectors and preserves shared snapshots", async () => {
    const result = await postcss([autoprefixer, tailwind]).process(rawCss, {
      from: cssPath,
      map: false,
    });
    const css = result.root;
    expect(declarations(css, ".sidebar-nav .nav-link").get("background")).toBe(
      "transparent",
    );
    expect(
      declarations(css, '.sidebar-nav .nav-link[aria-current="page"]').get(
        "background",
      ),
    ).toBe("var(--color-accent-dim)");
    expect(
      declarations(css, "::view-transition-old(showcase-sidebar)").get(
        "animation",
      ),
    ).toBe("none");
    expect(
      declarations(css, "::view-transition-new(showcase-sidebar)").get(
        "animation",
      ),
    ).toBe("none");
    expect(
      declarations(css, "::view-transition-old(showcase-sidebar)").has(
        "visibility",
      ),
    ).toBe(false);
    expect(
      declarations(css, "::view-transition-new(showcase-content)").get(
        "animation",
      ),
    ).toBe("showcase-content-in 120ms ease-out both");
    expect(
      declarations(css, "::view-transition-new(showcase-content)", true).get(
        "animation",
      ),
    ).toBe("none");
  });
  test("framework defaults do not fade the document root or hide its snapshots", () => {
    const css = frameworkCSS();
    for (const selector of [
      "::view-transition-group(root)",
      "::view-transition-old(root)",
      "::view-transition-new(root)",
    ]) {
      const properties = declarations(css, selector);
      expect(properties.get("animation")).toBe("none");
      expect(properties.has("visibility")).toBe(false);
      expect(properties.has("opacity")).toBe(false);
    }
    expect(declarations(css, "::view-transition-new(*)").size).toBe(0);
  });
  for (const reducedMotion of [false, true]) {
    test(`native snapshot navigation remains enabled with reduced motion ${reducedMotion}`, () => {
      const navigation: string[] = [];
      frameworkCSS().walkAtRules("view-transition", (rule) => {
        if (!matchesMotionPreference(rule, reducedMotion)) return;
        rule.walkDecls("navigation", (declaration) => {
          navigation.push(declaration.value);
        });
      });
      expect(navigation).toEqual(["auto"]);
    });
  }
  test("reduced motion suppresses every snapshot animation and blending, including named regions", () => {
    const css = frameworkCSS();
    for (const selector of [
      "::view-transition",
      "::view-transition-group(*)",
      "::view-transition-image-pair(*)",
      "::view-transition-old(*)",
      "::view-transition-new(*)",
    ]) {
      expect(declarations(css, selector).size).toBe(0);
      const reduced = declarations(css, selector, true);
      expect(reduced.get("animation")).toBe("none");
      expect(reduced.get("transition")).toBe("none");
      expect(reduced.has("opacity")).toBe(false);
      expect(reduced.has("visibility")).toBe(false);
      css.walkRules((rule) => {
        if (
          !rule.selectors.includes(selector) ||
          !matchesMotionPreference(rule, true)
        )
          return;
        rule.walkDecls((declaration) => {
          expect(declaration.important).toBe(true);
        });
      });
    }
    for (const state of ["old", "new"]) {
      expect(
        declarations(css, `::view-transition-${state}(*)`, true).get(
          "mix-blend-mode",
        ),
      ).toBe("normal");
    }
  });
});
