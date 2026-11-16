import { describe, expect, test } from "bun:test";
import path from "node:path";
import postcss from "postcss";
import { JSDOM } from "jsdom";
import { createAppRouter } from "../src/server/app-router";
import { builtAssets } from "../src/server/build";

const handler = createAppRouter({
  appDir: path.join(import.meta.dir, "../examples/showcase/app"),
});

async function route(pathname: string) {
  const response = (await handler(
    new Request(`https://showcase.test${pathname}`),
  )) as Response;
  expect(response.status).toBe(200);
  const dom = new JSDOM(await response.text(), {
    url: `https://showcase.test${pathname}`,
    runScripts: "outside-only",
  });
  return dom;
}

function assetText(url: string): string {
  const asset = builtAssets[url];
  expect(asset).toBeDefined();
  return new TextDecoder().decode(asset!.content);
}

// The streaming bfcache and on-screen keyboard behaviour (findings 5 and 7)
// is not covered here: jsdom's window.eval does not reach the window's
// globals under Bun, so the built bundles cannot be mounted in jsdom.
// Check those on a real iPhone (Safari) and Android phone (Chrome).
describe("showcase mobile browser lifecycle through createAppRouter", () => {
  test("served stylesheet retains vh fallbacks before dvh declarations", async () => {
    const dom = await route("/");
    try {
      const link = dom.window.document.querySelector<HTMLLinkElement>(
        'link[rel="stylesheet"]',
      );
      expect(link).not.toBeNull();
      const css = postcss.parse(assetText(link!.getAttribute("href")!));
      for (const [selector, property, expected] of [
        [".app-shell", "min-height", ["100vh", "100dvh"]],
        [".main-content", "min-height", ["100vh", "100dvh"]],
        [".navigation-diagnostics-body", "max-height", ["70vh", "70dvh"]],
      ] as const) {
        const values: string[] = [];
        css.walkRules(selector, (rule) => {
          rule.walkDecls(property, (decl) => values.push(decl.value));
        });
        expect(values).toEqual([...expected]);
      }
    } finally {
      dom.window.close();
    }
  });

});
