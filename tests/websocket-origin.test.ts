import { expect, test } from "bun:test";
import { isAllowedWebSocketOrigin, serve } from "../src/server/serve";

function open(url: string, origin?: string): Promise<"open" | "refused"> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url, origin ? ({ headers: { Origin: origin } } as any) : undefined);
    ws.onopen = () => { ws.close(); resolve("open"); };
    ws.onerror = () => resolve("refused");
  });
}

test("websocket upgrades from a foreign site are refused by default", async () => {
  const server = await serve(() => new Response("http"), {
    port: 0,
    websocket: { message() {} },
    handleSignals: false,
    websocketOrigins: ["https://partner.example"],
  } as any);
  try {
    const url = `ws://127.0.0.1:${server.port}/socket`;
    expect(await open(url)).toBe("open"); // no Origin: a script or server
    expect(await open(url, `http://127.0.0.1:${server.port}`)).toBe("open"); // same origin
    expect(await open(url, "https://partner.example")).toBe("open"); // allowed
    expect(await open(url, "https://evil.example")).toBe("refused");
  } finally {
    server.stop(true);
  }
});

test("origin matching is exact", () => {
  const req = new URL("http://app.test:3000/socket");
  expect(isAllowedWebSocketOrigin("http://app.test:3000", req)).toBe(true);
  expect(isAllowedWebSocketOrigin("http://app.test.evil.example", req)).toBe(false);
  expect(isAllowedWebSocketOrigin("null", req)).toBe(false);
  expect(isAllowedWebSocketOrigin("https://a.example", req, ["https://a.example/"])).toBe(true);
  expect(isAllowedWebSocketOrigin("https://a.example:8443", req, ["https://a.example"])).toBe(false);
});
