import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import initializePage from "../examples/showcase/app/stress/page.client";
let dom: JSDOM;
const original = new Map<string, PropertyDescriptor | undefined>();
beforeEach(() => {
  dom = new JSDOM('<div id="throughput-root"></div>', {
    url: "https://showcase.test/stress",
  });
  for (const [name, value] of Object.entries({
    document: dom.window.document,
    window: dom.window,
    location: dom.window.location,
    fetch: globalThis.fetch,
  })) {
    original.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      value,
      configurable: true,
      writable: true,
    });
  }
});
afterEach(() => {
  dom.window.dispatchEvent(new dom.window.Event("pagehide"));
  dom.window.close();
  for (const [name, descriptor] of original) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});
function field(name: string, value: string) {
  const input = dom.window.document.querySelector<HTMLInputElement>(
    `input[name="${name}"]`,
  )!;
  input.value = value;
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
}
function submit() {
  dom.window.document
    .querySelector("form")!
    .dispatchEvent(
      new dom.window.Event("submit", { bubbles: true, cancelable: true }),
    );
}
async function finished() {
  for (let i = 0; i < 50; i++) {
    if (
      dom.window.document
        .querySelector('[role="status"]')
        ?.textContent?.includes("Finished:")
    )
      return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Run did not finish");
}
describe("throughput controls", () => {
  test("custom target state reaches requests and root updates retain the focused input", async () => {
    const urls: string[] = [];
    globalThis.fetch = (async (url: string) => {
      urls.push(url);
      return new Response("ok");
    }) as unknown as typeof fetch;
    initializePage();
    const input = dom.window.document.querySelector(
      'input[name="url"]',
    ) as HTMLInputElement;
    input.focus();
    field("url", "https://target.test/data?q=1");
    expect(dom.window.document.activeElement).toBe(input);
    field("maxRequests", "4");
    submit();
    expect(input.disabled).toBe(true);
    await finished();
    expect(urls).toEqual(Array(4).fill("https://target.test/data?q=1"));
    expect(input.disabled).toBe(false);
    expect(
      dom.window.document.querySelector("[data-results]")!.textContent,
    ).toContain("4 successful");
  });
  test("leaving the document stops every active request", async () => {
    globalThis.fetch = ((_url: string, options: RequestInit) =>
      new Promise((_resolve, reject) =>
        options.signal!.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          {
            once: true,
          },
        ),
      )) as unknown as typeof fetch;
    initializePage();
    submit();
    dom.window.dispatchEvent(new dom.window.Event("pagehide"));
    await finished();
    expect(
      dom.window.document.querySelector('[role="status"]')!.textContent,
    ).toContain("stopped");
    expect(
      dom.window.document.querySelector("[data-results]")!.textContent,
    ).toContain("4 cancelled");
  });
  test("invalid targets show an error without sending requests", () => {
    let called = false;
    globalThis.fetch = (() => {
      called = true;
      throw new Error("unexpected request");
    }) as unknown as typeof fetch;
    initializePage();
    field("url", "file:///tmp/data");
    submit();
    expect(called).toBe(false);
    expect(
      dom.window.document.querySelector('[role="alert"]')!.textContent,
    ).toContain("HTTP");
  });
});
