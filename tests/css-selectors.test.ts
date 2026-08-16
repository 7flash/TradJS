import { describe, expect, test } from "bun:test";
import {
  rewriteClassSelectors,
  scopeSelectorList,
  splitSelectorList,
} from "../src/server/css-selectors";

describe("CSS selector transforms", () => {
  test("splits selector lists without splitting functional pseudos", () => {
    expect(splitSelectorList('.a:is(.b,.c), [data-x="a,b"], .d')).toEqual([
      ".a:is(.b,.c)",
      ' [data-x="a,b"]',
      " .d",
    ]);
  });

  test("rewrites class selector tokens but not attribute strings", () => {
    const result = rewriteClassSelectors(
      '.real:hover, [data-label=".fake"] .other:not(.nested)',
      (name) => `${name}_hash`,
    );

    expect(result.selector).toBe(
      '.real_hash:hover, [data-label=".fake"] .other_hash:not(.nested_hash)',
    );
    expect(result.classNames).toEqual(["real", "other", "nested"]);
  });

  test("scopes ordinary selectors and preserves selector-list structure", () => {
    expect(
      scopeSelectorList(".box, .title:hover", "/features/scoped-css"),
    ).toBe(
      'body[data-page="/features/scoped-css"] .box, body[data-page="/features/scoped-css"] .title:hover',
    );
  });

  test("scopes body/html/:root selectors without impossible body descendants", () => {
    expect(scopeSelectorList("body.theme .box", "/demo")).toBe(
      'body[data-page="/demo"].theme .box',
    );
    expect(scopeSelectorList("html .box", "/demo")).toBe(
      'html:has(> body[data-page="/demo"]) .box',
    );
    expect(scopeSelectorList(":root .box", "/demo")).toBe(
      ':root:has(> body[data-page="/demo"]) .box',
    );
  });
});
