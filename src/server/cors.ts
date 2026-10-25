import type { Handler, HandlerResponse } from "./types";

export type CorsOrigin =
  | "*"
  | string
  | string[]
  | ((
      origin: string,
      request: Request,
    ) => boolean | string | Promise<boolean | string>);

export interface CorsOptions {
  origin?: CorsOrigin;
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
  preflightStatus?: number;
}

function appendVary(headers: Headers, value: string): void {
  const existing = headers.get("Vary");
  const values = new Set(
    (existing ? existing.split(",") : [])
      .map((item) => item.trim())
      .filter(Boolean),
  );
  values.add(value);
  headers.set("Vary", Array.from(values).join(", "));
}

async function resolveOrigin(
  requestOrigin: string,
  request: Request,
  option: CorsOrigin,
  credentials: boolean,
): Promise<string | null> {
  if (typeof option === "function") {
    const result = await option(requestOrigin, request);
    if (result === true) return requestOrigin;
    if (result === false) return null;
    return result || null;
  }
  if (Array.isArray(option)) {
    return option.includes(requestOrigin) ? requestOrigin : null;
  }
  if (option === "*") {
    return credentials ? requestOrigin : "*";
  }
  return option === requestOrigin ? requestOrigin : null;
}

function applyCorsHeaders(
  headers: Headers,
  allowedOrigin: string,
  options: CorsOptions,
): void {
  headers.set("Access-Control-Allow-Origin", allowedOrigin);
  if (allowedOrigin !== "*") appendVary(headers, "Origin");
  if (options.credentials) {
    headers.set("Access-Control-Allow-Credentials", "true");
  }
  if (options.exposedHeaders?.length) {
    headers.set(
      "Access-Control-Expose-Headers",
      options.exposedHeaders.join(", "),
    );
  }
}

async function normalizeResponse(value: HandlerResponse): Promise<Response> {
  if (value instanceof Response) return value;
  if (
    typeof value === "object" &&
    value !== null &&
    Symbol.asyncIterator in value
  ) {
    const iterator = value as AsyncGenerator<string, void, unknown>;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of iterator) {
            controller.enqueue(encoder.encode(chunk));
          }
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  if (typeof value === "string") {
    return new Response(value, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  return Response.json(value);
}

export function cors(handler: Handler, options: CorsOptions = {}): Handler {
  const originOption = options.origin ?? "*";
  const methods = options.methods ?? [
    "GET",
    "HEAD",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ];

  return async (request: Request) => {
    const requestOrigin = request.headers.get("Origin");
    if (!requestOrigin) return handler(request);

    const allowedOrigin = await resolveOrigin(
      requestOrigin,
      request,
      originOption,
      options.credentials === true,
    );

    if (!allowedOrigin) {
      if (
        request.method.toUpperCase() === "OPTIONS" &&
        request.headers.has("Access-Control-Request-Method")
      ) {
        return new Response("CORS origin denied", { status: 403 });
      }
      return handler(request);
    }

    const isPreflight =
      request.method.toUpperCase() === "OPTIONS" &&
      request.headers.has("Access-Control-Request-Method");

    if (isPreflight) {
      const headers = new Headers();
      applyCorsHeaders(headers, allowedOrigin, options);
      headers.set("Access-Control-Allow-Methods", methods.join(", "));
      appendVary(headers, "Access-Control-Request-Method");

      const requestedHeaders = request.headers.get(
        "Access-Control-Request-Headers",
      );
      if (options.allowedHeaders?.length) {
        headers.set(
          "Access-Control-Allow-Headers",
          options.allowedHeaders.join(", "),
        );
      } else if (requestedHeaders) {
        headers.set("Access-Control-Allow-Headers", requestedHeaders);
        appendVary(headers, "Access-Control-Request-Headers");
      }

      if (options.maxAge !== undefined) {
        headers.set("Access-Control-Max-Age", String(options.maxAge));
      }

      return new Response(null, {
        status: options.preflightStatus ?? 204,
        headers,
      });
    }

    const response = await normalizeResponse(await handler(request));
    const headers = new Headers(response.headers);
    applyCorsHeaders(headers, allowedOrigin, options);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
