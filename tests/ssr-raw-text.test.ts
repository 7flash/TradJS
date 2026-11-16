import { describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { createElement as h } from "../src/client/render";
import { Fragment } from "../src/client/types";
import { renderToString, renderToStringAsync } from "../src/server/ssr";
import { collectHead, Head } from "../src/server/head";

const both = async (vnode: any) => [renderToString(vnode), await renderToStringAsync(vnode)];

describe("raw-text elements in server output", () => {
  test("a CSS child combinator survives inside <style>", async () => {
    for (const html of await both(h("style", null, ".a > .b { color: red; }"))) {
      expect(html).toBe("<style>.a > .b { color: red; }</style>");
    }
  });

  test("script text keeps comparisons and quotes", async () => {
    for (const html of await both(h("script", null, `if (a > 1 && b < 2) log("x");`))) {
      expect(html).toBe(`<script>if (a > 1 && b < 2) log("x");</script>`);
    }
  });

  test("text cannot close <style> early, even split across children or in another case", async () => {
    const vnode = h("style", null, ".a > .b {} </St", "YlE><script>bad()</script>");
    for (const html of await both(vnode)) {
      expect(html).toContain("<\\/StYlE>");
      const dom = new JSDOM(`<!DOCTYPE html><head>${html}</head>`);
      expect(dom.window.document.querySelectorAll("style").length).toBe(1);
      expect(dom.window.document.querySelectorAll("script").length).toBe(0);
    }
  });

  test("text cannot close <script> early", async () => {
    for (const html of await both(h("script", null, `"</script><img src=x onerror=bad()>"`))) {
      const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`);
      expect(dom.window.document.querySelectorAll("img").length).toBe(0);
    }
  });

  test("fragments and arrays inside <style> join as text", async () => {
    const vnode = h("style", null, [".a", h(Fragment, null, " > ", ".b"), " {}"]);
    for (const html of await both(vnode)) expect(html).toBe("<style>.a > .b {}</style>");
  });

  test("ordinary text and attributes are still escaped", async () => {
    for (const html of await both(h("p", { title: `a"b>` }, "1 < 2 > 0 & <b>"))) {
      expect(html).toBe(`<p title="a&quot;b&gt;">1 &lt; 2 &gt; 0 &amp; &lt;b&gt;</p>`);
    }
  });

  test("<Head> keeps <style> text raw and closed", () => {
    const { head } = collectHead(() =>
      renderToString(
        h(Head, null, h("style", null, ".nav > a { color: red; } </style><script>x</script>")),
      ),
    );
    const html = head.join("");
    expect(html).toContain(".nav > a { color: red; }");
    expect(html).toContain("<\\/style>");
  });
});
