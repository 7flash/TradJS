import { describe, expect, test } from "bun:test";
import { errorMessage, serializeError } from "../src/server/errors";
import {
  escapeHtml,
  injectHeadElements,
  serializeInlineScript,
} from "../src/server/html";

describe("server error utilities", () => {
  test("escapes error text before embedding it into dev HTML", () => {
    expect(escapeHtml(`<script>alert("x")</script>&'`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;",
    );
  });

  test("serializes inline JSON without allowing script-tag breakout", () => {
    expect(
      serializeInlineScript({ value: "</script><script>x</script>" }),
    ).toBe(
      '{"value":"\\u003c/script\\u003e\\u003cscript\\u003ex\\u003c/script\\u003e"}',
    );
  });

  test("merges collected head titles with page precedence and a default fallback", () => {
    expect(
      injectHeadElements(
        "<html><head><title>Layout</title></head><body></body></html>",
        [
          "<title>Section</title>",
          "<title>Page</title>",
          '<meta name="x" content="1">',
        ],
        "Default",
      ),
    ).toBe(
      '<html><head><title>Page</title>\n<meta name="x" content="1"></head><body></body></html>',
    );

    expect(
      injectHeadElements(
        "<html><head></head><body></body></html>",
        [],
        "A & B",
      ),
    ).toContain("<title>A &amp; B</title>");
  });

  test("serializes circular and bigint error details without throwing", () => {
    const error = new Error("boom", { cause: { code: 42n } });
    (error as Error & { self?: unknown }).self = error;

    const serialized = serializeError(error);
    expect(serialized).toContain("42n");
    expect(serialized).toContain("Circular");
  });

  test("normalizes unknown thrown values", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("boom")).toBe("boom");
    expect(serializeError(new Error("boom"))).toContain('"message": "boom"');
    expect(serializeError({ code: "E_TEST" })).toContain("E_TEST");
  });
});
