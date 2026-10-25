import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { createBoundary, createElement as h, render } from "../src/client";

let dom: JSDOM;
let root: HTMLElement;

beforeEach(() => {
  dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
  );
  const win = dom.window as any;
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    Node: win.Node,
    Element: win.Element,
    HTMLElement: win.HTMLElement,
    Text: win.Text,
    Event: win.Event,
  });
  root = win.document.getElementById("root") as HTMLElement;
});

afterEach(() => {
  render(null, root);
  dom.window.close();
});

describe("createBoundary", () => {
  test("reruns only the owning component and reconciles only boundary children", () => {
    const boundary = createBoundary<HTMLDivElement>();
    let value = "masked";
    let regionRenders = 0;
    let outsideRenders = 0;

    function Region() {
      regionRenders++;
      return h("div", { id: "region", ref: boundary }, h("span", null, value));
    }

    function Outside() {
      outsideRenders++;
      return h("p", { id: "outside" }, "outside");
    }

    function App() {
      return h("main", null, h(Region, null), h(Outside, null));
    }

    render(h(App, null), root);
    const host = root.querySelector("#region");
    const outside = root.querySelector("#outside");
    const text = root.querySelector("#region span");

    value = "revealed";
    expect(boundary.render()).toBe(true);
    expect(root.querySelector("#region")).toBe(host);
    expect(root.querySelector("#outside")).toBe(outside);
    expect(root.querySelector("#region span")).toBe(text);
    expect(host?.textContent).toBe("revealed");
    expect(regionRenders).toBe(2);
    expect(outsideRenders).toBe(1);
  });

  test("does not patch the boundary host itself", () => {
    const boundary = createBoundary<HTMLDivElement>();
    let active = false;

    function Region() {
      return h(
        "div",
        { ref: boundary, className: active ? "active" : "idle" },
        h("span", null, active ? "on" : "off"),
      );
    }

    render(h(Region, null), root);
    const host = boundary.current!;
    expect(host.className).toBe("idle");

    active = true;
    expect(boundary.render()).toBe(true);
    expect(host.className).toBe("idle");
    expect(host.textContent).toBe("on");

    render(h(Region, null), root);
    expect(host.className).toBe("active");
  });

  test("preserves keyed child identity inside the boundary", () => {
    const boundary = createBoundary<HTMLUListElement>();
    let order = ["a", "b", "c"];

    function List() {
      return h("ul", {
        ref: boundary,
        children: order.map((id) => h("li", { key: id, "data-id": id }, id)),
      });
    }

    render(h(List, null), root);
    const a = root.querySelector('[data-id="a"]');
    const b = root.querySelector('[data-id="b"]');
    const c = root.querySelector('[data-id="c"]');

    order = ["c", "a", "b"];
    expect(boundary.render()).toBe(true);
    const rows = [...root.querySelectorAll("li")];
    expect(rows).toEqual([c, a, b]);
  });

  test("nested boundaries remain independently renderable", () => {
    const panel = createBoundary<HTMLElement>();
    const value = createBoundary<HTMLDivElement>();
    let panelText = "panel-a";
    let valueText = "value-a";

    function Value() {
      return h("div", { ref: value }, valueText);
    }

    function Panel() {
      return h(
        "section",
        { ref: panel },
        h("strong", null, panelText),
        h(Value, null),
      );
    }

    render(h(Panel, null), root);
    const panelHost = panel.current;
    const valueHost = value.current;

    valueText = "value-b";
    expect(value.render()).toBe(true);
    expect(value.current).toBe(valueHost);
    expect(value.current?.textContent).toBe("value-b");
    expect(panel.current).toBe(panelHost);

    panelText = "panel-b";
    valueText = "value-c";
    expect(panel.render()).toBe(true);
    expect(panel.current).toBe(panelHost);
    expect(value.current).toBe(valueHost);
    expect(panel.current?.textContent).toBe("panel-bvalue-c");
  });

  test("detaches on unmount and returns false without an owning component", () => {
    const boundary = createBoundary<HTMLDivElement>();

    render(h("div", { ref: boundary }, "root host"), root);
    expect(boundary.current).not.toBeNull();
    expect(boundary.render()).toBe(false);

    render(null, root);
    expect(boundary.current).toBeNull();
    expect(boundary.render()).toBe(false);
  });

  test("rejects mounting one boundary on two hosts", () => {
    const boundary = createBoundary<HTMLDivElement>();

    function Invalid() {
      return h(
        "section",
        null,
        h("div", { ref: boundary }, "first"),
        h("div", { ref: boundary }, "second"),
      );
    }

    expect(() => render(h(Invalid, null), root)).toThrow(
      "only one host element",
    );
  });
});
