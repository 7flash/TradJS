import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { createElement as h, render, type Fiber } from "../src/client/render";
import { Fragment } from "../src/client/types";
import { sequentialReconciler } from "../src/client/reconcilers/sequential";
let dom: JSDOM;
let root: HTMLElement;
beforeEach(() => {
  dom = new JSDOM('<div id="root"></div>');
  root = dom.window.document.getElementById("root")!;
});
afterEach(() => {
  render(null, root);
  dom.window.close();
});
function findFiber(fiber: Fiber, node: Node): Fiber | undefined {
  if (fiber.node === node) return fiber;
  for (const child of fiber.children) {
    const found = findFiber(child, node);
    if (found) return found;
  }
}
describe("explicit subtree rendering", () => {
  test("uses the existing fiber and only executes components inside the target", () => {
    const calls = { app: 0, counter: 0, sidebar: 0 };
    const state = { count: 0 };
    const Counter = () => {
      calls.counter++;
      return h("p", null, state.count);
    };
    const Sidebar = () => {
      calls.sidebar++;
      return h("aside", null, "unchanged");
    };
    const App = () => {
      calls.app++;
      return h(
        "main",
        null,
        h("section", null, h(Counter, null)),
        h(Sidebar, null),
      );
    };
    const tree = h(App, null);
    const rootFiber = render(tree, root);
    const target = root.querySelector("section")!;
    const targetFiber = findFiber(rootFiber, target)!;
    const owner = targetFiber.parent;
    const text = target.querySelector("p")!.firstChild;
    state.count++;
    expect(target.textContent).toBe("0");
    expect(render(h(Counter, null), target)).toBe(targetFiber);
    expect(targetFiber.parent).toBe(owner);
    expect(findFiber(rootFiber, target)).toBe(targetFiber);
    expect(target.textContent).toBe("1");
    expect(target.querySelector("p")!.firstChild).toBe(text);
    expect(calls).toEqual({ app: 1, counter: 2, sidebar: 1 });
    state.count++;
    render(tree, root);
    expect(calls).toEqual({ app: 2, counter: 3, sidebar: 2 });
    expect(target.textContent).toBe("2");
    expect(root.querySelector("section")).toBe(target);
  });
  for (const reconciler of [
    "auto",
    "sequential",
    "keyed",
    "replace",
  ] as const) {
    test(`${reconciler}: parent renders reconcile the latest subtree contents`, () => {
      render(
        h(
          "main",
          null,
          h("section", null, h("b", null, "initial")),
          h("aside", null, "sibling"),
        ),
        root,
        { reconciler },
      );
      const target = root.querySelector("section")!;
      const sibling = root.querySelector("aside")!;
      render(
        [
          h("i", { key: "a" }, "A"),
          h(Fragment, { key: "b" }, h("span", null, "B"), h("span", null, "C")),
        ],
        target,
        { reconciler },
      );
      expect(root.textContent).toBe("ABCsibling");
      expect(root.querySelector("aside")).toBe(sibling);
      render(
        h(
          "main",
          null,
          h("section", null, h("em", null, "parent")),
          h("aside", null, "sibling"),
        ),
        root,
        { reconciler },
      );
      expect(root.innerHTML).toBe(
        "<main><section><em>parent</em></section><aside>sibling</aside></main>",
      );
    });
  }
  test("preserves target attributes, listeners and ref while replacing its contents", () => {
    let clicks = 0;
    const refs: (Element | null)[] = [];
    render(
      h(
        "section",
        {
          id: "region",
          className: "fixed",
          onClick: () => clicks++,
          ref: (el: Element | null) => refs.push(el),
        },
        h("b", null, "before"),
      ),
      root,
    );
    const target = root.firstElementChild as HTMLElement;
    render(h("i", null, "after"), target);
    target.click();
    expect(target.id).toBe("region");
    expect(target.className).toBe("fixed");
    expect(refs).toEqual([target]);
    expect(clicks).toBe(1);
    render(null, root);
    target.click();
    expect(refs).toEqual([target, null]);
    expect(clicks).toBe(1);
  });
  test("clearing a region cleans up its children and leaves the region reusable", () => {
    const childRef = { current: null as Element | null };
    const targetRef = { current: null as Element | null };
    let clicks = 0;
    render(h("section", { ref: targetRef }), root);
    const target = targetRef.current!;
    const targetFiber = render(
      h("button", { ref: childRef, onClick: () => clicks++ }, "child"),
      target,
    );
    const button = childRef.current as HTMLButtonElement;
    render(null, target);
    button.click();
    expect(clicks).toBe(0);
    expect(childRef.current).toBeNull();
    expect(targetRef.current).toBe(target);
    expect(targetFiber.children).toHaveLength(0);
    expect(render(h("b", null, "again"), target)).toBe(targetFiber);
    expect(target.textContent).toBe("again");
  });
  test("parent removal cleans up descendants added by a targeted render", () => {
    const childRef = { current: null as Element | null };
    let clicks = 0;
    render(h("section", null), root);
    const target = root.firstElementChild!;
    const targetFiber = render(
      h("button", { ref: childRef, onClick: () => clicks++ }, "child"),
      target,
    );
    const button = childRef.current as HTMLButtonElement;
    render(h("article", null, "replacement"), root);
    button.click();
    expect(clicks).toBe(0);
    expect(childRef.current).toBeNull();
    expect(targetFiber.children).toHaveLength(0);
    const detachedRoot = render(h("p", null, "detached"), target);
    expect(detachedRoot).not.toBe(targetFiber);
    expect(detachedRoot.parent).toBeNull();
    expect(root.innerHTML).toBe("<article>replacement</article>");
    render(null, target);
  });
  test("keyed region moves preserve the latest descendant records and input identity", () => {
    const tree = (ids: string[]) =>
      h(
        "main",
        null,
        ids.map((id) =>
          h(
            "section",
            { key: id, "data-id": id },
            h("input", null),
            h("span", null, id),
          ),
        ),
      );
    render(tree(["a", "b"]), root);
    const target = root.querySelector<HTMLElement>('[data-id="b"]')!;
    const input = target.querySelector("input")!;
    input.value = "typed";
    input.focus();
    input.setSelectionRange(1, 3);
    render([h("input", null), h("span", null, "local")], target);
    expect(dom.window.document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(1);
    expect(input.selectionEnd).toBe(3);
    render(tree(["b", "a"]), root);
    expect(root.querySelector("section")).toBe(target);
    expect(target.querySelector("input")).toBe(input);
    expect(input.value).toBe("typed");
    expect(target.textContent).toBe("b");
  });
  test("reconciles keyed child reorders within a region without replacing sibling regions", () => {
    const list = (ids: string[]) =>
      ids.map((id) =>
        h(Fragment, { key: id }, h("b", null, id), h("i", null, id)),
      );
    render(
      h(
        "main",
        null,
        h("section", null, list(["a", "b", "c"])),
        h("aside", null, "outside"),
      ),
      root,
    );
    const target = root.querySelector("section")!;
    const b = target.querySelectorAll("b")[1];
    const sibling = root.querySelector("aside");
    render(list(["c", "b", "a", "d"]), target);
    expect(target.textContent).toBe("ccbbaadd");
    expect(target.querySelectorAll("b")[1]).toBe(b);
    expect(root.querySelector("aside")).toBe(sibling);
  });
  test("keeps empty component boundaries correct within a directly rendered region", () => {
    let stage = 0;
    const Middle = () =>
      stage === 0
        ? null
        : stage === 1
          ? [h("b", null, "B"), h("i", null, "C")]
          : "D";
    const content = () => [
      h("span", null, "A"),
      h(Middle, null),
      h("span", null, "E"),
    ];
    render(h("section", null, content()), root);
    const target = root.firstElementChild!;
    for (stage of [1, 0, 2, 1]) {
      render(content(), target);
      expect(target.textContent).toBe(
        stage === 0 ? "AE" : stage === 1 ? "ABCE" : "ADE",
      );
    }
  });
  test("records raw HTML replacement without mutating caller-owned VNodes", () => {
    const original = h("section", {
      dangerouslySetInnerHTML: { __html: "<b>raw</b>" },
    });
    Object.freeze(original.props);
    Object.freeze(original);
    render(original, root);
    const target = root.firstElementChild!;
    const ref = { current: null as Element | null };
    render(h("i", { ref }, "local"), target);
    expect(target.innerHTML).toBe("<i>local</i>");
    expect(original.props.dangerouslySetInnerHTML.__html).toBe("<b>raw</b>");
    render(original, root);
    expect(target.innerHTML).toBe("<b>raw</b>");
    expect(ref.current).toBeNull();
    render(null, target);
    expect(target.innerHTML).toBe("");
    render(original, root);
    expect(target.innerHTML).toBe("<b>raw</b>");
  });
  test("rejects a raw HTML descendant as a competing render root", () => {
    render(
      h("section", {
        dangerouslySetInnerHTML: { __html: '<div id="raw">existing</div>' },
      }),
      root,
    );
    const target = root.querySelector("#raw")!;
    expect(() => render(h("p", null, "new"), target)).toThrow(
      "untracked descendant",
    );
    expect(target.textContent).toBe("existing");
    render(h("section", null, h("div", { id: "managed" })), root);
    render("allowed", root.querySelector("#managed")!);
    expect(root.textContent).toBe("allowed");
  });
  test("rejects a manually inserted descendant without creating overlapping ownership", () => {
    render(h("section", null), root);
    const inserted = dom.window.document.createElement("div");
    root.firstElementChild!.appendChild(inserted);
    expect(() => render("new", inserted)).toThrow("untracked descendant");
    expect(inserted.textContent).toBe("");
    inserted.remove();
  });
  test("taking over an outer container disposes preexisting independent roots", () => {
    const nested = dom.window.document.createElement("section");
    root.appendChild(nested);
    const ref = { current: null as Element | null };
    let clicks = 0;
    const nestedFiber = render(
      h("button", { ref, onClick: () => clicks++ }, "old"),
      nested,
    );
    const button = ref.current as HTMLButtonElement;
    render(h("main", null, "new owner"), root);
    button.click();
    expect(ref.current).toBeNull();
    expect(clicks).toBe(0);
    expect(nestedFiber.children).toHaveLength(0);
    expect(root.textContent).toBe("new owner");
    expect(render("detached", nested)).not.toBe(nestedFiber);
    render(null, nested);
  });
  test("reapplies a controlled select value after rendering its options directly", () => {
    render(h("select", { value: "b" }, h("option", { value: "a" }, "A")), root);
    const select = root.firstElementChild as HTMLSelectElement;
    render(
      [h("option", { value: "a" }, "A"), h("option", { value: "b" }, "B")],
      select,
    );
    expect(select.value).toBe("b");
  });
  test("reapplies a controlled select value after rendering a nested optgroup", () => {
    render(
      h(
        "select",
        { value: ["b", "c"], multiple: true },
        h("optgroup", { label: "Group" }, h("option", { value: "a" }, "A")),
      ),
      root,
    );
    const select = root.firstElementChild as HTMLSelectElement;
    const group = select.querySelector("optgroup")!;
    render(
      ["a", "b", "c"].map((value) => h("option", { value }, value)),
      group,
    );
    expect(
      Array.from(select.selectedOptions, (option) => option.value),
    ).toEqual(["b", "c"]);
  });
  test("preserves the target document and SVG namespace at arbitrary depth", () => {
    render(h("svg", null, h("g", null), h("foreignObject", null)), root);
    const group = root.querySelector("g")!;
    const foreign = root.querySelector("foreignObject")!;
    render(h("a", { href: "#target" }, h("text", null, "SVG")), group);
    render(h("a", { href: "#target" }, "HTML"), foreign);
    expect(group.firstElementChild!.namespaceURI).toBe(
      "http://www.w3.org/2000/svg",
    );
    expect(foreign.firstElementChild!.namespaceURI).toBe(
      "http://www.w3.org/1999/xhtml",
    );
    expect(group.firstElementChild!.ownerDocument).toBe(dom.window.document);
  });
  test("invokes the requested custom reconciler only for the selected subtree", () => {
    render(
      h(
        "main",
        null,
        h("section", null, "before"),
        h("aside", null, "outside"),
      ),
      root,
    );
    const target = root.querySelector("section")!;
    const parents: Node[] = [];
    render("after", target, {
      reconciler: (parent, node, old, next, context) => {
        parents.push(node);
        sequentialReconciler(parent, node, old, next, context);
      },
    });
    expect(parents).toEqual([target]);
    expect(root.textContent).toBe("afteroutside");
  });
  test("rejects render calls during component execution and releases the render guard", () => {
    render(h("section", null), root);
    const target = root.firstElementChild!;
    const Invalid = () => {
      render("reentrant", target);
      return null;
    };
    expect(() => render(h(Invalid, null), target)).toThrow(
      "during another render",
    );
    render("recovered", target);
    expect(target.textContent).toBe("recovered");
  });
  test("rejects ref-driven reentrant rendering while allowing ordinary ref assignment", () => {
    let rejection = "";
    render(
      h(
        "section",
        {
          ref: (target: Element | null) => {
            if (!target) return;
            try {
              render("reentrant", target);
            } catch (error) {
              rejection = (error as Error).message;
            }
          },
        },
        "original",
      ),
      root,
    );
    expect(rejection).toContain("during another render");
    expect(root.textContent).toBe("original");
    render("later", root.firstElementChild!);
    expect(root.textContent).toBe("later");
  });
});
