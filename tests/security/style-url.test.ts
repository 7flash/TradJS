import { describe, expect, it } from "bun:test";
import { createElement } from "../../src/client/render";
import { renderToString } from "../../src/server/ssr";

describe("SSR style URL filtering", () => {
  it("rejects javascript URLs in style objects", () => {
    const html = renderToString(
      createElement("div", {
        style: { backgroundImage: "url(javascript:alert(1))" },
      }),
    );
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("style=");
  });

  it("rejects CSS-escaped javascript schemes", () => {
    const html = renderToString(
      createElement("div", {
        style: { backgroundImage: String.raw`url(j\61vascript:alert(1))` },
      }),
    );
    expect(html).not.toContain("style=");
  });

  it("preserves ordinary CSS styles and URLs", () => {
    const html = renderToString(
      createElement("div", {
        style: { color: "red", backgroundImage: "url(/image.png)" },
      }),
    );
    expect(html).toContain("color:red");
    expect(html).toContain("url(/image.png)");
  });
});

describe("style URL rules: allowed images and the client", () => {
  it("keeps raster data images and normal URLs in style", () => {
    const png = "data:image/png;base64,iVBORw0KGgo=";
    const html = renderToString(
      createElement("div", { style: { backgroundImage: `url(${png})` } }),
    );
    expect(html).toContain("style=");
    expect(html).toContain("data:image/png");
    expect(
      renderToString(createElement("div", { style: { backgroundImage: "url(/bg.png)" } })),
    ).toContain("/bg.png");
    expect(
      renderToString(
        createElement("div", { style: { backgroundImage: "url(data:image/svg+xml,<svg onload=x>)" } }),
      ),
    ).not.toContain("style=");
  });

  it("the client drops javascript URLs in style objects too", async () => {
    const { JSDOM } = await import("jsdom");
    const { setDomProp } = await import("../../src/client/props");
    const dom = new JSDOM("<!doctype html><body></body>");
    const div = dom.window.document.createElement("div");
    setDomProp(div, "style", { backgroundImage: "url(javascript:alert(1))" });
    expect(div.getAttribute("style") ?? "").not.toContain("javascript");
    dom.window.close();
  });
});
