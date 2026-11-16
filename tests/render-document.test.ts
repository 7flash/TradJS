import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { createElement as h, render } from "../src/client/render";

test("render creates every node in the container's document, not the global one", () => {
  const globalDom = new JSDOM();
  const secondDom = new JSDOM();
  const secondDocument = secondDom.window.document;
  const secondRoot = secondDocument.createElement("div");
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  // The global document belongs to a different window than the container.
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: globalDom.window.document,
  });
  try {
    render(h("section", null, "first", h("span", null, "nested")), secondRoot);
    const section = secondRoot.firstElementChild!;
    const text = section.firstChild!;
    expect(section.ownerDocument).toBe(secondDocument);
    expect(text.ownerDocument).toBe(secondDocument);
    expect(section.querySelector("span")!.ownerDocument).toBe(secondDocument);

    render(h("section", null, "updated", h("span", null, "nested")), secondRoot);
    expect(section.firstChild).toBe(text);
    expect(text.textContent).toBe("updated");
    expect(secondRoot.textContent).toBe("updatednested");
  } finally {
    render(null, secondRoot);
    secondDom.window.close();
    globalDom.window.close();
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test("render works with no global document at all", () => {
  const dom = new JSDOM('<div id="root"></div>');
  const root = dom.window.document.getElementById("root")!;
  // Other test files may install a global document; remove it for this test.
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Reflect.deleteProperty(globalThis, "document");
  try {
    expect(typeof (globalThis as any).document).toBe("undefined");
    render(h("p", null, "hello ", h("b", null, "world")), root);
    expect(root.innerHTML).toBe("<p>hello <b>world</b></p>");
    render(null, root);
  } finally {
    dom.window.close();
    if (previous) Object.defineProperty(globalThis, "document", previous);
  }
});
