/**
 * HTTP Server
 *
 * Handles server creation, request dispatch, error handling,
 * and graceful shutdown for Last.js applications.
 */

import { unlink } from "fs/promises";
import net from "node:net";
import { httpMeasure } from "./measure";
import { builtAssets, getContentType } from "./build";
import type { Handler } from "./types";

const isDev = process.env.NODE_ENV !== "production";

// ─── Global Error Handlers ──────────────────────────────────────────────────────
// Prevent the Bun process from dying on unhandled errors.
// ALWAYS log full stack traces — errors must be visible in both dev and production.

process.on("unhandledRejection", (reason: any) => {
  console.error("[tradjs] Unhandled Promise Rejection (server kept alive):");
  console.error(
    reason instanceof Error ? (reason.stack ?? reason.message) : reason,
  );
});

process.on("uncaughtException", (error: Error) => {
  console.error("[tradjs] Uncaught Exception (server kept alive):");
  console.error(error.stack ?? error.message);
});

// Global cleanup function for unix socket
let cleanupUnixSocket: (() => Promise<void>) | null = null;

function generateRequestId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function isAddressInUseError(error: any): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    error?.code === "EADDRINUSE" ||
    error?.errno === 10048 ||
    message.includes("EADDRINUSE") ||
    message.includes("Address already in use") ||
    message.includes("Failed to listen")
  );
}

/**
 * Create and start a Last.js HTTP server.
 *
 * Automatically determines port or unix socket from BUN_PORT env var or CLI arg.
 * Handles cleanup and graceful shutdown automatically.
 */
