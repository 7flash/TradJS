import type { HandlerResponse } from "./types";
export interface NormalizeResponseOptions {
  requestId?: string;
  onStreamError?: (error: unknown) => void;
}
export function isAsyncIterable(
  value: unknown,
): value is AsyncIterable<unknown> {
  if (
    (typeof value !== "object" && typeof value !== "function") ||
    value === null
  ) {
    return false;
  }
  return (
    typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] ===
    "function"
  );
}
export function summarizeHandlerResult(result: HandlerResponse): unknown {
  if (result instanceof Response) {
    return { type: "response", status: result.status };
  }
  if (isAsyncIterable(result)) return { type: "stream" };
  if (typeof result === "string") {
    return { type: "html", bytes: new TextEncoder().encode(result).byteLength };
  }
  return { type: "json" };
}
/**
 * Change a response's headers, in place when they are mutable. Copying the
 * response loses the Content-Type Bun derives from a string body when it
 * sends it (`new Response("text")` has no Content-Type header until then),
 * so a copy went out as application/octet-stream and browsers downloaded it.
 */
export function editHeaders(
  response: Response,
  edit: (headers: Headers) => void,
): Response {
  try {
    edit(response.headers);
    return response;
  } catch {
    // Immutable headers (e.g. Response.error()): copy instead.
  }
  const headers = new Headers(response.headers);
  edit(headers);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
export function withRequestId(
  response: Response,
  requestId?: string,
): Response {
  if (!requestId) return response;
  return editHeaders(response, (headers) => headers.set("X-Request-ID", requestId));
}
export function normalizeHandlerResponse(
  result: HandlerResponse,
  options: NormalizeResponseOptions = {},
): Response {
  const { requestId, onStreamError } = options;
  if (isAsyncIterable(result)) {
    const encoder = new TextEncoder();
    const iterator = result[Symbol.asyncIterator]();
    let finished = false;
    let returned = false;
    const release = async () => {
      if (returned) return;
      returned = true;
      await iterator.return?.();
    };
    const stream = new ReadableStream<Uint8Array>(
      {
        async pull(controller) {
          try {
            const next = await iterator.next();
            if (finished) return;
            if (next.done) {
              finished = true;
              controller.close();
            } else controller.enqueue(encoder.encode(String(next.value)));
          } catch (error) {
            if (finished) return;
            finished = true;
            try {
              onStreamError?.(error);
            } catch {}
            controller.error(error);
            try {
              await release();
            } catch {}
          }
        },
        async cancel() {
          finished = true;
          await release();
        },
      },
      { highWaterMark: 0 },
    );
    return withRequestId(
      new Response(stream, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
      requestId,
    );
  }
  if (result instanceof Response) return withRequestId(result, requestId);
  if (typeof result === "string") {
    return withRequestId(
      new Response(result, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
      requestId,
    );
  }
  return withRequestId(Response.json(result), requestId);
}
export function withoutResponseBody(response: Response): Response {
  void response.body?.cancel().catch(() => {});
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
