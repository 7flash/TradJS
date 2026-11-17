import { expect, test } from "bun:test";
import { rewriteClassSelectors, scopeSelectorList, splitSelectorList } from "../src/server/css-selectors";

const route = "/a";
const s = 'body[data-page="/a"]';

test("global selectors escape scoping and class renaming", () => {
  const input = ".local :global(.shared), :global(.reset)";
  expect(rewriteClassSelectors(input, x => `r_${x}`)).toEqual({
    selector: ".r_local :global(.shared), :global(.reset)", classNames: ["local"],
  });
  expect(scopeSelectorList(input, route)).toBe(`${s} .local .shared, .reset`);
  expect(scopeSelectorList(":global(:is(.x,.y))", route)).toBe(":is(.x,.y)");
  expect(scopeSelectorList(":is(:global(.legacy),.card)", route))
    .toBe(`:is(.legacy,${s} .card)`);
});

test("functional selector lists and document roots", () => {
  expect(scopeSelectorList(":is(body,.box), :where(html, .x)", route)).toBe(
    `:is(body[data-page="/a"],${s} .box), :where(html:has(> ${s}),${s} .x)`);
  expect(scopeSelectorList(":not(.a,[data-x='a,b'])", route))
    .toBe(`${s} :not(.a,[data-x='a,b'])`);
  expect(scopeSelectorList(":where(.a,.b)", route)).toBe(`${s} :where(.a,.b)`);
});

test("comments, strings, attributes, and route markers are opaque", () => {
  expect(splitSelectorList('.a/*,b*/,.c')).toEqual(['.a/*,b*/', '.c']);
  expect(scopeSelectorList('/* body */ .x', route)).toBe(`${s} /* body */ .x`);
  expect(scopeSelectorList('.a/*,b*/,.c', route)).toBe(`${s} .a/*,b*/,${s} .c`);
  expect(rewriteClassSelectors('/* .x */ .a[data-x=".b,{,}"]', x => `r_${x}`))
    .toEqual({ selector: '/* .x */ .r_a[data-x=".b,{,}"]', classNames: ['a'] });
  expect(scopeSelectorList(`[data-x='${s}']`, route))
    .toBe(`${s} [data-x='${s}']`);
  expect(scopeSelectorList('[data-x="&,{,}"]', route))
    .toBe(`${s} [data-x="&,{,}"]`);
});

test("root/html/body and CSS nesting", () => {
  expect(scopeSelectorList(":root,html.x,body.x", route)).toBe(
    `:root:has(> ${s}),html:has(> ${s}).x,body[data-page="/a"].x`);
  expect(scopeSelectorList("&.active", route)).toBe("&.active");
  expect(scopeSelectorList("&.active, .child", route, true)).toBe("&.active, .child");
});
