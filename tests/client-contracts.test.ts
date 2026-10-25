import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { createElement as h, render } from "../src/client/render";
import { Fragment } from "../src/client/types";
let dom: JSDOM, root: HTMLElement;
beforeEach(() => {
  dom = new JSDOM('<div id="root"></div>');
  root = dom.window.document.getElementById("root")!;
});
afterEach(() => {
  render(null, root);
  dom.window.close();
});
describe("renderer ownership contracts", () => {
  for (const reconciler of [
    "auto",
    "sequential",
    "keyed",
    "replace",
  ] as const) {
    test(`${reconciler}: components change type and empty ranges keep their sibling position`, () => {
      let stage = 0;
      const Item = () =>
        stage === 0
          ? h("b", null, "one")
          : stage === 1
            ? null
            : h(Fragment, null, h("i", null, "two"), h("i", null, "three"));
      const tree = () =>
        h(
          "div",
          null,
          h("span", null, "before"),
          h(Item, null),
          h("span", null, "after"),
        );
      for (stage of [0, 1, 2, 0]) {
        render(tree(), root, { reconciler });
        expect(root.textContent).toBe(
          stage === 0
            ? "beforeoneafter"
            : stage === 1
              ? "beforeafter"
              : "beforetwothreeafter",
        );
        expect(root.querySelector("b b, b i, i b")).toBeNull();
      }
    });
  }
  test("keyed fragment groups reorder without capturing adjacent siblings", () => {
    const tree = (items: string[]) =>
      h(
        "main",
        null,
        h("p", null, "prefix"),
        h(
          Fragment,
          null,
          items.map((id) =>
            h(Fragment, { key: id }, h("b", null, id), h("i", null, id)),
          ),
        ),
        h("p", null, "suffix"),
      );
    render(tree(["a", "b", "c"]), root);
    const b = root.querySelectorAll("b")[1];
    render(tree(["c", "b", "a", "d"]), root);
    expect(root.textContent).toBe("prefixccbbaaddsuffix");
    expect(root.querySelectorAll("b")[1]).toBe(b);
  });
  test("mixed keyed children preserve an unchanged unkeyed input", () => {
    const tree = (text: string) =>
      h("div", null, h("input", null), h("span", { key: "label" }, text));
    render(tree("a"), root);
    const input = root.querySelector("input")!;
    input.value = "typed";
    render(tree("b"), root);
    expect(root.querySelector("input")).toBe(input);
    expect(input.value).toBe("typed");
  });
  test("explicit component renders include changed children", () => {
    const Box = ({
      children,
    }: {
      children?: import("../src/client/types").Child;
    }) => h("p", null, children);
    render(h(Box, null, "first"), root);
    render(h(Box, null, "second"), root);
    expect(root.textContent).toBe("second");
  });
  test("zero and nested arrays are valid component results", () => {
    render(
      h(() => [0, [h("b", null, "value")]], null),
      root,
    );
    expect(root.textContent).toBe("0value");
    render(0, root);
    expect(root.textContent).toBe("0");
  });
  test("event handlers can be explicitly cleared, including capture and double click", () => {
    const calls: string[] = [];
    render(
      h("button", {
        onClickCapture: () => calls.push("capture"),
        onDoubleClick: () => calls.push("double"),
      }),
      root,
    );
    const button = root.querySelector("button")!;
    button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    button.dispatchEvent(
      new dom.window.MouseEvent("dblclick", { bubbles: true }),
    );
    render(h("button", { onClickCapture: null, onDoubleClick: false }), root);
    button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    button.dispatchEvent(
      new dom.window.MouseEvent("dblclick", { bubbles: true }),
    );
    expect(calls).toEqual(["capture", "double"]);
  });
  test("refs attach and detach without becoming attributes", () => {
    const calls: (Element | null)[] = [];
    const ref = { current: null as Element | null };
    render(
      h("input", { ref: (element: Element | null) => calls.push(element) }),
      root,
    );
    const input = root.firstElementChild;
    render(h("input", { ref }), root);
    expect(calls).toEqual([input, null]);
    expect(ref.current).toBe(input);
    render(h("textarea", { ref }), root);
    expect(ref.current).toBe(root.firstElementChild);
    render(null, root);
    expect(ref.current).toBeNull();
  });
  test("controlled inputs use live properties and survive dirty browser state", () => {
    render(
      h("input", { value: "known", checked: true, type: "checkbox" }),
      root,
    );
    const input = root.querySelector("input")!;
    input.value = "edited";
    input.checked = false;
    render(
      h("input", { value: "known", checked: true, type: "checkbox" }),
      root,
    );
    expect(input.value).toBe("known");
    expect(input.checked).toBe(true);
    render(
      h(
        "select",
        { value: "b" },
        h("option", { value: "a" }, "A"),
        h("option", { value: "b" }, "B"),
      ),
      root,
    );
    expect(root.querySelector("select")!.value).toBe("b");
  });
  test("raw HTML transitions dispose listeners and don't append competing children", () => {
    let calls = 0;
    render(
      h("div", null, h("button", { onClick: () => calls++ }, "old")),
      root,
    );
    const oldButton = root.querySelector("button")!;
    render(
      h(
        "div",
        { dangerouslySetInnerHTML: { __html: "<b>raw</b>" } },
        h("i", null, "ignored"),
      ),
      root,
    );
    oldButton.click();
    expect(calls).toBe(0);
    expect(root.innerHTML).toBe("<div><b>raw</b></div>");
    render(h("div", null, h("i", null, "new")), root);
    expect(root.innerHTML).toBe("<div><i>new</i></div>");
  });
  test("ARIA booleans, custom CSS properties, and SVG namespace agree with their DOM contracts", () => {
    render(
      h(
        "svg",
        { "aria-hidden": false, style: { "--color": "red" } },
        h("a", { strokeWidth: 2 }),
        h("foreignObject", null, h("a", null, "HTML")),
      ),
      root,
    );
    const svg = root.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("false");
    expect(svg.style.getPropertyValue("--color")).toBe("red");
    expect(svg.firstElementChild!.namespaceURI).toBe(
      "http://www.w3.org/2000/svg",
    );
    expect(svg.querySelector("foreignObject a")!.namespaceURI).toBe(
      "http://www.w3.org/1999/xhtml",
    );
  });
  test("duplicate keys clear the selected target and allow an explicit recovery", () => {
    render(h("div", null, h("b", { key: "a" }, "old")), root);
    expect(() =>
      render(h("div", null, h("b", { key: "x" }), h("b", { key: "x" })), root),
    ).toThrow("Duplicate sibling key");
    expect(root.textContent).toBe("");
    render(h("div", null, h("b", { key: "a" }, "recovered")), root);
    expect(root.textContent).toBe("recovered");
  });
});
