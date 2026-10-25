import { describe, expect, test } from "bun:test";
import { cors } from "../src/server/cors";

describe("cors", () => {
  test("adds wildcard origin to normal responses", async () => {
    const handler = cors(() => Response.json({ ok: true }));
    const response = await handler(
      new Request("http://localhost/api", {
        headers: { Origin: "https://example.com" },
      }),
    );
    expect(response).toBeInstanceOf(Response);
    expect(
      (response as Response).headers.get("Access-Control-Allow-Origin"),
    ).toBe("*");
  });

  test("reflects the origin when credentials are enabled", async () => {
    const handler = cors(() => new Response("ok"), {
      credentials: true,
    });
    const response = (await handler(
      new Request("http://localhost/api", {
        headers: { Origin: "https://app.example.com" },
      }),
    )) as Response;
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://app.example.com",
    );
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe(
      "true",
    );
    expect(response.headers.get("Vary")).toContain("Origin");
  });

  test("handles preflight requests", async () => {
    const handler = cors(() => new Response("unused"), {
      origin: ["https://app.example.com"],
      methods: ["GET", "POST", "OPTIONS"],
      maxAge: 600,
    });
    const response = (await handler(
      new Request("http://localhost/api", {
        method: "OPTIONS",
        headers: {
          Origin: "https://app.example.com",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type, x-token",
        },
      }),
    )) as Response;
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://app.example.com",
    );
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, POST, OPTIONS",
    );
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
      "content-type, x-token",
    );
    expect(response.headers.get("Access-Control-Max-Age")).toBe("600");
  });

  test("rejects denied preflight origins", async () => {
    const handler = cors(() => new Response("unused"), {
      origin: ["https://allowed.example.com"],
    });
    const response = (await handler(
      new Request("http://localhost/api", {
        method: "OPTIONS",
        headers: {
          Origin: "https://denied.example.com",
          "Access-Control-Request-Method": "GET",
        },
      }),
    )) as Response;
    expect(response.status).toBe(403);
  });
});
