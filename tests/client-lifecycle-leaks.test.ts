import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { createElement as h, render } from "../src/client/render";

test("removing an event prop detaches the old listener", () => {
  const dom = new JSDOM('<div id="root"></div>');
  const root = dom.window.document.getElementById("root")!;
  let clicks = 0;
  const onClick = () => { clicks++; };
  render(h("button", { onClick }, "x"), root);
  const button = root.querySelector("button")!;
  button.dispatchEvent(new dom.window.Event("click"));
  expect(clicks).toBe(1);
  render(h("button", { onClick: null }, "x"), root);
  expect(root.querySelector("button")).toBe(button);
  button.dispatchEvent(new dom.window.Event("click"));
  expect(clicks).toBe(1);
  render(h("button", { onClick: undefined }, "x"), root);
  button.dispatchEvent(new dom.window.Event("click"));
  expect(clicks).toBe(1);
  render(null, root);
  dom.window.close();
});

test("callback refs get the element, then null on unmount", () => {
  const dom = new JSDOM('<div id="root"></div>');
  const root = dom.window.document.getElementById("root")!;
  const seen: unknown[] = [];
  const ref = (el: unknown) => { seen.push(el); };
  render(h("p", { ref }, "x"), root);
  const p = root.querySelector("p");
  render(h("p", { ref }, "y"), root);
  render(null, root);
  expect(seen[0]).toBe(p);
  expect(seen.at(-1)).toBe(null);
  expect(seen.filter((v) => v === p).length).toBe(1);
  dom.window.close();
});
