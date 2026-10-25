import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { createElement as h, Fragment, render, setReconciler } from "../src/client";

let dom: JSDOM;
let root: HTMLElement;
beforeEach(() => {
  dom = new JSDOM('<!doctype html><div id="root"></div>');
  const win = dom.window;
  Object.assign(globalThis, {
    window: win, document: win.document, Node: win.Node,
    Element: win.Element, HTMLElement: win.HTMLElement, Text: win.Text, Event: win.Event,
  });
  root = win.document.getElementById("root")!;
});
afterEach(() => {
  render(null, root);
  dom.window.close();
  setReconciler("auto");
});

for (const strategy of ["auto", "keyed", "sequential", "replace"] as const) {
  describe(`${strategy} controlled form state`, () => {
    beforeEach(() => setReconciler(strategy));

    test("radio selection resets after user interaction", () => {
      let picked = "a";
      const paint = () => render(h(Fragment, null, ...["a", "b"].map(id =>
        h("input", { key: id, type: "radio", name: "r", checked: picked === id,
          onChange: () => { picked = id; paint(); } }),
      )), root);
      paint();
      expect(root.querySelectorAll("input")[0].checked).toBe(true);
      root.querySelectorAll("input")[1].click();
      expect(picked).toBe("b");
      picked = "a";
      paint();
      const radios = root.querySelectorAll("input");
      expect(radios[0].checked).toBe(true);
      expect(radios[1].checked).toBe(false);
    });

    test("unchanged false and true checked props override a user's click", () => {
      for (const checked of [false, true]) {
        const paint = () => render(h("input", { type: "checkbox", checked }), root);
        paint();
        root.querySelector("input")!.click();
        expect(root.querySelector("input")!.checked).toBe(!checked);
        paint();
        expect(root.querySelector("input")!.checked).toBe(checked);
      }
    });

    for (const tag of ["input", "textarea"]) {
      test(`${tag} restores changed and unchanged values after typing`, () => {
        const paint = (value: string | null) => render(h(tag, { value }), root);
        const field = () => root.querySelector(tag) as HTMLInputElement;
        paint("initial");
        expect(field().value).toBe("initial");
        field().value = "typed";
        field().dispatchEvent(new dom.window.Event("input", { bubbles: true }));
        paint("updated");
        expect(field().value).toBe("updated");
        field().value = "typed again";
        paint("updated");
        expect(field().value).toBe("updated");
        paint(null);
        expect(field().value).toBe("");
      });
    }

    test("option selected props update the live select value", () => {
      const paint = (selected: string) => render(h("select", null,
        ...["a", "b"].map(value => h("option", { key: value, value, selected: selected === value }, value)),
      ), root);
      paint("a");
      const select = () => root.querySelector("select")!;
      select().value = "b";
      paint("a");
      expect(select().value).toBe("a");
      paint("b");
      expect(select().value).toBe("b");
    });

    test("select value is applied after new options mount", () => {
      const paint = (value: string, options: string[]) => render(h("select", { value },
        ...options.map(option => h("option", { key: option, value: option }, option)),
      ), root);
      paint("b", ["a", "b"]);
      expect(root.querySelector("select")!.value).toBe("b");
      paint("c", ["a", "c"]);
      expect(root.querySelector("select")!.value).toBe("c");
      root.querySelector("select")!.value = "a";
      paint("c", ["a", "c"]);
      expect(root.querySelector("select")!.value).toBe("c");
    });

    test("multiple select restores its controlled array after user edits", () => {
      const paint = () => render(h("select", { multiple: true, value: ["a", "c"] },
        ...["a", "b", "c"].map(value => h("option", { key: value, value }, value)),
      ), root);
      paint();
      const selected = () => Array.from(root.querySelector("select")!.selectedOptions, option => option.value);
      expect(selected()).toEqual(["a", "c"]);
      root.querySelector("select")!.value = "b";
      paint();
      expect(selected()).toEqual(["a", "c"]);
    });

    test("removing controlled props clears live input state", () => {
      render(h("input", { type: "checkbox", checked: true, value: "before" }), root);
      render(h("input", { type: "checkbox" }), root);
      expect(root.querySelector("input")!.checked).toBe(false);
      if (strategy !== "replace") expect(root.querySelector("input")!.value).toBe("");
    });

    test("uncontrolled input preserves user edits", () => {
      render(h("input", { title: "before" }), root);
      root.querySelector("input")!.value = "typed";
      render(h("input", { title: "after" }), root);
      // Replacement intentionally creates a fresh input; patching retains edits.
      if (strategy !== "replace") expect(root.querySelector("input")!.value).toBe("typed");
    });
  });
}
