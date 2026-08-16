import { beforeEach, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { createElement, memo, render } from "../src/client/render";
import { SVG_NS } from "../src/client/dom";

function installDom() {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
  );
  const win = dom.window as any;
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    Node: win.Node,
    Element: win.Element,
    HTMLElement: win.HTMLElement,
    SVGElement: win.SVGElement,
    Text: win.Text,
  });
  return win.document.getElementById("root") as HTMLElement;
}

let root: HTMLElement;

beforeEach(() => {
  root = installDom();
});

describe("client DOM renderer", () => {
  test("mounts and patches SVG in the SVG namespace", () => {
    render(
      createElement(
        "svg",
        { viewBox: "0 0 10 10", className: "icon" },
        createElement("path", { d: "M0 0L10 10", strokeWidth: 2 }),
      ),
      root,
    );

    const svg = root.querySelector("svg")!;
    const path = root.querySelector("path")!;
    expect(svg.namespaceURI).toBe(SVG_NS);
    expect(path.namespaceURI).toBe(SVG_NS);
    expect(svg.getAttribute("class")).toBe("icon");
    expect(path.getAttribute("stroke-width")).toBe("2");

    const originalPath = path;
    render(
      createElement(
        "svg",
        { viewBox: "0 0 10 10", className: "icon active" },
        createElement("path", { d: "M0 0L5 5", strokeWidth: 4 }),
      ),
      root,
    );

    expect(root.querySelector("path")).toBe(originalPath);
    expect(originalPath.getAttribute("stroke-width")).toBe("4");
    expect(svg.getAttribute("class")).toBe("icon active");

    render(null, root);
    expect(root.childNodes.length).toBe(0);
  });

  test("memo distinguishes missing props from explicitly undefined props", () => {
    let renders = 0;
    const Component = memo((props: Record<string, unknown>) => {
      renders++;
      return createElement("div", null, Object.keys(props).join(","));
    });

    render(createElement(Component, { x: undefined }), root);
    render(createElement(Component, { y: undefined }), root);

    expect(renders).toBe(2);
    expect(root.textContent).toBe("y");
  });
});
