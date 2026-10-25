import { lstat, unlink } from "node:fs/promises";
import { errorMessage, errorStack, serializeError } from "./errors";
import { escapeHtml } from "./html";
import { httpMeasure } from "./measure";
import { builtAssets } from "./build";
import { normalizeHandlerResponse, withoutResponseBody } from "./response";
import type { Handler } from "./types";
const isDev = process.env.NODE_ENV !== "production";
const PORT_SCAN_SIZE = 100;
export interface HttpServeOptions {
  port?: number;
  unix?: string;
  websocket?: unknown;
  handleSignals?: boolean;
}
function generateRequestId(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 12);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function isAddressInUseError(error: unknown): boolean {
  const code = isRecord(error) ? error.code : undefined;
  const errno = isRecord(error) ? error.errno : undefined;
  const message = errorMessage(error);
  return (
    code === "EADDRINUSE" ||
    code === "EACCES" ||
    errno === 10013 ||
    errno === 10048 ||
    message.includes("EADDRINUSE") ||
    message.includes("Address already in use") ||
    message.includes("EACCES")
  );
}
function createErrorResponse(error: unknown, requestId: string): Response {
  const message = errorMessage(error);
  const stack = errorStack(error);
  const body = isDev
    ? `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Server Error</title>
    <style>
      body { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; padding: 20px; background: #fff1f1; color: #333; }
      pre { background: #fdfdfd; padding: 15px; border-radius: 4px; border: 1px solid #ddd; overflow-x: auto; white-space: pre-wrap; }
      h1 { color: #d92626; }
    </style>
  </head>
  <body>
    <h1>Server Error</h1>
    <h3>Error</h3>
    <pre>${escapeHtml(message)}</pre>
    <h3>Stack Trace</h3>
    <pre>${escapeHtml(stack)}</pre>
    <h3>Details</h3>
    <pre>${escapeHtml(serializeError(error))}</pre>
  </body>
</html>`
    : "Internal Server Error";
  return new Response(body, {
    status: 500,
    headers: {
      "Content-Type": isDev
        ? "text/html; charset=utf-8"
        : "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Request-ID": requestId,
    },
  });
}
function parsePort(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const port = Number(value);
  return Number.isInteger(port) && port >= 0 && port <= 65535
    ? port
    : undefined;
}
export async function serve(handler: Handler, options: HttpServeOptions = {}) {
  if (options.port !== undefined && options.unix !== undefined)
    throw new Error("Cannot specify both port and unix socket");
  if (options.unix !== undefined && !options.unix)
    throw new Error("Unix socket path must not be empty");
  let port: number | undefined;
  let unix: string | undefined;
  let shouldAutoFindPort = false;
  let autoFindStartPort = 3000;
  if (options.port !== undefined) {
    port = options.port;
  } else if (options.unix !== undefined) {
    unix = options.unix;
  } else {
    const bunPort = process.env.BUN_PORT;
    if (bunPort) {
      const parsedPort = parsePort(bunPort);
      if (parsedPort !== undefined) {
        port = parsedPort;
        shouldAutoFindPort = parsedPort !== 0;
        autoFindStartPort = parsedPort || autoFindStartPort;
      } else {
        if (/^[+-]?\d+(?:\.\d+)?$/.test(bunPort))
          throw new Error(`Invalid BUN_PORT: ${bunPort}`);
        unix = bunPort;
      }
    }
  }
  if (port === undefined && unix === undefined) {
    shouldAutoFindPort = true;
    port = autoFindStartPort;
  }
  if (port !== undefined && unix !== undefined) {
    throw new Error("Cannot specify both port and unix socket");
  }
  if (
    port !== undefined &&
    (port < 0 || port > 65535 || !Number.isInteger(port))
  ) {
    throw new Error(`Invalid port: ${port}`);
  }
  let socketIdentity: Awaited<ReturnType<typeof lstat>> | undefined;
  if (unix && !unix.startsWith("\0")) {
    try {
      await lstat(unix);
      throw new Error(
        `Unix socket path already exists: ${unix}. Remove it explicitly if it is stale.`,
      );
    } catch (error) {
      if (!isRecord(error) || error.code !== "ENOENT") throw error;
    }
  }
  const cleanupUnixSocket = async () => {
    if (!unix || unix.startsWith("\0") || !socketIdentity) return;
    try {
      const current = await lstat(unix);
      if (
        current.isSocket() &&
        current.dev === socketIdentity.dev &&
        current.ino === socketIdentity.ino
      )
        await unlink(unix);
    } catch (error) {
      if (!isRecord(error) || error.code !== "ENOENT") throw error;
    }
  };
  const hasWebSocket = options.websocket !== undefined;
  const args: Record<string, unknown> = {
    idleTimeout: 0,
    development: isDev,
    async fetch(req: Request) {
      const suppliedId = req.headers.get("X-Request-ID") ?? "";
      const requestId = /^[A-Za-z0-9_.:-]{1,128}$/.test(suppliedId)
        ? suppliedId
        : generateRequestId();
      const url = new URL(req.url);
      const pathname = url.pathname;
      try {
        return await httpMeasure.measure(
          {
            start: () => `${req.method} ${pathname}`,
            end: (response: Response | undefined) =>
              response
                ? { status: response.status }
                : { websocket: "upgraded" },
            catch: (error: unknown) => {
              throw error;
            },
          },
          async () => {
            if (
              hasWebSocket &&
              req.headers.get("upgrade")?.toLowerCase() === "websocket"
            ) {
              const upgraded = server.upgrade(req, { data: { url, pathname } });
              if (upgraded) return undefined;
              return normalizeHandlerResponse(
                new Response("WebSocket upgrade failed", { status: 400 }),
                { requestId },
              );
            }
            const asset = builtAssets[pathname];
            if (asset) {
              if (req.method !== "GET" && req.method !== "HEAD")
                return new Response("Method Not Allowed", {
                  status: 405,
                  headers: {
                    Allow: "GET, HEAD",
                    "X-Request-ID": requestId,
                    "Cache-Control": "no-store",
                  },
                });
              return new Response(
                req.method === "HEAD" ? null : asset.content,
                {
                  headers: {
                    "Content-Type": asset.contentType,
                    "X-Content-Type-Options": "nosniff",
                    "Cache-Control": isDev
                      ? "no-cache"
                      : "public, max-age=31536000, immutable",
                    "X-Request-ID": requestId,
                  },
                },
              );
            }
            const response = await handler(req);
            const normalized = normalizeHandlerResponse(response, {
              requestId,
              onStreamError: (error) => {
                console.error(
                  `[tradjs] HTTP stream failed ${requestId}:`,
                  error,
                );
              },
            });
            return req.method === "HEAD"
              ? withoutResponseBody(normalized)
              : normalized;
          },
        );
      } catch (error) {
        const response = createErrorResponse(error, requestId);
        return req.method === "HEAD" ? withoutResponseBody(response) : response;
      }
    },
    error(error: Error) {
      console.error("[tradjs] Bun server error:", error);
      return new Response("Internal Server Error", {
        status: 500,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    },
  };
  if (options.websocket !== undefined) args.websocket = options.websocket;
  if (unix) args.unix = unix;
  else args.port = port;
  let server!: ReturnType<typeof Bun.serve>;
  const firstPort = port ?? autoFindStartPort;
  const lastPort =
    !unix && shouldAutoFindPort
      ? Math.min(65535, firstPort + PORT_SCAN_SIZE - 1)
      : firstPort;
  for (let candidate = firstPort; candidate <= lastPort; candidate++) {
    if (!unix) args.port = candidate;
    try {
      server = Bun.serve(args as unknown as Parameters<typeof Bun.serve>[0]);
      if (candidate !== firstPort)
        console.warn(
          `[tradjs] Port ${firstPort} unavailable; using ${candidate}.`,
        );
      break;
    } catch (error) {
      if (
        unix ||
        !shouldAutoFindPort ||
        !isAddressInUseError(error) ||
        candidate === lastPort
      )
        throw error;
    }
  }
  const originalStop = server.stop.bind(server);
  if (unix && !unix.startsWith("\0")) {
    try {
      socketIdentity = await lstat(unix);
    } catch (error) {
      await originalStop(true);
      throw error;
    }
  }
  let stopPromise: Promise<void> | undefined;
  const onSigint = () => {
    void shutdown("SIGINT");
  };
  const onSigterm = () => {
    void shutdown("SIGTERM");
  };
  server.stop = ((force?: boolean) => {
    if (stopPromise) {
      if (force) void originalStop(true);
      return stopPromise;
    }
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
    stopPromise = (async () => {
      await originalStop(force);
      await cleanupUnixSocket();
    })();
    return stopPromise;
  }) as typeof server.stop;
  async function shutdown(_signal: string) {
    await server.stop();
  }
  if (unix) {
    console.log(`🦊 tradjs server running on unix socket ${unix}`);
  } else {
    console.log(`🦊 tradjs server running at http://localhost:${server.port}`);
  }
  if (options.handleSignals) {
    process.once("SIGINT", onSigint);
    process.once("SIGTERM", onSigterm);
  }
  return server;
}
export async function findAvailablePort(startPort = 3000): Promise<number> {
  if (!Number.isInteger(startPort) || startPort < 1 || startPort > 65535)
    throw new Error(`Invalid start port: ${startPort}`);
  const endPort = Math.min(65535, startPort + PORT_SCAN_SIZE - 1);
  for (let port = startPort; port <= endPort; port++) {
    try {
      const probe = Bun.serve({ port, fetch: () => new Response(null) });
      await probe.stop(true);
      return port;
    } catch (error) {
      if (!isAddressInUseError(error)) throw error;
    }
  }
  throw new Error(`No available port found in range ${startPort}-${endPort}`);
}
