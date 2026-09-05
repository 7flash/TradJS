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

export function withRequestId(
  response: Response,
  requestId?: string,
): Response {
  if (!requestId) return response;

  const headers = new Headers(response.headers);
  headers.set("X-Request-ID", requestId);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function normalizeHandlerResponse(
  result: HandlerResponse,
  options: NormalizeResponseOptions = {},
): Response {
  const { requestId, onStreamError } = options;

  if (isAsyncIterable(result)) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of result) {
            controller.enqueue(encoder.encode(String(chunk)));
          }
          controller.close();
        } catch (error) {
          onStreamError?.(error);
          controller.error(error);
        }
      },
    });

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
