/**
 * HTTP Server
 *
 * Handles server creation, request dispatch, error handling, port discovery,
 * and graceful shutdown for TradJS applications.
 */

import { unlink } from "fs/promises";
import net from "node:net";
import { errorMessage, errorStack, serializeError } from "./errors";
import { escapeHtml } from "./html";
import { httpMeasure, measureRequired } from "./measure";
import { builtAssets } from "./build";
import { normalizeHandlerResponse } from "./response";
import type { Handler } from "./types";

const isDev = process.env.NODE_ENV !== "production";
const PORT_SCAN_SIZE = 100;
const PORT_PROBE_TIMEOUT_MS = 200;

export interface HttpServeOptions {
  port?: number;
  unix?: string;
  /** Passed through to Bun.serve. Kept generic so applications can use Bun's websocket API. */
  websocket?: unknown;
  /** Opt in to process-wide SIGINT/SIGTERM ownership (intended for the CLI). */
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
    errno === 10048 ||
    message.includes("EADDRINUSE") ||
    message.includes("Address already in use") ||
    message.includes("Failed to listen")
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
  return Number.isInteger(port) && port >= 0 && port <= 65_535
    ? port
    : undefined;
}

/**
 * Create and start a TradJS HTTP server.
 *
 * Determines the listening address from explicit options or BUN_PORT.
 * CLI arguments are parsed by the CLI layer so this low-level API does not
 * depend on ambient process.argv state when embedded in another program.
 */
export async function serve(handler: Handler, options: HttpServeOptions = {}) {
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
    (port < 0 || port > 65_535 || !Number.isInteger(port))
  ) {
    throw new Error(`Invalid port: ${port}`);
  }

  if (!unix && shouldAutoFindPort) {
    const requestedPort = port ?? autoFindStartPort;
    port = await findAvailablePort(requestedPort);
    if (port !== requestedPort) {
      console.log(`⚠️  Port ${requestedPort} is busy, using port ${port}`);
    }
  }

  let cleanupUnixSocket: (() => Promise<void>) | undefined;
  if (unix) {
    if (!unix.startsWith("\0")) {
      await unlink(unix).catch(() => {});
    }
    cleanupUnixSocket = async () => {
      if (!unix.startsWith("\0")) {
        await unlink(unix).catch(() => {});
      }
    };
  }

  const hasWebSocket = options.websocket !== undefined;
  const args: Record<string, unknown> = {
    idleTimeout: 0,
    development: isDev,
    async fetch(req: Request) {
      const requestId = req.headers.get("X-Request-ID") || generateRequestId();
      const url = new URL(req.url);
      const pathname = url.pathname;

      try {
        return await measureRequired(
          httpMeasure,
          {
            label: "HTTP dispatch",
            method: req.method,
            pathname,
            requestId,
            result: (response: Response | undefined) =>
              response
                ? { status: response.status }
                : { websocket: "upgraded" },
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
              return new Response(asset.content, {
                headers: {
                  "Content-Type": asset.contentType,
                  "Cache-Control": isDev
                    ? "no-cache"
                    : "public, max-age=31536000, immutable",
                  "X-Request-ID": requestId,
                },
              });
            }

            const response = await handler(req);
            return normalizeHandlerResponse(response, {
              requestId,
              onStreamError: (error) =>
                console.error(`[tradjs] Stream error (${requestId}):`, error),
            });
          },
        );
      } catch (error) {
        // The failed HTTP span already records the exception. Avoid a second
        // unconditional log so MEASURE_SILENT/custom loggers remain authoritative.
        return createErrorResponse(error, requestId);
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

  let server: ReturnType<typeof Bun.serve>;
  try {
    server = Bun.serve(args as Parameters<typeof Bun.serve>[0]);
  } catch (error) {
    if (!unix && shouldAutoFindPort && isAddressInUseError(error)) {
      const fallbackStart = Math.max(
        (port ?? autoFindStartPort) + 1,
        autoFindStartPort + 1,
      );
      const fallbackPort = await findAvailablePort(fallbackStart);
      args.port = fallbackPort;
      console.log(`⚠️  Port ${port} is busy, using port ${fallbackPort}`);
      server = Bun.serve(args as Parameters<typeof Bun.serve>[0]);
    } else {
      throw error;
    }
  }

  if (unix) {
    console.log(`🦊 tradjs server running on unix socket ${unix}`);
  } else {
    console.log(`🦊 tradjs server running at http://localhost:${server.port}`);
  }

  if (options.handleSignals) {
    const shutdown = async (signal: "SIGINT" | "SIGTERM") => {
      console.log(`🛑 Received ${signal}, shutting down gracefully...`);
      process.off("SIGINT", onSigint);
      process.off("SIGTERM", onSigterm);
      await cleanupUnixSocket?.();
      server.stop?.();
      process.exit(0);
    };
    const onSigint = () => void shutdown("SIGINT");
    const onSigterm = () => void shutdown("SIGTERM");

    process.once("SIGINT", onSigint);
    process.once("SIGTERM", onSigterm);
  }

  return server;
}

// ─── Port Discovery ─────────────────────────────────────────────────────────────

async function canConnectToPort(port: number, host: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ port, host });

    const finish = (result: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.setTimeout(PORT_PROBE_TIMEOUT_MS);
  });
}

async function isPortInUse(port: number): Promise<boolean> {
  const [v4, v6] = await Promise.allSettled([
    canConnectToPort(port, "127.0.0.1"),
    canConnectToPort(port, "::1"),
  ]);

  return [v4, v6].some(
    (result) => result.status === "fulfilled" && result.value,
  );
}

export async function findAvailablePort(startPort = 3000): Promise<number> {
  if (!Number.isInteger(startPort) || startPort < 1 || startPort > 65_535) {
    throw new Error(`Invalid start port: ${startPort}`);
  }

  const endPort = Math.min(65_535, startPort + PORT_SCAN_SIZE - 1);
  for (let port = startPort; port <= endPort; port++) {
    if (!(await isPortInUse(port))) return port;
  }

  throw new Error(`No available port found in range ${startPort}-${endPort}`);
}
