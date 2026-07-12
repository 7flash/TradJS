/**
 * Regression coverage for high-churn keyed feeds.
 *
 * The bug was a NotFoundError from parent.insertBefore(node, staleAnchor) when
 * the keyed reconciler carried an anchor that was no longer a direct child of
 * the current parent. This test stresses keyed reorder/insert/delete paths and
 * verifies the DOM order after each render.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
Object.assign(globalThis, {
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Text: dom.window.Text,
  Node: dom.window.Node,
  DocumentFragment: dom.window.DocumentFragment,
});

import { render, createElement } from "../src/client/render";
import type { VNode } from "../src/client/types";

function h(type: any, props: any, ...children: any[]): VNode {
  return createElement(type, props, ...children);
}

function list(ids: string[]) {
  return h(
    "ul",
    null,
    ...ids.map((id) => h("li", { key: id, "data-id": id }, id)),
  );
}

function domOrder(container: HTMLElement): string[] {
  return [...container.querySelectorAll("li")].map((node) =>
    node.getAttribute("data-id")!,
  );
}

describe("keyed reconciler stale-anchor hardening", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
  });

  test("survives rapid insert/delete/reorder cycles", () => {
    const sequences = [
      ["a", "b", "c", "d", "e"],
      ["e", "d", "c", "b", "a"],
      ["x", "e", "c", "a", "y"],
      ["y", "a", "z", "e", "x"],
      ["z", "y", "x", "e", "a"],
      ["a", "b", "c", "d", "e"],
    ];

    for (const ids of sequences) {
      expect(() =>
        render(list(ids), container, { reconciler: "auto" }),
      ).not.toThrow();
      expect(domOrder(container)).toEqual(ids);
    }
  });

  test("continues after an external DOM mutation between renders", () => {
    render(list(["a", "b", "c", "d"]), container, { reconciler: "auto" });

    // Simulate an external script/browser extension/route cleanup removing a
    // node that TradJS still has in its old fiber tree.
    container.querySelector('[data-id="c"]')?.remove();

    const next = ["d", "b", "a", "e"];
    expect(() =>
      render(list(next), container, { reconciler: "auto" }),
    ).not.toThrow();
    expect(domOrder(container)).toEqual(next);
  });
});
