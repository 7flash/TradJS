import { afterEach, beforeEach, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { h, render } from "../src/client/index";
import { attachBoundary, createBoundary, detachBoundary } from "../src/client/boundary";

const previous = {
  document: globalThis.document,
  Element: globalThis.Element,
  HTMLElement: globalThis.HTMLElement,
  Text: globalThis.Text,
  Node: globalThis.Node,
};
let dom: JSDOM;
let host: HTMLElement;

beforeEach(() => {
  dom = new JSDOM("<div id='root'></div>");
  Object.assign(globalThis, {
    document: dom.window.document,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    Text: dom.window.Text,
    Node: dom.window.Node,
  });
  host = dom.window.document.getElementById("root")!;
});

afterEach(() => {
  Object.assign(globalThis, previous);
  dom.window.close();
});

test("renders a fallback and retries the last render with its options", () => {
  const failure = new Error("broken");
  const errors: unknown[] = [];
  const options = { reconciler: "sequential" } as const;
  const seen: unknown[] = [];
  let broken = true;
  let retry!: () => boolean;
  const boundary = createBoundary({
    fallback(error, reset) {
      errors.push(error);
      retry = reset;
      return h("button", { onClick: reset }, "Retry: " + (error as Error).message);
    },
  });
  const attachment = {};
  attachBoundary(boundary, host, attachment, (received) => {
    seen.push(received);
    if (broken) throw failure;
    render(h("p", null, "Recovered"), host, received);
    return true;
  });

  expect(boundary.render(options)).toBe(true);
  expect(errors).toEqual([failure]);
  expect(boundary.current).toBe(host);
  expect(host.textContent).toBe("Retry: broken");

  broken = false;
  host.querySelector("button")!.dispatchEvent(new dom.window.MouseEvent("click"));
  expect(seen).toEqual([options, options]);
  expect(host.textContent).toBe("Recovered");
  expect(boundary.reset()).toBe(true);
  expect(seen).toEqual([options, options, options]);

  detachBoundary(boundary, host, attachment);
  expect(boundary.current).toBeNull();
  expect(boundary.reset()).toBe(false);
  attachBoundary(boundary, host, {}, () => true);
  expect(retry()).toBe(false); // Old fallback cannot retry a new attachment.
});

test("without a fallback, throws as before and retains the attachment", () => {
  const boundary = createBoundary();
  const failure = new Error("broken");
  attachBoundary(boundary, host, {}, () => { throw failure; });
  expect(() => boundary.render()).toThrow(failure);
  expect(boundary.current).toBe(host);
  expect(() => boundary.reset()).toThrow(failure);
});

test("propagates failures thrown by the fallback", () => {
  const boundary = createBoundary({
    fallback: () => { throw new Error("fallback failed"); },
  });
  attachBoundary(boundary, host, {}, () => { throw new Error("render failed"); });
  expect(() => boundary.render()).toThrow("fallback failed");
});
