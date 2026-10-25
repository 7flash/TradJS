import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
Object.assign(globalThis, {
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Text: dom.window.Text,
  Node: dom.window.Node,
  DocumentFragment: dom.window.DocumentFragment,
});
import {
  render,
  createElement,
  setReconciler,
  getReconciler,
} from "../src/client/render";
import { Fragment } from "../src/client/types";
import type { VNode } from "../src/client/types";
import type { ReconcilerName } from "../src/client/reconcilers/types";
function h(type: any, props: any, ...children: any[]): VNode {
  return createElement(type, props, ...children);
}
function benchmark(
  name: string,
  fn: () => void,
  iterations: number = 5,
): number {
  fn();
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  console.log(
    `    ${name}: ${median.toFixed(2)}ms (samples: [${times.map((t) => t.toFixed(2)).join(", ")}])`,
  );
  return median;
}
const strategies: ReconcilerName[] = ["auto", "keyed", "sequential"];
for (const strategy of strategies) {
  describe(`Strategy: ${strategy}`, () => {
    let container: HTMLElement;
    let originalReconciler: any;
    beforeEach(() => {
      originalReconciler = getReconciler();
      setReconciler(strategy);
      container = document.createElement("div");
    });
    afterEach(() => {
      setReconciler(originalReconciler);
    });
    test("mounts and patches correctly", () => {
      render(
        h(
          "div",
          { className: "root" },
          h("span", null, "hello"),
          h("span", null, "world"),
        ),
        container,
      );
      expect(container.innerHTML).toBe(
        '<div class="root"><span>hello</span><span>world</span></div>',
      );
      render(
        h("div", { className: "updated" }, h("span", null, "goodbye")),
        container,
      );
      expect(container.innerHTML).toBe(
        '<div class="updated"><span>goodbye</span></div>',
      );
    });
    test("handles add/remove children", () => {
      render(h("ul", null, h("li", null, "a")), container);
      expect(container.querySelectorAll("li").length).toBe(1);
      render(
        h(
          "ul",
          null,
          h("li", null, "a"),
          h("li", null, "b"),
          h("li", null, "c"),
        ),
        container,
      );
      expect(container.querySelectorAll("li").length).toBe(3);
      render(h("ul", null, h("li", null, "a")), container);
      expect(container.querySelectorAll("li").length).toBe(1);
    });
    test("preserves DOM nodes on patch", () => {
      render(
        h("div", { key: "root" }, h("span", { key: "s" }, "v1")),
        container,
      );
      const span = container.querySelector("span")!;
      render(
        h("div", { key: "root" }, h("span", { key: "s" }, "v2")),
        container,
      );
      const spanAfter = container.querySelector("span")!;
      expect(span).toBe(spanAfter);
    });
    test("benchmark: mount 1000 items", () => {
      const items = Array.from({ length: 1000 }, (_, i) =>
        h("li", { key: `item-${i}` }, `Item ${i}`),
      );
      console.log(`\n  [${strategy}] Performance:`);
      const time = benchmark("Mount 1000", () => {
        container = document.createElement("div");
        render(h("ul", null, ...items), container);
      });
      expect(container.querySelectorAll("li").length).toBe(1000);
    });
    test("benchmark: patch 1000 items (text update)", () => {
      const items = Array.from({ length: 1000 }, (_, i) =>
        h("li", null, `v1-${i}`),
      );
      render(h("ul", null, ...items), container);
      const updated = Array.from({ length: 1000 }, (_, i) =>
        h("li", null, `v2-${i}`),
      );
      const time = benchmark("Patch 1000 text", () => {
        render(h("ul", null, ...updated), container);
      });
      expect(container.querySelectorAll("li")[0].textContent).toBe("v2-0");
    });
    test("benchmark: keyed reorder 1000 (full reverse)", () => {
      const items = Array.from({ length: 1000 }, (_, i) =>
        h("li", { key: `item-${i}` }, `Item ${i}`),
      );
      render(h("ul", null, ...items), container);
      const reversed = [...items].reverse();
      const time = benchmark("Keyed reorder 1000", () => {
        render(h("ul", null, ...reversed), container);
      });
      expect(container.querySelectorAll("li")[0].textContent).toBe("Item 999");
    });
    test("benchmark: partial update 10 of 1000", () => {
      const items = Array.from({ length: 1000 }, (_, i) =>
        h("li", { key: `item-${i}` }, `Item ${i}`),
      );
      render(h("ul", null, ...items), container);
      const updated = items.map((item, i) =>
        i % 100 === 0
          ? h("li", { key: `item-${i}`, className: "updated" }, `Updated ${i}`)
          : item,
      );
      const time = benchmark("Partial 10/1000", () => {
        render(h("ul", null, ...updated), container);
      });
      expect(container.querySelectorAll(".updated").length).toBe(10);
    });
    test("benchmark: component re-render", () => {
      function Counter({ count }: { count: number }) {
        return h(
          "div",
          { className: "counter" },
          h("span", null, `Count: ${count}`),
          h("button", null, "+"),
          h("button", null, "-"),
        );
      }
      render(h(Counter, { count: 0 }), container);
      const time = benchmark("Component re-render", () => {
        for (let i = 0; i < 100; i++) {
          render(h(Counter, { count: i }), container);
        }
      });
    });
  });
}
