import { expect, test } from "bun:test";
import { serve } from "../src/server/serve";
import { cors } from "../src/server/cors";

// Bun derives Content-Type from a string body only when it sends that very
// Response; copying it to add X-Request-ID or CORS headers sent
// application/octet-stream, so browsers downloaded "Invalid credentials".
const bodies: [string, () => Response, string][] = [
  ["string", () => new Response("Invalid credentials", { status: 401 }), "text/plain;charset=utf-8"],
  ["string 200", () => new Response("ok"), "text/plain;charset=utf-8"],
  ["explicit type", () => new Response("<p>x</p>", { headers: { "Content-Type": "text/html" } }), "text/html"],
  ["blob", () => new Response(new Blob(["x"], { type: "image/png" })), "image/png"],
  ["json", () => Response.json({ ok: true }, { status: 400 }), "application/json;charset=utf-8"],
  ["form", () => new Response(new URLSearchParams("a=b")), "application/x-www-form-urlencoded;charset=UTF-8"],
];

for (const [name, make, type] of bodies) {
  test(`served response keeps its content type (${name})`, async () => {
    const server = await serve(() => make(), { port: 0 });
    try {
      const res = await fetch(`http://127.0.0.1:${server.port}/`);
      expect(res.headers.get("content-type")).toBe(type);
      expect(res.headers.get("x-request-id")).toBeTruthy();
    } finally {
      server.stop();
    }
  });

  test(`cors() keeps the content type (${name})`, async () => {
    const handler = cors(() => make(), { origin: "https://app.example" });
    const server = Bun.serve({ port: 0, fetch: (req) => handler(req) as any });
    try {
      const res = await fetch(`http://127.0.0.1:${server.port}/`, { headers: { Origin: "https://app.example" } });
      expect(res.headers.get("content-type")).toBe(type);
      expect(res.headers.get("access-control-allow-origin")).toBe("https://app.example");
    } finally {
      server.stop(true);
    }
  });
}

test("a response with immutable headers still gets the request id", async () => {
  const upstream = Bun.serve({ port: 0, fetch: () => new Response("from upstream") });
  const server = await serve(() => fetch(`http://127.0.0.1:${upstream.port}/`), { port: 0 });
  try {
    const res = await fetch(`http://127.0.0.1:${server.port}/`);
    expect(await res.text()).toBe("from upstream");
    expect(res.headers.get("x-request-id")).toBeTruthy();
  } finally {
    server.stop();
    upstream.stop(true);
  }
});
