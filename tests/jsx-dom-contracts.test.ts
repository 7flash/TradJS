import { describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { jsx, createElement } from "../src/client/jsx-dom";
describe("eager JSX runtime", () => {
  test("keeps automatic keys out of children and shares prop semantics", () => {
    const previous = globalThis.document,
      dom = new JSDOM();
    globalThis.document = dom.window.document;
    try {
      const ref = { current: null as Element | null };
      let calls = 0;
      const el = jsx(
        "button",
        {
          children: "OK",
          ref,
          "aria-expanded": false,
          onDoubleClick: () => calls++,
        },
        "row-1",
      ) as HTMLElement;
      expect(el.textContent).toBe("OK");
      expect(el.hasAttribute("key")).toBe(false);
      expect(el.getAttribute("aria-expanded")).toBe("false");
      expect(ref.current).toBe(el);
      el.dispatchEvent(new dom.window.MouseEvent("dblclick"));
      expect(calls).toBe(1);
      expect(createElement("p", null, "a", 0).textContent).toBe("a0");
      const raw = jsx("div", {
        dangerouslySetInnerHTML: { __html: "<b>raw</b>" },
        children: "ignored",
      });
      expect(raw.textContent).toBe("raw");
    } finally {
      globalThis.document = previous;
      dom.window.close();
    }
  });
});
