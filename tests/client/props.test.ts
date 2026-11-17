import { afterEach, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { createElement } from "../../src/client/jsx-dom";
import { setDomProp } from "../../src/client/props";

const doms: JSDOM[] = [];
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");

function render(
  tag: string,
  props: Record<string, unknown>,
): { doc: Document; el: Element; dom: JSDOM } {
  const dom = new JSDOM();
  doms.push(dom);
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: dom.window.document,
  });
  const el = createElement(tag, props) as Element;
  dom.window.document.body.appendChild(el);
  return { doc: dom.window.document, el, dom };
}

afterEach(() => {
  for (const dom of doms.splice(0)) dom.window.close();
  if (originalDocument)
    Object.defineProperty(globalThis, "document", originalDocument);
  else Reflect.deleteProperty(globalThis, "document");
});

describe("client DOM attribute safety", () => {
  test("rejects unsafe URL attributes and srcdoc", () => {
    const { doc } = render("div", {});
    const link = createElement("a", {
      href: " java\nscript:alert(1)",
    }) as HTMLAnchorElement;
    const button = createElement("button", {
      formAction: "vbscript:alert(1)",
    }) as HTMLButtonElement;
    const image = createElement("img", {
      src: "data:text/html,<script>alert(1)</script>",
    }) as HTMLImageElement;
    const frame = createElement("iframe", {
      srcdoc: "<script>alert(1)</script>",
    }) as HTMLIFrameElement;
    doc.body.append(link, button, image, frame);
    expect(link.hasAttribute("href")).toBe(false);
    expect(button.hasAttribute("formaction")).toBe(false);
    expect(image.hasAttribute("src")).toBe(false);
    expect(frame.hasAttribute("srcdoc")).toBe(false);
  });

  test("checks resolved SVG names and permits raster image data", () => {
    const { doc } = render("div", {});
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "use");
    setDomProp(svg, "xlinkHref", "javascript:alert(1)");
    expect(svg.hasAttribute("xlink:href")).toBe(false);
    const image = createElement("img", {
      src: "data:image/png;base64,AAAA",
    }) as HTMLImageElement;
    doc.body.append(svg, image);
    expect(image.getAttribute("src")).toBe("data:image/png;base64,AAAA");
  });

  test("rejects invalid names and non-function event attributes", () => {
    const { el } = render("div", {
      "bad name": "value",
      onerror: "alert(1)",
    });
    expect(el.hasAttribute("bad name")).toBe(false);
    expect(el.hasAttribute("onerror")).toBe(false);
  });

  test("keeps function event handlers and raw HTML escape hatch", () => {
    let calls = 0;
    const { doc } = render("div", {});
    const button = createElement("button", {
      onClick: () => calls++,
    }) as HTMLButtonElement;
    const event = doc.createEvent("Event");
    event.initEvent("click", false, false);
    button.dispatchEvent(event);
    expect(calls).toBe(1);

    const raw = createElement("div", {
      dangerouslySetInnerHTML: {
        __html: '<img src=x onerror="rawHandler()">',
      },
    }) as HTMLDivElement;
    expect(raw.innerHTML).toContain("onerror");
  });
});

test("an unsafe URL replacing a safe one removes the old attribute", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  const a = dom.window.document.createElement("a");
  setDomProp(a, "href", "/ok");
  expect(a.getAttribute("href")).toBe("/ok");
  setDomProp(a, "href", "javascript:alert(1)");
  expect(a.hasAttribute("href")).toBe(false);
  dom.window.close();
});

test("first render applies the URL and name rules too", async () => {
  const { render, createElement: h } = await import("../../src/client/render");
  const dom = new JSDOM('<!doctype html><body><div id="r"></div></body>');
  const root = dom.window.document.getElementById("r")!;
  render(h("a", { href: "javascript:alert(1)", "aria-hidden": false }, "x"), root);
  const a = root.querySelector("a")!;
  expect(a.hasAttribute("href")).toBe(false);
  expect(a.getAttribute("aria-hidden")).toBe("false");
  render(null, root);
  dom.window.close();
});
