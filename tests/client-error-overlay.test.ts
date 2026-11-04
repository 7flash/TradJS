import { describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { createClientBootstrap } from "../src/server/app-router";

function prepareBootstrap() {
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
    url: "https://app.test/",
    runScripts: "outside-only",
  });
  const script = createClientBootstrap(
    [{ url: "/client.js", type: "page" }],
    {},
  )
    .replace(/^<script type="module">/, "")
    .replace(/<\/script>$/, "")
    .replace("import(entry.url)", "Promise.resolve({})");
  const errors: unknown[] = [];
  dom.window.console.error = (...args: unknown[]) => errors.push(args);
  dom.window.eval(`(()=>{${script}})()`);
  function reject(reason: unknown) {
    const event = new dom.window.Event("unhandledrejection", {
      cancelable: true,
    });
    Object.defineProperty(event, "reason", { value: reason });
    dom.window.dispatchEvent(event);
    return event;
  }
  const overlay = () =>
    dom.window.document.getElementById("__tradjs-error-overlay");
  return { dom, errors, reject, overlay };
}

describe("client error overlay", () => {
  for (const message of [
    "Skipping view transition because skipTransition() was called.",
    "Transition was skipped",
  ]) {
    test(`ignores a skipped view transition: ${message}`, () => {
      const { dom, errors, reject, overlay } = prepareBootstrap();
      const event = reject(new dom.window.DOMException(message, "AbortError"));
      expect(overlay()).toBeNull();
      expect(errors).toEqual([]);
      expect(event.defaultPrevented).toBe(true);
      dom.window.close();
    });
  }

  test("still reports other abort errors", () => {
    const { dom, reject, overlay } = prepareBootstrap();
    const event = reject(
      new dom.window.DOMException("The user aborted a request.", "AbortError"),
    );
    expect(overlay()).not.toBeNull();
    expect(event.defaultPrevented).toBe(false);
    dom.window.close();
  });

  test("still reports view transition failures that are not skips", () => {
    const { dom, reject, overlay } = prepareBootstrap();
    reject(
      new dom.window.DOMException(
        "Duplicate view-transition-name",
        "InvalidStateError",
      ),
    );
    expect(overlay()).not.toBeNull();
    dom.window.close();
  });

  test("still reports ordinary unhandled rejections", () => {
    const { dom, reject, overlay } = prepareBootstrap();
    reject(new Error("broken"));
    expect(overlay()?.textContent).toContain("Unhandled promise rejection");
    dom.window.close();
  });
});
