import { describe, expect, test } from "bun:test";
import {
  normalizeHandlerResponse,
  summarizeHandlerResult,
  withoutResponseBody,
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
describe("stream demand and cancellation", () => {
  test("does not run ahead and cancellation closes the generator", async () => {
    let produced = 0,
      cleaned = 0;
    async function* source() {
      try {
        while (true) {
          produced++;
          yield "chunk";
        }
      } finally {
        cleaned++;
      }
    }
    const response = normalizeHandlerResponse(source());
    await Promise.resolve();
    expect(produced).toBe(0);
    const reader = response.body!.getReader();
    await reader.read();
    await Promise.resolve();
    expect(produced).toBe(1);
    await reader.cancel();
    expect(cleaned).toBe(1);
    expect(produced).toBe(1);
  });
  test("HEAD cancels the body without consuming it and keeps response metadata", async () => {
    let pulls = 0,
      cancelled = 0;
    const stream = new ReadableStream(
      {
        pull() {
          pulls++;
        },
        cancel() {
          cancelled++;
        },
      },
      { highWaterMark: 0 },
    );
    const head = withoutResponseBody(
      new Response(stream, { status: 202, headers: { "x-test": "ok" } }),
    );
    await Promise.resolve();
    expect(pulls).toBe(0);
    expect(cancelled).toBe(1);
    expect(head.status).toBe(202);
    expect(head.headers.get("x-test")).toBe("ok");
    expect(await head.text()).toBe("");
  });
  test("a failing error observer cannot replace the source exception", async () => {
    const cause = new Error("source");
    async function* source() {
      throw cause;
      yield "";
    }
    const response = normalizeHandlerResponse(source(), {
      onStreamError() {
        throw new Error("observer");
      },
    });
    await expect(response.text()).rejects.toBe(cause);
  });
});
