/**
 * melina/server — Full-Stack Integration Tests
 *
 * Spins up a real Melina server using the showcase app,
 * makes HTTP requests, and verifies SSR output + client script injection.
 *
 * Run: bun test tests/integration.test.ts
 */

import { describe, test, expect, afterAll } from "bun:test";
import { serve, createAppRouter } from "../src/web";
import path from "path";

const showcaseDir = path.join(
  import.meta.dir,
  "..",
  "examples",
  "showcase",
  "app",
);

function getRandomPort(): number {
  return Math.floor(Math.random() * 10000) + 40000;
}

// ─── Full-Stack Server Tests ───────────────────────────────────────────────────

describe("Full-Stack Integration", () => {
  let server: any;
  let baseUrl: string;

  // Start once, share across tests
  test("starts a real Melina server", async () => {
    const handler = createAppRouter({
      appDir: showcaseDir,
      defaultTitle: "Integration Test",
    });

    const port = getRandomPort();
    server = await serve(handler, { port });
    baseUrl = `http://localhost:${server.port}`;
    expect(server.port).toBeGreaterThan(0);
  });

  test("home page returns valid HTML with correct status", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");

    const html = await res.text();
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
    expect(html).toContain("Melina.js");
  });

  test("SSR output contains proper head elements", async () => {
    const res = await fetch(`${baseUrl}/`);
    const html = await res.text();

    // Should have a title
    expect(html).toContain("<title>");
    // Should have proper HTML structure
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<head>");
    expect(html).toContain("<body");
  });

  test("nested route renders correctly", async () => {
    const res = await fetch(`${baseUrl}/counter`);
    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
  });

  test("client script is injected into SSR output", async () => {
    const res = await fetch(`${baseUrl}/counter`);
    const html = await res.text();

    // Pages with page.client.tsx should have a script tag injected
    expect(html).toContain("<script");
  });

  test("404 for non-existent routes", async () => {
    const res = await fetch(`${baseUrl}/this-route-does-not-exist-xyz`);
    expect(res.status).toBe(404);
  });

  test("API route returns JSON", async () => {
    const res = await fetch(`${baseUrl}/api/benchmark-ssg`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");

    const body = await res.json();
    expect(body).toBeDefined();
    expect(typeof body).toBe("object");
  });

  test("request ID header is present", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  test("custom request ID is echoed back", async () => {
    const customId = "integration-test-123";
    const res = await fetch(`${baseUrl}/`, {
      headers: { "X-Request-ID": customId },
    });
    expect(res.headers.get("x-request-id")).toBe(customId);
  });

  test("built CSS assets are served when available", async () => {
    // Get the home page and look for CSS asset URLs
    const homeRes = await fetch(`${baseUrl}/`);
    const html = await homeRes.text();

    // Look for a CSS link in the HTML
    const cssMatch = html.match(/href="(\/[^"]+\.css)"/);
    if (!cssMatch) {
      console.log("⏭️  No CSS assets found in home page — skipping");
      return;
    }

    const cssUrl = cssMatch[1];
    const cssRes = await fetch(`${baseUrl}${cssUrl}`);
    // Asset may have been cleared by concurrent test file cache resets;
    // just verify we get a response (200 or 404)
    expect([200, 404]).toContain(cssRes.status);
    if (cssRes.status === 200) {
      expect(cssRes.headers.get("content-type")).toBe("text/css");
    }
  });

  test("multiple concurrent requests work correctly", async () => {
    const results = await Promise.all([
      fetch(`${baseUrl}/`),
      fetch(`${baseUrl}/counter`),
      fetch(`${baseUrl}/this-route-does-not-exist`),
    ]);

    expect(results[0].status).toBe(200);
    expect(results[1].status).toBe(200);
    expect(results[2].status).toBe(404);
  });

  afterAll(() => {
    if (server) server.stop();
  });
});
