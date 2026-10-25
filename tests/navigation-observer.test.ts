import { describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { renderToString } from "../src/server/ssr";
import { createElement } from "../src/client/render";
import { injectViewTransitions } from "../src/server/document";
import Layout from "../examples/showcase/app/layout";
import { inspectDocument } from "../examples/showcase/navigation-diagnostics";
import initializeLayout from "../examples/showcase/app/layout.client";
function prepareObserver() {
  const html = injectViewTransitions(
    renderToString(
      createElement(Layout, { pathname: "/counter", children: "Content" }),
    ),
    true,
  );
  const dom = new JSDOM(html, {
    url: "https://showcase.test/counter?private=omitted",
    runScripts: "outside-only",
  });
  const marks: Array<{
    name: string;
    startTime: number;
    detail: Record<string, unknown>;
  }> = [];
  Object.defineProperties(dom.window.performance, {
    clearMarks: {
      value: (name: string) => {
        for (let index = marks.length - 1; index >= 0; index--) {
          if (marks[index]!.name === name) marks.splice(index, 1);
        }
      },
    },
    mark: {
      value: (
        name: string,
        options: {
          detail: Record<string, unknown>;
        },
      ) => {
        marks.push({ name, startTime: marks.length, detail: options.detail });
      },
    },
    getEntriesByType: {
      value: (type: string) => (type === "mark" ? marks : []),
    },
  });
  Object.defineProperty(dom.window, "matchMedia", {
    value: () => ({ matches: true }),
  });
  const script = dom.window.document.head.querySelector<HTMLScriptElement>(
    "script[data-tradjs-navigation-observer]",
  )!;
  expect(script).not.toBeNull();
  expect(script.hasAttribute("type")).toBe(false);
  expect(script.hasAttribute("async")).toBe(false);
  expect(script.hasAttribute("defer")).toBe(false);
  const before = dom.window.document.documentElement.outerHTML;
  dom.window.eval(script.textContent!);
  function dispatch(
    type: "pagereveal" | "pageswap",
    transition: {
      ready: Promise<void>;
      finished: Promise<void>;
    } | null,
  ) {
    const event = new dom.window.Event(type, { cancelable: true });
    Object.defineProperty(event, "viewTransition", { value: transition });
    dom.window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  }
  return { dom, marks, dispatch, before };
}
function preparePanel() {
  const observer = prepareObserver();
  const { dom } = observer;
  const document = dom.window.document;
  const panel = document.querySelector<HTMLDetailsElement>(
    "#navigation-diagnostics",
  )!;
  const report = panel.querySelector<HTMLTextAreaElement>(
    "[data-navigation-report]",
  )!;
  const summary = panel.querySelector<HTMLElement>(
    "[data-navigation-summary]",
  )!;
  const status = panel.querySelector<HTMLElement>(
    "[data-navigation-copy-status]",
  )!;
  const copy = panel.querySelector<HTMLButtonElement>(
    "[data-navigation-copy]",
  )!;
  const globals = {
    window: dom.window,
    document,
    navigator: dom.window.navigator,
    location: dom.window.location,
    performance: {
      now: globalThis.performance.now.bind(globalThis.performance),
      timeOrigin: globalThis.performance.timeOrigin,
      getEntriesByType: dom.window.performance.getEntriesByType.bind(
        dom.window.performance,
      ),
    },
    getComputedStyle: (...args: Parameters<typeof getComputedStyle>) =>
      dom.window.getComputedStyle(...args),
    matchMedia: (...args: Parameters<typeof matchMedia>) =>
      dom.window.matchMedia(...args),
  };
  const previous = new Map(
    Object.keys(globals).map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  );
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, {
      value,
      configurable: true,
      writable: true,
    });
  }
  initializeLayout();
  function close() {
    dom.window.close();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
  async function openPanel() {
    const toggled = new Promise<void>((resolve) =>
      panel.addEventListener("toggle", () => resolve(), { once: true }),
    );
    panel.open = true;
    await toggled;
  }
  async function copyReport() {
    const updated = new Promise<void>((resolve) => {
      const observer = new dom.window.MutationObserver(() => {
        if (status.textContent) {
          observer.disconnect();
          resolve();
        }
      });
      observer.observe(status, { childList: true });
    });
    copy.click();
    await updated;
  }
  return {
    ...observer,
    panel,
    report,
    summary,
    status,
    copy,
    openPanel,
    copyReport,
    close,
  };
}
describe("showcase early navigation observation", () => {
  test("records an incoming transition and exposes it to the later document inspection", async () => {
    const { dom, marks, dispatch, before } = prepareObserver();
    try {
      dispatch("pagereveal", {
        ready: Promise.resolve(),
        finished: Promise.resolve(),
      });
      await Promise.resolve();
      expect(marks.map((mark) => mark.name)).toEqual([
        "tradjs:navigation:pagereveal",
        "tradjs:navigation:ready",
        "tradjs:navigation:finished",
      ]);
      expect(marks[0]!.detail.browserCreatedTransition).toBe(true);
      expect(marks[0]!.detail.documentEndParsed).toBe(true);
      const report = dom.window.eval(
        `(${inspectDocument.toString()})();`,
      ) as ReturnType<typeof inspectDocument>;
      expect(
        report.recordedTransitions.map(
          (entry: { phase: string }) => entry.phase,
        ),
      ).toEqual(["pagereveal", "ready", "finished"]);
      expect(
        report.recordedTransitions.every(
          (entry: { path: string }) => entry.path === "/counter",
        ),
      ).toBe(true);
      expect(dom.window.document.documentElement.outerHTML).toBe(before);
    } finally {
      dom.window.close();
    }
  });
  test("records a skipped incoming transition even if finished resolves", async () => {
    const { dom, marks, dispatch, before } = prepareObserver();
    try {
      dispatch("pagereveal", {
        ready: Promise.reject(
          new dom.window.DOMException(
            "Duplicate view-transition-name",
            "InvalidStateError",
          ),
        ),
        finished: Promise.resolve(),
      });
      await Promise.resolve();
      expect(
        marks.some((mark) => mark.name === "tradjs:navigation:ready"),
      ).toBe(false);
      const skipped = marks.find(
        (mark) => mark.name === "tradjs:navigation:skipped",
      )!;
      expect(skipped.detail.errorName).toBe("InvalidStateError");
      expect(skipped.detail.message).toBe("Duplicate view-transition-name");
      expect(
        marks.some((mark) => mark.name === "tradjs:navigation:finished"),
      ).toBe(true);
      expect(dom.window.document.documentElement.outerHTML).toBe(before);
    } finally {
      dom.window.close();
    }
  });
  test("reports no transition accurately and keeps working after a BFCache-style reveal", async () => {
    const { dom, marks, dispatch, before } = prepareObserver();
    try {
      dispatch("pagereveal", null);
      expect(marks[0]!.detail.browserCreatedTransition).toBe(false);
      dispatch("pageswap", null);
      expect(marks).toHaveLength(2);
      for (let index = 0; index < 3; index++) {
        dispatch("pagereveal", {
          ready: Promise.resolve(),
          finished: Promise.resolve(),
        });
        await Promise.resolve();
        expect(marks).toHaveLength(3);
        expect(marks[0]!.detail.browserCreatedTransition).toBe(true);
      }
      expect(dom.window.document.documentElement.outerHTML).toBe(before);
    } finally {
      dom.window.close();
    }
  });
});
describe("showcase visible navigation diagnostics", () => {
  test("does not inspect styles or update the closed panel during navigation", async () => {
    const { close, dom, dispatch, panel, report, before } = preparePanel();
    try {
      let reads = 0;
      const original = dom.window.getComputedStyle.bind(dom.window);
      dom.window.getComputedStyle = (...args) => {
        reads++;
        return original(...args);
      };
      dispatch("pagereveal", {
        ready: Promise.resolve(),
        finished: Promise.resolve(),
      });
      await Promise.resolve();
      expect(panel.open).toBe(false);
      expect(report.value).toBe("");
      expect(reads).toBe(0);
      expect(dom.window.document.documentElement.outerHTML).toBe(before);
    } finally {
      close();
    }
  });
  test("shows ready accurately and copies a fresh complete report", async () => {
    const {
      close,
      dom,
      dispatch,
      openPanel,
      copyReport,
      report,
      summary,
      status,
      copy,
    } = preparePanel();
    try {
      let copied = "";
      Object.defineProperty(dom.window.navigator, "clipboard", {
        value: {
          writeText: async (value: string) => {
            copied = value;
          },
        },
      });
      await openPanel();
      expect(summary.textContent).toContain("No incoming observation");
      dispatch("pagereveal", {
        ready: Promise.resolve(),
        finished: Promise.resolve(),
      });
      await Promise.resolve();
      await copyReport();
      const result = JSON.parse(copied);
      expect(result.path).toBe("/counter");
      expect(result.observerInHead).toBe(true);
      expect(result.transitionPolicy).toBe("stable-root-v3");
      expect(
        result.recordedTransitions.map(
          (entry: { phase: string }) => entry.phase,
        ),
      ).toEqual(["pagereveal", "ready", "finished"]);
      expect(summary.textContent).toContain("reached ready");
      expect(summary.textContent).toContain("does not prove");
      expect(report.value).toBe(copied);
      expect(status.textContent).toContain("Report copied");
      expect(copy.disabled).toBe(false);
      expect(report.readOnly).toBe(true);
      expect(copied).not.toContain("private=omitted");
    } finally {
      close();
    }
  });
  test("shows a skipped transition and its browser error even when finished resolves", async () => {
    const { close, dom, dispatch, openPanel, report, summary } = preparePanel();
    try {
      dispatch("pagereveal", {
        ready: Promise.reject(
          new dom.window.DOMException(
            "Duplicate view-transition-name",
            "InvalidStateError",
          ),
        ),
        finished: Promise.resolve(),
      });
      await openPanel();
      expect(summary.textContent).toContain("skipped");
      expect(summary.textContent).toContain(
        "InvalidStateError: Duplicate view-transition-name",
      );
      const phases = JSON.parse(report.value).recordedTransitions.map(
        (entry: { phase: string }) => entry.phase,
      );
      expect(phases).toContain("finished");
      expect(phases).not.toContain("ready");
    } finally {
      close();
    }
  });
  test("distinguishes an observed reveal without a transition from missing observation", async () => {
    const { close, dom, dispatch, openPanel, panel, summary } = preparePanel();
    try {
      await openPanel();
      expect(summary.textContent).toContain("No incoming observation");
      dispatch("pagereveal", null);
      panel
        .querySelector<HTMLButtonElement>("[data-navigation-refresh]")!
        .click();
      expect(summary.textContent).toContain("supplied no incoming transition");
      expect(summary.textContent).toContain("test a sidebar link");
    } finally {
      close();
    }
  });
  test("does not call a pending transition successful", async () => {
    const { close, dom, dispatch, openPanel, summary } = preparePanel();
    try {
      dispatch("pagereveal", {
        ready: new Promise(() => {}),
        finished: new Promise(() => {}),
      });
      await openPanel();
      expect(summary.textContent).toContain("no ready or skipped result");
    } finally {
      close();
    }
  });
  for (const clipboard of ["absent", "denied"]) {
    test(`keeps the report available for manual copying when clipboard is ${clipboard}`, async () => {
      const { close, dom, openPanel, copyReport, report, status, copy } =
        preparePanel();
      try {
        Object.defineProperty(dom.window.navigator, "clipboard", {
          value:
            clipboard === "absent"
              ? undefined
              : {
                  writeText: async () => {
                    throw new dom.window.DOMException(
                      "Denied",
                      "NotAllowedError",
                    );
                  },
                },
        });
        await openPanel();
        await copyReport();
        expect(status.textContent).toContain("copy it manually");
        expect(JSON.parse(report.value).path).toBe("/counter");
        expect(copy.disabled).toBe(false);
      } finally {
        close();
      }
    });
  }
});
