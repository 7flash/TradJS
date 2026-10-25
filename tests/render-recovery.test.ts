import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { createElement as h, render } from "../src/client/render";
import { Fragment } from "../src/client/types";
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
function caughtError(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error("Expected an error");
}
describe("render failure recovery", () => {
  test("a failed component replacement does not strand the next render on a detached node", () => {
    const failure = new Error("component failed");
    const Broken = () => {
      throw failure;
    };
    render("before", root);
    expect(() => render(h(Broken, null), root)).toThrow(failure);
    render("recovered", root);
    expect(root.textContent).toBe("recovered");
  });
  test("a failed partial mount releases its listeners and refs", () => {
    const ref = { current: null as Element | null };
    let leaked: HTMLButtonElement | null = null;
    let clicks = 0;
    const Broken = () => {
      throw new Error("later child failed");
    };
    const buttonRef = (node: Element | null) => {
      ref.current = node;
      if (node) leaked = node as HTMLButtonElement;
    };
    expect(() =>
      render(
        h(
          Fragment,
          null,
          h("button", { ref: buttonRef, onClick: () => clicks++ }, "new"),
          h(Broken, null),
        ),
        root,
      ),
    ).toThrow("later child failed");
    expect(ref.current).toBeNull();
    (leaked as HTMLButtonElement | null)?.click();
    expect(clicks).toBe(0);
    render(h("p", null, "fallback"), root);
    expect(root.innerHTML).toBe("<p>fallback</p>");
  });
  for (const reconciler of [
    "auto",
    "keyed",
    "sequential",
    "replace",
  ] as const) {
    test(`${reconciler}: subtree failure preserves its target and siblings, and parent rendering recovers`, () => {
      let value = "initial";
      const refs: (Element | null)[] = [];
      const targetRef = (node: Element | null) => refs.push(node);
      const App = () =>
        h(
          "main",
          null,
          h("section", { ref: targetRef, className: "region" }, value),
          h("aside", null, "sibling"),
        );
      const rootFiber = render(h(App, null), root, { reconciler });
      const target = root.querySelector("section")!;
      const sibling = root.querySelector("aside");
      const failure = new Error("broken replacement");
      const Broken = () => {
        throw failure;
      };
      expect(
        caughtError(() => render(h(Broken, null), target, { reconciler })),
      ).toBe(failure);
      expect(root.querySelector("section")).toBe(target);
      expect(root.querySelector("aside")).toBe(sibling);
      expect(target.className).toBe("region");
      expect(target.childNodes.length).toBe(0);
      expect(refs).toEqual([target]);
      const targetFiber = render(h("b", null, "fallback"), target, {
        reconciler,
      });
      expect(targetFiber.parent).not.toBeNull();
      expect(target.textContent).toBe("fallback");
      value = "parent recovered";
      expect(render(h(App, null), root, { reconciler })).toBe(rootFiber);
      expect(root.textContent).toBe("parent recoveredsibling");
    });
    test(`${reconciler}: a partially updated list releases old and newly mounted descendants`, () => {
      const oldRef = { current: null as Element | null };
      const newRef = { current: null as Element | null };
      let created: HTMLButtonElement | null = null;
      let clicks = 0;
      render(
        [
          h(
            "button",
            { key: "old", ref: oldRef, onClick: () => clicks++ },
            "old",
          ),
        ],
        root,
        { reconciler },
      );
      const old = oldRef.current as HTMLButtonElement;
      const Broken = () => {
        throw new Error("last row failed");
      };
      const remember = (node: Element | null) => {
        newRef.current = node;
        if (node) created = node as HTMLButtonElement;
      };
      expect(() =>
        render(
          [
            h(
              "button",
              { key: "old", ref: oldRef, onClick: () => clicks++ },
              "updated",
            ),
            h(
              "button",
              { key: "new", ref: remember, onClick: () => clicks++ },
              "new",
            ),
            h(Broken, { key: "broken" }),
          ],
          root,
          { reconciler },
        ),
      ).toThrow("last row failed");
      expect(root.childNodes.length).toBe(0);
      expect(oldRef.current).toBeNull();
      expect(newRef.current).toBeNull();
      old.click();
      (created as HTMLButtonElement | null)?.click();
      expect(clicks).toBe(0);
      render(h("p", null, "recovered"), root, { reconciler });
      expect(root.innerHTML).toBe("<p>recovered</p>");
    });
  }
  test("a throwing detach ref does not prevent child or sibling cleanup", () => {
    const failure = new Error("detach failed");
    const child = { current: null as Element | null };
    const sibling = { current: null as Element | null };
    let detached = 0;
    let clicks = 0;
    const parentRef = (node: Element | null) => {
      if (!node) {
        detached++;
        throw failure;
      }
    };
    render(
      h(
        "section",
        { ref: parentRef },
        h("button", { ref: child, onClick: () => clicks++ }, "child"),
        h("span", { ref: sibling }, "sibling"),
      ),
      root,
    );
    const button = child.current as HTMLButtonElement;
    expect(caughtError(() => render(null, root))).toBe(failure);
    expect(detached).toBe(1);
    expect(child.current).toBeNull();
    expect(sibling.current).toBeNull();
    button.click();
    expect(clicks).toBe(0);
    expect(root.childNodes.length).toBe(0);
    render("recovered", root);
    expect(root.textContent).toBe("recovered");
  });
  test("a ref that throws during initial attachment is detached exactly once", () => {
    const failure = new Error("attach failed");
    const calls: (Element | null)[] = [];
    let button: HTMLButtonElement | null = null;
    let clicks = 0;
    const ref = (node: Element | null) => {
      calls.push(node);
      if (node) {
        button = node as HTMLButtonElement;
        throw failure;
      }
    };
    expect(
      caughtError(() =>
        render(h("button", { ref, onClick: () => clicks++ }, "new"), root),
      ),
    ).toBe(failure);
    expect(calls).toEqual([button, null]);
    (button as HTMLButtonElement | null)?.click();
    expect(clicks).toBe(0);
    expect(root.childNodes.length).toBe(0);
    render("recovered", root);
    expect(root.textContent).toBe("recovered");
  });
  test("a replacement ref that throws is tracked independently of the previous VNode", () => {
    const oldRef = { current: null as Element | null };
    const calls: (Element | null)[] = [];
    const failure = new Error("new ref failed");
    render(h("button", { ref: oldRef }, "before"), root);
    const node = oldRef.current;
    const nextRef = (element: Element | null) => {
      calls.push(element);
      if (element) throw failure;
    };
    expect(
      caughtError(() => render(h("button", { ref: nextRef }, "after"), root)),
    ).toBe(failure);
    expect(oldRef.current).toBeNull();
    expect(calls).toEqual([node, null]);
    render(h("button", { ref: oldRef }, "recovered"), root);
    expect(oldRef.current).toBe(root.firstElementChild);
    expect(root.textContent).toBe("recovered");
  });
  test("changing a throwing old ref does not call its detach twice", () => {
    const failure = new Error("old ref failed");
    let detachments = 0;
    const ref = (node: Element | null) => {
      if (!node) {
        detachments++;
        throw failure;
      }
    };
    const replacement = { current: null as Element | null };
    render(h("button", { ref }, "before"), root);
    expect(
      caughtError(() =>
        render(h("button", { ref: replacement }, "after"), root),
      ),
    ).toBe(failure);
    expect(detachments).toBe(1);
    expect(replacement.current).toBeNull();
    render(h("button", { ref: replacement }, "recovered"), root);
    expect(replacement.current).toBe(root.firstElementChild);
  });
  test("cleanup errors are reported together with the original render failure", () => {
    const primary = new Error("component failed");
    const cleanup = new Error("cleanup failed");
    let detached = 0;
    const ref = (node: Element | null) => {
      if (!node) {
        detached++;
        throw cleanup;
      }
    };
    const Broken = () => {
      throw primary;
    };
    const error = caughtError(() =>
      render(
        h(Fragment, null, h("button", { ref }, "new"), h(Broken, null)),
        root,
      ),
    ) as AggregateError;
    expect(error).toBeInstanceOf(AggregateError);
    expect(error.cause).toBe(primary);
    expect(error.errors).toEqual([primary, cleanup]);
    expect(detached).toBe(1);
    render("recovered", root);
    expect(root.textContent).toBe("recovered");
  });
  test("multiple detach failures do not stop cleanup of the remaining nodes", () => {
    const first = new Error("first ref failed");
    const second = new Error("second ref failed");
    const last = { current: null as Element | null };
    render(
      h(
        "section",
        null,
        h("b", {
          ref: (node: Element | null) => {
            if (!node) throw first;
          },
        }),
        h("i", {
          ref: (node: Element | null) => {
            if (!node) throw second;
          },
        }),
        h("span", { ref: last }),
      ),
      root,
    );
    const error = caughtError(() => render(null, root)) as AggregateError;
    expect(error.errors).toEqual([first, second]);
    expect(last.current).toBeNull();
    expect(root.childNodes.length).toBe(0);
    render("recovered", root);
    expect(root.textContent).toBe("recovered");
  });
  test("a failed render into raw HTML leaves parent restoration possible", () => {
    const original = h("section", {
      dangerouslySetInnerHTML: { __html: "<b>raw</b>" },
    });
    Object.freeze(original.props);
    render(original, root);
    const target = root.firstElementChild!;
    const Broken = () => {
      throw new Error("failed");
    };
    expect(() => render(h(Broken, null), target)).toThrow("failed");
    expect(target.textContent).toBe("");
    render(original, root);
    expect(target.innerHTML).toBe("<b>raw</b>");
  });
  test("a failure while taking over independent roots still cleans all roots", () => {
    const first = dom.window.document.createElement("div");
    const second = dom.window.document.createElement("div");
    root.append(first, second);
    const failure = new Error("nested cleanup failed");
    const ref = { current: null as Element | null };
    render(
      h("button", {
        ref: (node: Element | null) => {
          if (!node) throw failure;
        },
      }),
      first,
    );
    render(h("span", { ref }), second);
    expect(caughtError(() => render("outer", root))).toBe(failure);
    expect(ref.current).toBeNull();
    expect(root.childNodes.length).toBe(0);
    render("recovered", root);
    expect(root.textContent).toBe("recovered");
  });
  test("failed custom reconciliation cleans nodes mounted through its context", () => {
    const ref = { current: null as Element | null };
    const failure = new Error("custom reconciler failed");
    render("old", root);
    expect(
      caughtError(() =>
        render("unused", root, {
          reconciler: (parent, node, old, next, context) => {
            context.mountVNode(h("button", { ref }, "partial"), parent, node);
            throw failure;
          },
        }),
      ),
    ).toBe(failure);
    expect(ref.current).toBeNull();
    expect(root.childNodes.length).toBe(0);
    render("recovered", root);
    expect(root.textContent).toBe("recovered");
  });
  test("a native DOM exception leaves the target reusable", () => {
    render("old", root);
    expect(() => render(h("invalid tag", null), root)).toThrow();
    expect(root.childNodes.length).toBe(0);
    render("recovered", root);
    expect(root.textContent).toBe("recovered");
  });
  test("an async component rejection by the synchronous renderer leaves the target reusable", () => {
    render("old", root);
    expect(() =>
      render(
        h(() => Promise.resolve("later"), null),
        root,
      ),
    ).toThrow("browser render() is synchronous");
    expect(root.childNodes.length).toBe(0);
    render("recovered", root);
    expect(root.textContent).toBe("recovered");
  });
  test("invalid target rejection does not clear the owning tree", () => {
    render(
      h("section", { dangerouslySetInnerHTML: { __html: "<b>raw</b>" } }),
      root,
    );
    const raw = root.querySelector("b")!;
    expect(() => render("new", raw)).toThrow("untracked descendant");
    expect(root.innerHTML).toBe("<section><b>raw</b></section>");
  });
});
describe("native event listener lifecycle", () => {
  test("stable handlers stay installed, changed handlers replace the old listener, and removed handlers stop firing", () => {
    const calls: string[] = [];
    const stable = () => calls.push("stable");
    const next = () => calls.push("next");
    render(h("button", { onClick: stable }, "initial"), root);
    const button = root.firstElementChild as HTMLButtonElement;
    let added = 0;
    let removed = 0;
    const add = button.addEventListener;
    const remove = button.removeEventListener;
    button.addEventListener = (...args: Parameters<typeof add>) => {
      added++;
      add.apply(button, args);
    };
    button.removeEventListener = (...args: Parameters<typeof remove>) => {
      removed++;
      remove.apply(button, args);
    };
    render(h("button", { onClick: stable }, "updated"), root);
    expect(added).toBe(0);
    expect(removed).toBe(0);
    button.click();
    render(h("button", { onClick: next }, "updated"), root);
    expect(added).toBe(1);
    expect(removed).toBe(1);
    button.click();
    render(h("button", { onClick: null }, "updated"), root);
    expect(removed).toBe(2);
    button.click();
    expect(calls).toEqual(["stable", "next"]);
  });
});
