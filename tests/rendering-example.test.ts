import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import initializePage from "../examples/showcase/app/features/rendering/page.client";
import { render } from "../src/client/render";
let dom: JSDOM;
let root: HTMLElement;
let previousDocument: PropertyDescriptor | undefined;
beforeEach(() => {
  dom = new JSDOM('<div id="rendering-demo"></div>');
  root = dom.window.document.getElementById("rendering-demo")!;
  previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    value: dom.window.document,
    configurable: true,
  });
});
afterEach(() => {
  render(null, root);
  dom.window.close();
  if (previousDocument)
    Object.defineProperty(globalThis, "document", previousDocument);
  else Reflect.deleteProperty(globalThis, "document");
});
function button(label: string): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll("button")).find(
    (element) => element.textContent === label,
  );
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
describe("explicit rendering showcase", () => {
  test("controller actions update their sections and root reset keeps both sections usable", () => {
    initializePage();
    const counter = root.querySelector('[aria-label="Counter"]')!;
    const items = root.querySelector('[aria-label="Items"]')!;
    const counterButton = button("Increment");
    const addButton = button("Add item");
    expect(button("Reverse").disabled).toBe(true);
    counterButton.click();
    counterButton.click();
    expect(counter.textContent).toContain("2 clicks");
    expect(items.textContent).toContain("No items yet.");
    addButton.click();
    addButton.click();
    expect(items.textContent).toContain("2 items");
    const first = items.querySelector<HTMLLIElement>('[data-item-id="1"]')!;
    const second = items.querySelector<HTMLLIElement>('[data-item-id="2"]')!;
    expect(button("Reverse").disabled).toBe(false);
    button("Reverse").click();
    expect(Array.from(items.querySelectorAll("li"))).toEqual([second, first]);
    expect(counter.textContent).toContain("2 clicks");
    button("Reset").click();
    expect(counter.textContent).toContain("0 clicks");
    expect(items.textContent).toContain("No items yet.");
    expect(button("Increment")).toBe(counterButton);
    expect(button("Add item")).toBe(addButton);
    counterButton.click();
    addButton.click();
    expect(counter.textContent).toContain("1 click");
    expect(items.querySelector('[data-item-id="3"]')).not.toBeNull();
  });
  test("each initialization gets fresh state and removed handlers stop responding", () => {
    initializePage();
    const removedButton = button("Increment");
    removedButton.click();
    initializePage();
    expect(root.textContent).toContain("0 clicks");
    removedButton.click();
    expect(root.textContent).toContain("0 clicks");
    button("Increment").click();
    expect(root.textContent).toContain("1 click");
  });
  test("does nothing when the page has no rendering target", () => {
    root.removeAttribute("id");
    expect(initializePage()).toBeUndefined();
    expect(root.childNodes.length).toBe(0);
  });
});