export async function serve(
  handler: Handler,
  options?: { port?: number; unix?: string; websocket?: any },
) {
  // Automatic detection logic
  let port: number | undefined;
  let unix: string | undefined;
  let shouldAutoFindPort = false;
  let autoFindStartPort = 3000;

  if (options?.port !== undefined) {
    port = options.port;
  } else if (options?.unix !== undefined) {
    unix = options.unix;
  } else {
    const bunPort = process.env.BUN_PORT;
    const cliArg = process.argv[2];
    const isFlag = cliArg?.startsWith("-");

    if (bunPort) {
      const parsedPort = parseInt(bunPort, 10);
      if (!isNaN(parsedPort)) {
        port = parsedPort;
        shouldAutoFindPort = true;
        autoFindStartPort = parsedPort;
      } else {
        unix = bunPort;
      }
    } else if (cliArg && !isFlag) {
      const parsedPort = parseInt(cliArg, 10);
      if (!isNaN(parsedPort)) {
        port = parsedPort;
        shouldAutoFindPort = true;
        autoFindStartPort = parsedPort;
      } else {
        unix = cliArg;
      }
    }
  }

  if (!port && !unix) {
    shouldAutoFindPort = true;
    port = autoFindStartPort;
  }

  // On Windows/Bun, attempting to bind an occupied port may not reliably throw
  // before a misleading server object is returned. Preflight using real TCP
  // connection checks against both loopback families whenever automatic port
  // selection is enabled.
  if (!unix && shouldAutoFindPort) {
    const requestedPort = port ?? autoFindStartPort;
    port = await findAvailablePort(requestedPort);
    if (port !== requestedPort) {
      console.log(`⚠️  Port ${requestedPort} is busy, using port ${port}`);
    }
  }

  if (port !== undefined && unix) {
    throw new Error("Cannot specify both port and unix socket");
  }

  // Handle unix socket cleanup BEFORE starting server
  if (unix) {
    if (!unix.startsWith("\0")) {
      await unlink(unix).catch(() => {});
    }
    cleanupUnixSocket = async () => {
      if (unix && !unix.startsWith("\0")) {
        await unlink(unix).catch(() => {});
      }
    };
  }

  const hasWebSocket = !!options?.websocket;
  const args: any = {
    idleTimeout: 0,
    development: isDev,
    async fetch(req: Request) {
      let requestId = req.headers.get("X-Request-ID");
      if (!requestId) {
        requestId = generateRequestId();
        req.headers.set("X-Request-ID", requestId);
      }

      try {
        const url = new URL(req.url);
        const pathname = url.pathname;

        // WebSocket upgrade — when a websocket handler is configured,
        // automatically upgrade requests with the Upgrade header
        if (
          hasWebSocket &&
          req.headers.get("upgrade")?.toLowerCase() === "websocket"
        ) {
          const upgraded = server.upgrade(req, { data: { url, pathname } });
          if (upgraded) return undefined as any; // Bun handles the response
          return new Response("WebSocket upgrade failed", { status: 400 });
        }

        // Check for built assets in memory first
        if (builtAssets[pathname]) {
          const { content, contentType } = builtAssets[pathname];
          return new Response(content, {
            headers: {
              "Content-Type": contentType,
              "Cache-Control": isDev
                ? "no-cache"
                : "public, max-age=31536000, immutable",
            },
          });
        }

        // Handle request — scoped measurement observes timing.
        // Errors throw by default; catch() is the explicit 500 fallback.
        const response = await httpMeasure.measure.root(
          {
            start: () => `${req.method} ${pathname} ${requestId}`,
            end: (result) => {
              if (result instanceof Response) {
                return { status: result.status };
              }

              if (
                typeof result === "object" &&
                result != null &&
                (result as any)[Symbol.asyncIterator]
              ) {
                return { type: "stream" };
              }

              if (typeof result === "string") {
                return { type: "html", bytes: result.length };
              }

              return { type: "json" };
            },
            catch: (error: unknown) => {
              console.error("[Server Error]", error);
              const errorDetails =
                error instanceof Error ? error.message : String(error);
              const stackTrace =
                error instanceof Error && error.stack
                  ? error.stack
                  : "No stack trace available";
              const body = isDev
                ? `<pre style="font-family:monospace;background:#fff1f1;padding:20px;color:#d92626">${errorDetails}\n\n${stackTrace}</pre>`
                : "Internal Server Error";
              return new Response(body, {
                status: 500,
                headers: {
                  "Content-Type": "text/html",
                  "Cache-Control": "no-store",
                },
              });
            },
          },
          () => handler(req),
        );

        // Async iterator (streaming)
        if (
          typeof response === "object" &&
          response != null &&
          (response as any)[Symbol.asyncIterator]
        ) {
          const stream = new ReadableStream({
            async start(controller) {
              try {
                for await (const chunk of response as AsyncGenerator<string>) {
                  controller.enqueue(new TextEncoder().encode(chunk));
                }
              } catch (error) {
                console.error("Stream error:", error);
              } finally {
                controller.close();
              }
            },
          });
          return new Response(stream, {
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Transfer-Encoding": "chunked",
              "X-Request-ID": requestId,
            },
          });
        }

        if (response instanceof Response) {
          const headers = new Headers(response.headers);
          headers.set("X-Request-ID", requestId);
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: headers,
          });
        }

        if (typeof response === "string") {
          return new Response(response, {
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "X-Request-ID": requestId,
            },
          });
        }

        return new Response(JSON.stringify(response), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (error: any) {
        console.error("[Server Error]", error);
        const errorDetails = error?.message ?? String(error);
        const stackTrace = error?.stack ?? "No stack trace available";
        const detailedLogs = JSON.stringify(
          error,
          Object.getOwnPropertyNames(error),
          2,
        );

        const body = isDev
          ? `<!DOCTYPE html>
              <html>
                <head>
                  <title>Server Error</title>
                  <style>
                    body { font-family: monospace; padding: 20px; background: #fff1f1; color: #333; }
                    pre { background: #fdfdfd; padding: 15px; border-radius: 4px; border: 1px solid #ddd; overflow-x: auto; }
                    h1 { color: #d92626; }
                  </style>
                </head>
                <body>
                  <h1>Server Error</h1>
                  <h3>Error:</h3>
                  <pre>${errorDetails}</pre>
                  <h3>Stack Trace:</h3>
                  <pre>${stackTrace}</pre>
                  <h3>Full Error Object:</h3>
                  <pre>${detailedLogs}</pre>
                </body>
              </html>`
          : "Internal Server Error";

        return new Response(body, {
          status: 500,
          headers: {
            "Content-Type": "text/html",
            "Cache-Control": "no-store",
          },
        });
      }
    },
    error(error: Error) {
      console.error("[Bun Server Error]", error);
      return new Response("Internal Server Error", {
        status: 500,
        headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
      });
    },
  };

  // Pass through WebSocket handler if provided
  if (options?.websocket) {
    args.websocket = options.websocket;
  }

  if (unix) {
    args.unix = unix;
  } else {
    args.port = port;
  }

  let server: any;
  try {
    server = Bun.serve(args);
  } catch (err: any) {
    if (!unix && shouldAutoFindPort && isAddressInUseError(err)) {
      const fallbackStart = Math.max(
        (port ?? autoFindStartPort) + 1,
        autoFindStartPort + 1,
      );
      args.port = await findAvailablePort(fallbackStart);
      console.log(`⚠️  Port ${port} is busy, using port ${args.port}`);
      server = Bun.serve(args);
    } else {
      throw err;
    }
  }

  if (unix) {
    console.log(`🦊 tradjs server running on unix socket ${unix}`);
  } else {
    console.log(`🦊 tradjs server running at http://localhost:${server.port}`);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`🛑 Received ${signal}, shutting down gracefully...`);
    if (cleanupUnixSocket) {
      await cleanupUnixSocket();
    }
    server.stop?.();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  return server;
}

// ─── Port Discovery ─────────────────────────────────────────────────────────────

async function canConnectToPort(port: number, host: string): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ port, host });

    const finish = (result: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.setTimeout(200);
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

export async function findAvailablePort(
  startPort: number = 3000,
): Promise<number> {
  for (let port = startPort; port < startPort + 100; port++) {
    if (!(await isPortInUse(port))) {
      return port;
    }
  }
  throw new Error(
    `No available port found in range ${startPort}-${startPort + 99}`,
  );
}
