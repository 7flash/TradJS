/**
 * melina/server — SSR Unit Tests
 *
 * Tests renderToString for correctness: elements, components,
 * fragments, <Head> side-channel, escaping, void elements, style objects.
 *
 * Run: bun test tests/ssr.test.ts
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { renderToString } from "../src/server/ssr";
import { createElement } from "../src/client/render";
import { Fragment } from "../src/client/types";
import { Head, resetHead, getHeadElements } from "../src/server/head";
import type { VNode } from "../src/client/types";

function h(type: any, props: any, ...children: any[]): VNode {
  return createElement(type, props, ...children);
}

// ─── Basic Elements ────────────────────────────────────────────────────────────

describe("renderToString — Elements", () => {
  test("renders a simple div", () => {
    const html = renderToString(h("div", null, "hello"));
    expect(html).toBe("<div>hello</div>");
  });

  test("renders nested elements", () => {
    const html = renderToString(
      h("div", null, h("span", null, "inner"), h("p", null, "paragraph")),
    );
    expect(html).toBe("<div><span>inner</span><p>paragraph</p></div>");
  });

  test("renders className as class", () => {
    const html = renderToString(h("div", { className: "foo bar" }));
    expect(html).toBe('<div class="foo bar"></div>');
  });

  test("renders boolean attributes", () => {
    const html = renderToString(h("input", { disabled: true, type: "text" }));
    expect(html).toBe('<input disabled type="text">');
  });

  test("skips false/null/undefined attributes", () => {
    const html = renderToString(
      h("div", { id: "ok", hidden: false, title: null, "data-x": undefined }),
    );
    expect(html).toBe('<div id="ok"></div>');
  });

  test("skips event handlers", () => {
    const html = renderToString(
      h("button", { onClick: () => {}, onMouseDown: () => {} }, "click"),
    );
    expect(html).toBe("<button>click</button>");
  });

  test("renders void elements without closing tag", () => {
    expect(renderToString(h("br", null))).toBe("<br>");
    expect(renderToString(h("img", { src: "/pic.png", alt: "pic" }))).toBe(
      '<img src="/pic.png" alt="pic">',
    );
    expect(renderToString(h("input", { type: "email" }))).toBe(
      '<input type="email">',
    );
    expect(renderToString(h("hr", null))).toBe("<hr>");
    expect(renderToString(h("meta", { charSet: "utf-8" }))).toBe(
      '<meta charSet="utf-8">',
    );
  });

  test("renders style objects as CSS string", () => {
    const html = renderToString(
      h("div", {
        style: { color: "red", fontSize: "14px", marginTop: "10px" },
      }),
    );
    expect(html).toBe(
      '<div style="color:red;font-size:14px;margin-top:10px"></div>',
    );
  });

  test("renders dangerouslySetInnerHTML", () => {
    const html = renderToString(
      h("div", { dangerouslySetInnerHTML: { __html: "<b>bold</b>" } }),
    );
    expect(html).toBe("<div><b>bold</b></div>");
  });
});

// ─── HTML Escaping ─────────────────────────────────────────────────────────────

describe("renderToString — Escaping", () => {
  test("escapes text content", () => {
    const html = renderToString(
      h("div", null, '<script>alert("xss")</script>'),
    );
    expect(html).toBe(
      "<div>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</div>",
    );
  });

  test("escapes attribute values", () => {
    const html = renderToString(h("div", { title: 'a "quoted" & <special>' }));
    expect(html).toBe(
      '<div title="a &quot;quoted&quot; &amp; &lt;special&gt;"></div>',
    );
  });

  test("renders numbers as-is", () => {
    const html = renderToString(h("span", null, 42));
    expect(html).toBe("<span>42</span>");
  });
});

// ─── Primitives & Falsy Values ─────────────────────────────────────────────────

describe("renderToString — Primitives", () => {
  test("renders strings", () => {
    expect(renderToString("hello")).toBe("hello");
  });

  test("renders numbers", () => {
    expect(renderToString(42)).toBe("42");
  });

  test("renders null/undefined/booleans as empty", () => {
    expect(renderToString(null)).toBe("");
    expect(renderToString(undefined)).toBe("");
    expect(renderToString(true)).toBe("");
    expect(renderToString(false)).toBe("");
  });

  test("renders arrays", () => {
    const html = renderToString([
      h("span", null, "a"),
      h("span", null, "b"),
    ] as any);
    expect(html).toBe("<span>a</span><span>b</span>");
  });
});

// ─── Components ────────────────────────────────────────────────────────────────

describe("renderToString — Components", () => {
  test("renders a function component", () => {
    function Greeting({ name }: { name: string }) {
      return h("h1", null, `Hello, ${name}!`);
    }
    const html = renderToString(h(Greeting, { name: "World" }));
    expect(html).toBe("<h1>Hello, World!</h1>");
  });

  test("renders nested components", () => {
    function Inner() {
      return h("span", null, "inside");
    }
    function Outer() {
      return h("div", null, h(Inner, null));
    }
    const html = renderToString(h(Outer, null));
    expect(html).toBe("<div><span>inside</span></div>");
  });

  test("passes children to components", () => {
    function Wrapper({ children }: { children: any }) {
      return h("section", null, children);
    }
    const html = renderToString(h(Wrapper, null, h("p", null, "content")));
    expect(html).toBe("<section><p>content</p></section>");
  });

  test("renders component returning null", () => {
    function Empty() {
      return null;
    }
    expect(renderToString(h(Empty, null))).toBe("");
  });
});

// ─── Fragments ─────────────────────────────────────────────────────────────────

describe("renderToString — Fragments", () => {
  test("renders fragment children without wrapper", () => {
    const html = renderToString(
      h(Fragment, null, h("span", null, "a"), h("span", null, "b")),
    );
    expect(html).toBe("<span>a</span><span>b</span>");
  });

  test("renders nested fragments", () => {
    const html = renderToString(
      h(
        Fragment,
        null,
        h(Fragment, null, h("span", null, "1")),
        h("span", null, "2"),
      ),
    );
    expect(html).toBe("<span>1</span><span>2</span>");
  });
});

// ─── <Head> Component ──────────────────────────────────────────────────────────

describe("renderToString — Head", () => {
  beforeEach(() => {
    resetHead();
  });

  test("Head renders nothing in body", () => {
    const html = renderToString(
      h(
        "div",
        null,
        h(Head, null, h("title", null, "Test Page")),
        h("p", null, "content"),
      ),
    );
    expect(html).toBe("<div><p>content</p></div>");
  });

  test("Head collects elements in side-channel", () => {
    renderToString(
      h(
        "div",
        null,
        h(
          Head,
          null,
          h("title", null, "My Title"),
          h("meta", { name: "description", content: "A test page" }),
        ),
      ),
    );
    const elements = getHeadElements();
    expect(elements.length).toBe(2);
    expect(elements[0]).toBe("<title>My Title</title>");
    expect(elements[1]).toBe('<meta name="description" content="A test page">');
  });

  test("resetHead clears collected elements", () => {
    renderToString(h(Head, null, h("title", null, "First")));
    expect(getHeadElements().length).toBe(1);

    resetHead();
    expect(getHeadElements().length).toBe(0);
  });
});

// ─── Complex Page ──────────────────────────────────────────────────────────────

describe("renderToString — Integration", () => {
  test("renders a full page structure", () => {
    function Layout({ children }: { children: any }) {
      return h(
        "html",
        { lang: "en" },
        h("head", null, h("meta", { charSet: "utf-8" })),
        h("body", null, h("main", null, children)),
      );
    }

    function Page() {
      return h(
        "div",
        null,
        h("h1", null, "Welcome"),
        h("p", { className: "intro" }, "Hello world"),
      );
    }

    const html = renderToString(h(Layout, null, h(Page, null)));
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<meta charSet="utf-8">');
    expect(html).toContain("<h1>Welcome</h1>");
    expect(html).toContain('<p class="intro">Hello world</p>');
    expect(html).toContain("</html>");
  });
});
