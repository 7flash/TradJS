import { describe, expect, test } from "bun:test";
import { jsx } from "../src/client/render";
import { renderToString, renderToStringAsync } from "../src/server/ssr";

describe("async SSR", () => {
  test("renders an async root component", async () => {
    const Page = async () => jsx("main", { children: "ready" });
    const html = await renderToStringAsync(jsx(Page, {}));
    expect(html).toBe("<main>ready</main>");
  });

  test("renders nested async components", async () => {
    const AsyncChild = async () =>
      jsx("span", { children: "<escaped & safe>" });
    const Parent = () => jsx("section", { children: jsx(AsyncChild, {}) });
    const html = await renderToStringAsync(jsx(Parent, {}));
    expect(html).toBe(
      "<section><span>&lt;escaped &amp; safe&gt;</span></section>",
    );
  });

  test("preserves sibling order around async children", async () => {
    const Slow = async () => {
      await Promise.resolve();
      return jsx("b", { children: "two" });
    };
    const tree = jsx("div", {
      children: [
        jsx("span", { children: "one" }),
        jsx(Slow, {}),
        jsx("span", { children: "three" }),
      ],
    });
    expect(await renderToStringAsync(tree)).toBe(
      "<div><span>one</span><b>two</b><span>three</span></div>",
    );
  });

  test("propagates async component failures", async () => {
    const Broken = async () => {
      throw new Error("async render failed");
    };
    await expect(renderToStringAsync(jsx(Broken, {}))).rejects.toThrow(
      "async render failed",
    );
  });

  test("keeps synchronous renderer strict and identifies the async component", () => {
    const AsyncChild = async () => jsx("span", { children: "async" });

    try {
      renderToString(jsx(AsyncChild, {}));
      throw new Error("expected synchronous render to fail");
    } catch (error: any) {
      expect(error.code).toBe("TRADJS_ASYNC_COMPONENT_IN_SYNC_RENDER");
      expect(error.componentName).toBe("AsyncChild");
      expect(error.message).toContain('async component "AsyncChild"');
    }
  });

  test("keeps fully synchronous trees on the synchronous renderer", () => {
    const Child = () => jsx("span", { children: "sync" });
    const Page = () => jsx("main", { children: jsx(Child, {}) });

    expect(renderToString(jsx(Page, {}))).toBe(
      "<main><span>sync</span></main>",
    );
  });
});
