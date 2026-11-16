import { beforeAll, describe, expect, test } from "bun:test";
import path from "path";
import { JSDOM } from "jsdom";
import { createAppRouter } from "../src/server/app-router";

const appDir = path.join(import.meta.dir, "..", "examples", "showcase", "app");
let html: string;
let disabledHtml: string;

beforeAll(async () => {
  const enabled = createAppRouter({ appDir });
  const disabled = createAppRouter({ appDir, viewTransitions: false });
  const response = (await enabled(new Request("https://app.test/counter"))) as Response;
  const disabledResponse = (await disabled(new Request("https://app.test/counter"))) as Response;
  expect(response.status).toBe(200);
  expect(disabledResponse.status).toBe(200);
  html = await response.text();
  disabledHtml = await disabledResponse.text();
});

function prepareBootstrap() {
  const dom = new JSDOM(html, {
    url: "https://app.test/counter",
    runScripts: "outside-only",
  });
  const script = dom.window.document.querySelector<HTMLScriptElement>(
    "script[data-tradjs-client]",
  );
  expect(script).not.toBeNull();
  const code = script!.textContent!;
  const entriesMatch = code.match(/^const __tradjsScripts=(.*);$/m);
  expect(entriesMatch).not.toBeNull();
  const entries = JSON.parse(entriesMatch![1]) as {
    url: string;
    type: "layout" | "page";
  }[];
  // JSDOM cannot load the built bundles; substitute only the import expression.
  // Everything else executes from the router's actual response HTML.
  const runnable = code.replace(
    "import(entry.url)",
    "__tradjsTestImport(entry.url)",
  );
  expect(runnable).not.toBe(code);
  const evaluate = dom.window.Function(
    "__tradjsTestImport",
    `return (async()=>{${runnable}})();`,
  ) as (load: (url: string) => Promise<unknown>) => Promise<void>;
  const errors: unknown[][] = [];
  dom.window.console.error = (...args: unknown[]) => errors.push(args);
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
  return { dom, script: script!, entries, evaluate, errors, reject, overlay };
}

describe("createAppRouter navigation HTML", () => {
  test("uses stable-root styling and waits for the end of the streamed page", () => {
    const dom = new JSDOM(html);
    try {
      const doc = dom.window.document;
      const style = doc.querySelectorAll("style[data-tradjs-view-transitions]");
      expect(style).toHaveLength(1);
      expect(style[0].getAttribute("data-tradjs-view-transitions")).toBe(
        "stable-root-v3",
      );
      expect(style[0].textContent).toContain("@view-transition { navigation: auto; }");
      expect(style[0].textContent).toContain("::view-transition-group(root)");
      expect(style[0].textContent).toContain("prefers-reduced-motion: reduce");
      expect(style[0].textContent).toContain("animation: none !important");
      expect(style[0].textContent).not.toContain("navigation: none");
      const ready = doc.head.querySelector<HTMLLinkElement>(
        'link[rel="expect"][data-tradjs-document-ready]',
      );
      expect(ready?.getAttribute("blocking")).toBe("render");
      const marker = doc.querySelector(ready!.getAttribute("href")!);
      expect(marker?.hasAttribute("data-tradjs-document-end")).toBe(true);
      expect(marker?.hasAttribute("hidden")).toBe(true);
      expect(doc.body.lastElementChild).toBe(marker);
      expect(doc.querySelector("#page-content")).not.toBeNull();
    } finally {
      dom.window.close();
    }
  });

  test("supports viewTransitions: false without a readiness marker", () => {
    const dom = new JSDOM(disabledHtml);
    try {
      const doc = dom.window.document;
      expect(doc.querySelector("[data-tradjs-view-transitions]")).toBeNull();
      expect(doc.querySelector("[data-tradjs-document-ready]")).toBeNull();
      expect(doc.querySelector("[data-tradjs-document-end]")).toBeNull();
    } finally {
      dom.window.close();
    }
  });

  test("mounts layout before importing or mounting the page", async () => {
    const { dom, script, entries, evaluate, errors } = prepareBootstrap();
    try {
      expect(script.parentElement).toBe(dom.window.document.head);
      expect(script.getAttribute("type")).toBe("module");
      expect(script.getAttribute("blocking")).toBe("render");
      expect(entries.map((entry) => entry.type)).toEqual(["layout", "page"]);
      const events: string[] = [];
      let releaseLayout!: () => void;
      let markLayoutStarted!: () => void;
      const layoutStarted = new Promise<void>((resolve) => (markLayoutStarted = resolve));
      const layoutHeld = new Promise<void>((resolve) => (releaseLayout = resolve));
      const running = evaluate(async (url) => {
        if (url === entries[0].url) {
          events.push("import layout");
          return {
            default: async () => {
              events.push("start layout");
              markLayoutStarted();
              await layoutHeld;
              events.push("finish layout");
            },
          };
        }
        expect(url).toBe(entries[1].url);
        events.push("import page");
        return { default: async () => events.push("start page") };
      });
      await layoutStarted;
      expect(events).toEqual(["import layout", "start layout"]);
      releaseLayout();
      await running;
      expect(events).toEqual([
        "import layout", "start layout", "finish layout", "import page", "start page",
      ]);
      expect(errors).toEqual([]);
    } finally {
      dom.window.close();
    }
  });
  test("reports initializer failures without starting dependent pages", async () => {
    const { dom, entries, evaluate, errors, overlay } = prepareBootstrap();
    try {
      const imports: string[] = [];
      await evaluate(async (url) => {
        imports.push(url);
        return { default: async () => { throw new Error("layout mount failed"); } };
      });
      expect(imports).toEqual([entries[0].url]);
      expect(overlay()?.textContent).toContain("Failed to mount layout script");
      expect(errors).toHaveLength(1);
    } finally {
      dom.window.close();
    }
  });
});

describe("createAppRouter client error overlay", () => {
  for (const [name, message] of [
    ["AbortError", "Skipping view transition because skipTransition() was called."],
    ["AbortError", "Transition was skipped"],
    ["TimeoutError", "View transition timed out while waiting for readiness"],
    ["TimeoutError", "ViewTransition was skipped after a timeout"],
  ]) {
    test(`ignores expected ${name}: ${message}`, async () => {
      const { dom, evaluate, errors, reject, overlay } = prepareBootstrap();
      try {
        await evaluate(async () => ({}));
        const event = reject(new dom.window.DOMException(message, name));
        expect(overlay()).toBeNull();
        expect(errors).toEqual([]);
        expect(event.defaultPrevented).toBe(true);
      } finally {
        dom.window.close();
      }
    });
  }

  for (const [name, message] of [
    ["AbortError", "The user aborted a request."],
    ["TimeoutError", "Fetch request timed out"],
    ["InvalidStateError", "Duplicate view-transition-name"],
    ["Error", "An unrelated promise rejected"],
  ]) {
    test(`reports unrelated ${name}: ${message}`, async () => {
      const { dom, evaluate, errors, reject, overlay } = prepareBootstrap();
      try {
        await evaluate(async () => ({}));
        const reason = name === "Error"
          ? new dom.window.Error(message)
          : new dom.window.DOMException(message, name);
        const event = reject(reason);
        expect(event.defaultPrevented).toBe(false);
        expect(overlay()?.textContent).toContain("Unhandled promise rejection");
        expect(errors).toHaveLength(1);
      } finally {
        dom.window.close();
      }
    });
  }
});
