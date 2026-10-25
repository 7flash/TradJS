import { describe, expect, test } from "bun:test";
import { createElement as h } from "../src/client/render";
import { Fragment } from "../src/client/types";
import { renderToString, renderToStringAsync } from "../src/server/ssr";
import { Head, collectHeadAsync } from "../src/server/head";
import { injectHeadElements, serializeInlineScript } from "../src/server/html";
describe("HTML boundaries", () => {
  test("rejects unsafe tag names and filters case-insensitive event attributes", () => {
    expect(() => renderToString(h("div><script", null))).toThrow();
    const html = renderToString(
      h("input", {
        ONCLICK: "bad()",
        onmouseover: "bad()",
        'x"y': "bad",
        disabled: false,
        "aria-hidden": false,
        draggable: false,
      }),
    );
    expect(html).not.toContain("bad");
    expect(html).toContain('aria-hidden="false"');
    expect(html).toContain('draggable="false"');
    expect(html).not.toContain("disabled");
  });
  test("escapes text and shared CSS/SVG attributes", () => {
    const html = renderToString(
      h(
        "svg",
        null,
        h("path", {
          strokeWidth: 2,
          style: { "--tone": "red", strokeWidth: 3 },
        }),
        "<script>",
      ),
    );
    expect(html).toContain('stroke-width="2"');
    expect(html).toContain("--tone:red;stroke-width:3");
    expect(html).toContain("&lt;script&gt;");
  });
  test("head title replacement leaves body SVG titles intact", () => {
    const html = injectHeadElements(
      "<HTML><HEAD><title>old</title></HEAD><body><svg><title>icon</title></svg></body></HTML>",
      ["<title>new</title>"],
    );
    expect(html).not.toContain("<title>old</title>");
    expect(html).toContain("<title>new</title>");
    expect(html).toContain("<title>icon</title>");
  });
  test("concurrent Head collectors isolate asynchronous page metadata", async () => {
    let unlock!: () => void;
    const gate = new Promise<void>((resolve) => (unlock = resolve));
    const a = collectHeadAsync(async () => {
      await gate;
      return renderToStringAsync(
        h(
          Head,
          null,
          h(Fragment, null, h("title", null, "A"), h("meta", { name: "a" })),
        ),
      );
    });
    const b = await collectHeadAsync(() =>
      renderToStringAsync(h(Head, null, h("title", null, "B"))),
    );
    unlock();
    const first = await a;
    expect(first.head).toEqual(["<title>A</title>", '<meta name="a">']);
    expect(b.head).toEqual(["<title>B</title>"]);
  });
  test("inline JSON cannot close its script element", () => {
    const value = { text: "</script><script>alert(1)</script>\u2028" };
    const encoded = serializeInlineScript(value);
    expect(encoded).not.toContain("<");
    expect(JSON.parse(encoded)).toEqual(value);
  });
});
