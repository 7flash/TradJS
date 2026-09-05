import { describe, expect, test } from "bun:test";
import { createElement } from "../src/client/render";
import { collectHeadAsync, Head } from "../src/server/head";
import { renderToString, renderToStringAsync } from "../src/server/ssr";

describe("SSR encoding", () => {
  test("sync and async renderers escape text identically", async () => {
    const vnode = createElement("p", null, `<script>alert("x")</script>&`);
    const expected =
      "<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;</p>";

    expect(renderToString(vnode)).toBe(expected);
    expect(await renderToStringAsync(vnode)).toBe(expected);
  });

  test("drops unsafe attribute names introduced through object spreads", () => {
    const vnode = createElement("div", {
      id: "safe",
      ['bad" onclick="alert(1)']: "x",
    });

    expect(renderToString(vnode)).toBe('<div id="safe"></div>');
  });

  test("escapes declarative head text and attributes", async () => {
    const { head } = await collectHeadAsync(() =>
      renderToStringAsync(
        createElement(Head, {
          children: [
            createElement("title", null, "A & <B>"),
            createElement("meta", {
              name: "description",
              content: 'quote " <tag>',
            }),
          ],
        }),
      ),
    );

    expect(head).toEqual([
      "<title>A &amp; &lt;B&gt;</title>",
      '<meta name="description" content="quote &quot; &lt;tag&gt;">',
    ]);
  });

  test("isolates head collection across concurrent async renders", async () => {
    const renderHead = (title: string, delayMs: number) =>
      collectHeadAsync(async () => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return renderToStringAsync(
          createElement(Head, {
            children: createElement("title", null, title),
          }),
        );
      });

    const [slow, fast] = await Promise.all([
      renderHead("slow", 10),
      renderHead("fast", 0),
    ]);

    expect(slow.head).toEqual(["<title>slow</title>"]);
    expect(fast.head).toEqual(["<title>fast</title>"]);
  });
});
