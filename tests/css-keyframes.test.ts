import { expect, test } from "bun:test";
import postcss from "postcss";
import { namespaceKeyframes } from "../src/server/css-keyframes";

const suffix = (route: string) => new Bun.CryptoHasher("sha256")
  .update(route).digest("hex").slice(0, 8);
const render = (css: string, route: string) => {
  const root = postcss.parse(css);
  namespaceKeyframes(root, route);
  return root.toString();
};

test("same keyframe name gets distinct route-local names", () => {
  const css = "@keyframes fade { from {opacity:0} 50% {opacity:.5} to {opacity:1} }";
  const one = render(css, "/one");
  const two = render(css, "/two");
  expect(one).toContain(`@keyframes fade-${suffix("/one")}`);
  expect(two).toContain(`@keyframes fade-${suffix("/two")}`);
  expect(one).not.toBe(two);
  expect(one).toContain("from {opacity:0}");
  expect(one).toContain("50% {opacity:.5}");
  expect(one).toContain("to {opacity:1}");
});

test("renames comma-separated names and animation shorthands", () => {
  const css = `@keyframes fade {} @keyframes spin {}
    .box { animation-name: fade, external, spin;
      animation: fade 200ms ease-in, 1s steps(2, end) spin, 3s external; }`;
  const out = render(css, "/box");
  const s = suffix("/box");
  expect(out).toContain(`animation-name: fade-${s}, external, spin-${s}`);
  expect(out).toContain(
    `animation: fade-${s} 200ms ease-in, 1s steps(2, end) spin-${s}, 3s external`,
  );
});

test("preserves comments, functions, and external names; supports prefixes", () => {
  const css = `@-webkit-keyframes fade {}
    .x { -webkit-animation: 1s fade /* fade */, 2s var(--fade);
      animation-name: "fade", shared; }`;
  const out = render(css, "/x");
  const s = suffix("/x");
  expect(out).toContain(`@-webkit-keyframes fade-${s}`);
  expect(out).toContain(`-webkit-animation: 1s fade-${s} /* fade */, 2s var(--fade)`);
  expect(out).toContain(`animation-name: "fade-${s}", shared`);
});

test("does not rename a timing keyword used as timing function", () => {
  const out = render("@keyframes linear {} .x {animation: 1s linear, 1s ease linear}", "/x");
  expect(out).toContain(`animation: 1s linear, 1s ease linear-${suffix("/x")}`);
});
