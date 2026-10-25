import { describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { createElement as h, render } from "../src/client/render";
describe("native navigation", () => {
  test("anchors preserve browser navigation semantics", () => {
    const dom = new JSDOM("<main></main>", {
      url: "https://example.test/start",
    });
    try {
      const root = dom.window.document.querySelector("main")!;
      render(
        h(
          "a",
          {
            href: "/next?x=1#part",
            target: "_blank",
            rel: "noopener",
            download: "report.txt",
          },
          "Next",
        ),
        root,
      );
      const a = root.querySelector("a")!;
      expect(a.href).toBe("https://example.test/next?x=1#part");
      expect(a.target).toBe("_blank");
      expect(a.download).toBe("report.txt");
      const click = new dom.window.MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
      });
      a.addEventListener(
        "click",
        (event) => {
          expect(event.defaultPrevented).toBe(false);
          event.preventDefault();
        },
        { once: true },
      );
      a.dispatchEvent(click);
    } finally {
      dom.window.close();
    }
  });
});
