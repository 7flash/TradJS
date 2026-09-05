import { describe, expect, test } from "bun:test";
import {
  normalizeHandlerResponse,
  summarizeHandlerResult,
} from "../src/server/response";

describe("handler response normalization", () => {
  test("preserves response metadata while attaching request ids", async () => {
    const response = normalizeHandlerResponse(
      new Response("created", {
        status: 201,
        headers: { "X-Custom": "yes" },
      }),
      { requestId: "req-1" },
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("X-Custom")).toBe("yes");
    expect(response.headers.get("X-Request-ID")).toBe("req-1");
    expect(await response.text()).toBe("created");
  });

  test("normalizes strings and objects consistently", async () => {
    const html = normalizeHandlerResponse("<p>ok</p>");
    expect(html.headers.get("Content-Type")).toContain("text/html");

    const json = normalizeHandlerResponse({ ok: true });
    expect(json.headers.get("Content-Type")).toContain("application/json");
    expect(await json.json()).toEqual({ ok: true });
  });

  test("streams async iterables and reports stream failures", async () => {
    const errors: unknown[] = [];
    async function* source() {
      yield "a";
      yield "b";
      throw new Error("stream failed");
    }

    const response = normalizeHandlerResponse(source(), {
      onStreamError: (error) => errors.push(error),
    });

    await expect(response.text()).rejects.toThrow("stream failed");
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe("stream failed");
    expect(summarizeHandlerResult(source())).toEqual({ type: "stream" });
  });
});
