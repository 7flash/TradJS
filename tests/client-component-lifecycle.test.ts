import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { Fragment, jsx, render } from "../src/client/render";

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
  dom.window.close();
});

describe("function component output lifecycle", () => {
  test("rejects async components in the client renderer with guidance", () => {
    const AsyncChild = async () => jsx("span", { children: "async" });

    expect(() => render(jsx(AsyncChild, {}), root)).toThrow(
      "Client render() does not support async components",
    );
  });

  test("supports element -> null -> element repeatedly", () => {
    let open = true;

    function Modal() {
      return open ? jsx("div", { id: "modal", children: "Modal" }) : null;
    }

    for (let i = 0; i < 4; i++) {
      open = true;
      render(jsx(Modal, {}), root);
      expect(root.innerHTML).toBe('<div id="modal">Modal</div>');

      open = false;
      render(jsx(Modal, {}), root);
      expect(root.innerHTML).toBe("");
    }

    open = true;
    render(jsx(Modal, {}), root);
    expect(root.innerHTML).toBe('<div id="modal">Modal</div>');
  });

  test("preserves component position when empty output becomes visible", () => {
    let visible = false;

    function Middle() {
      return visible
        ? jsx("strong", { id: "middle", children: "middle" })
        : null;
    }

    function App() {
      return jsx("div", {
        id: "row",
        children: [
          jsx("span", { id: "before", children: "before" }),
          jsx(Middle, {}),
          jsx("span", { id: "after", children: "after" }),
        ],
      });
    }

    render(jsx(App, {}), root);
    expect(root.querySelector("#row")?.textContent).toBe("beforeafter");

    visible = true;
    render(jsx(App, {}), root);

    const row = root.querySelector("#row")!;
    expect(Array.from(row.children).map((node) => node.id)).toEqual([
      "before",
      "middle",
      "after",
    ]);
  });

  test("supports component root type replacement", () => {
    let button = true;

    function Thing() {
      return button
        ? jsx("button", { id: "thing", children: "Hello" })
        : jsx("div", { id: "thing", children: "Hello" });
    }

    render(jsx(Thing, {}), root);
    expect(root.firstElementChild?.tagName).toBe("BUTTON");

    button = false;
    render(jsx(Thing, {}), root);
    expect(root.firstElementChild?.tagName).toBe("DIV");

    button = true;
    render(jsx(Thing, {}), root);
    expect(root.firstElementChild?.tagName).toBe("BUTTON");
  });

  test("preserves position for an empty fragment that later gains children", () => {
    let visible = false;

    function Middle() {
      return jsx(Fragment, {
        children: visible
          ? [
              jsx("i", { id: "one", children: "one" }),
              jsx("i", { id: "two", children: "two" }),
            ]
          : null,
      });
    }

    function App() {
      return jsx("div", {
        children: [
          jsx("span", { id: "before", children: "before" }),
          jsx(Middle, {}),
          jsx("span", { id: "after", children: "after" }),
        ],
      });
    }

    render(jsx(App, {}), root);
    visible = true;
    render(jsx(App, {}), root);

    expect(
      Array.from(root.firstElementChild!.children).map((node) => node.id),
    ).toEqual(["before", "one", "two", "after"]);
  });

  test("clears host refs when a render boundary unmounts", () => {
    const ref = { current: null as HTMLElement | null };

    render(jsx("span", { ref, children: "value" }), root);
    expect(ref.current).toBe(root.firstElementChild);

    render(null, root);
    expect(ref.current).toBeNull();
  });

  test("clears an old ref when the host ref changes", () => {
    const first = { current: null as HTMLElement | null };
    const second = { current: null as HTMLElement | null };

    render(jsx("span", { ref: first, children: "value" }), root);
    render(jsx("span", { ref: second, children: "value" }), root);

    expect(first.current).toBeNull();
    expect(second.current).toBe(root.firstElementChild);
  });

  test("component fibers do not alias their rendered DOM child", () => {
    function Child() {
      return jsx("div", { id: "child" });
    }

    const fiber = render(jsx(Child, {}), root);
    expect(fiber.children[0].node).toBeNull();
    expect(root.querySelector("#child")).not.toBeNull();
  });
});
