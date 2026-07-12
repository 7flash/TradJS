import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import {
  buildScript,
  buildStyle,
  buildAsset,
  buildClientScript,
  asset,
  serve,
  clearCaches,
  createAppRouter,
} from "../src/web";
import { imports } from "../src/server/imports";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import path from "path";

// Helper to create test files
const testDir = path.join(process.cwd(), "test-assets");

// Helper to get random port
function getRandomPort(): number {
  return Math.floor(Math.random() * 10000) + 30000; // Use ports 30000-40000
}

beforeEach(() => {
  // Clear caches before each test
  clearCaches();

  // Clean up and recreate test directory
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {}
  mkdirSync(testDir, { recursive: true });
});

describe("imports", () => {
  test("should generate import map for simple dependencies", async () => {
    const packageJson = {
      dependencies: {
        react: "^18.2.0",
        "react-dom": "^18.2.0",
      },
    };

    const result = await imports([], packageJson);

    expect(result.imports).toBeDefined();
    expect(result.imports["react"]).toMatch(
      /https:\/\/esm\.sh\/react@18\.2\.0/,
    );
    expect(result.imports["react-dom"]).toMatch(
      /https:\/\/esm\.sh\/react-dom@18\.2\.0/,
    );
  });

  test("should handle scoped packages", async () => {
    const packageJson = {
      dependencies: {
        "@tanstack/react-query": "^4.0.0",
      },
    };

    const result = await imports([], packageJson);

    expect(result.imports["@tanstack/react-query"]).toMatch(
      /https:\/\/esm\.sh\/@tanstack\/react-query@4\.0\.0/,
    );
  });

  test("should handle subpaths", async () => {
    const packageJson = {
      dependencies: {
        "react-dom": "^18.2.0",
      },
    };

    const result = await imports(["react-dom/client"], packageJson);

    expect(result.imports["react-dom/client"]).toMatch(
      /https:\/\/esm\.sh\/react-dom@18\.2\.0\/client/,
    );
  });

  test("should add dev query param in development", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    const packageJson = {
      dependencies: {
        react: "^18.2.0",
      },
    };

    const result = await imports([], packageJson);

    expect(result.imports["react"]).toContain("dev");

    process.env.NODE_ENV = originalEnv;
  });

  test("should handle peer dependencies", async () => {
    const packageJson = {
      dependencies: {
        react: "^18.2.0",
        "react-dom": "^18.2.0",
      },
    };

    const bunLock = {
      packages: {
        "react-dom": [
          "react-dom@18.2.0",
          {},
          {
            peerDependencies: {
              react: "^18.2.0",
            },
          },
        ],
      },
    };

    const result = await imports([], packageJson, bunLock);

    expect(result.imports["react-dom"]).toContain("deps=react@18.2.0");
  });

  test("should return empty imports when no package.json", async () => {
    const result = await imports([], null);
    expect(result.imports).toEqual({});
  });
});

describe("buildScript", () => {
  test("should build JavaScript files", async () => {
    // Create a minimal package.json for the test
    const pkgPath = path.join(process.cwd(), "package.json");
    const originalPkg = (await Bun.file(pkgPath).exists())
      ? await Bun.file(pkgPath).text()
      : null;

    writeFileSync(
      pkgPath,
      JSON.stringify({
        name: "test-project",
        dependencies: {},
      }),
    );

    const jsPath = path.join(testDir, "test.js");
    writeFileSync(jsPath, "console.log('test');");

    const result = await buildScript(jsPath);

    expect(result).toMatch(/^\/test-[a-z0-9]{8}\.js$/);

    // Restore original package.json if it existed
    if (originalPkg) {
      writeFileSync(pkgPath, originalPkg);
    }
  });

  test("should build TypeScript files", async () => {
    const pkgPath = path.join(process.cwd(), "package.json");
    const originalPkg = (await Bun.file(pkgPath).exists())
      ? await Bun.file(pkgPath).text()
      : null;

    writeFileSync(
      pkgPath,
      JSON.stringify({
        name: "test-project",
        dependencies: {},
      }),
    );

    const tsPath = path.join(testDir, "test.ts");
    writeFileSync(
      tsPath,
      "const message: string = 'test'; console.log(message);",
    );

    const result = await buildScript(tsPath);

    expect(result).toMatch(/^\/test-[a-z0-9]{8}\.js$/);

    if (originalPkg) {
      writeFileSync(pkgPath, originalPkg);
    }
  });

  test("should throw error for non-existent file", async () => {
    await expect(buildScript("/non/existent/file.js")).rejects.toThrow(
      "Script not found",
    );
  });

  test("should throw error for empty path", async () => {
    await expect(buildScript("")).rejects.toThrow("File path is required");
  });

  test("should cache in production", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    const pkgPath = path.join(process.cwd(), "package.json");
    const originalPkg = (await Bun.file(pkgPath).exists())
      ? await Bun.file(pkgPath).text()
      : null;

    writeFileSync(
      pkgPath,
      JSON.stringify({
        name: "test-project",
        dependencies: {},
      }),
    );

    const jsPath = path.join(testDir, "cache-test.js");
    writeFileSync(jsPath, "console.log('cached');");

    const result1 = await buildScript(jsPath);
    const result2 = await buildScript(jsPath);

    expect(result1).toBe(result2);

    process.env.NODE_ENV = originalEnv;

    if (originalPkg) {
      writeFileSync(pkgPath, originalPkg);
    }
  });
});

describe("buildClientScript", () => {
  test("should only log actually stubbed installed server-only packages", async () => {
    const pkgPath = path.join(process.cwd(), "package.json");
    const originalPkg = (await Bun.file(pkgPath).exists())
      ? await Bun.file(pkgPath).text()
      : null;
    const clientPath = path.join(testDir, "client.ts");

    writeFileSync(
      pkgPath,
      JSON.stringify({
        name: "test-project",
        dependencies: {},
      }),
    );

    writeFileSync(clientPath, "console.log('client');");

    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (message?: any) => {
      warnings.push(String(message ?? ""));
    };

    try {
      await buildClientScript(clientPath);

      const stubWarnings = warnings.filter((message) =>
        message.includes("Server-only packages stubbed for browser:"),
      );

      expect(stubWarnings.length).toBe(0);
      expect(warnings.join("\n")).not.toContain("telegram");
    } finally {
      console.warn = originalWarn;
      if (originalPkg) {
        writeFileSync(pkgPath, originalPkg);
      }
      clearCaches();
    }
  });
});

describe("buildStyle", () => {
  test("should build CSS files with PostCSS", async () => {
    const cssContent = `
      .test {
        display: flex;
        user-select: none;
      }
    `;
    const cssPath = path.join(testDir, "test.css");
    writeFileSync(cssPath, cssContent);

    const result = await buildStyle(cssPath);

    expect(result).toMatch(/^\/test-[a-f0-9]{8}\.css$/);
  });

  test("should add source maps in development", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    const cssPath = path.join(testDir, "sourcemap-test.css");
    writeFileSync(cssPath, ".test { color: red; }");

    const result = await buildStyle(cssPath);

    expect(result).toMatch(/^\/sourcemap-test-[a-f0-9]{8}\.css$/);

    process.env.NODE_ENV = originalEnv;
  });

  test("should throw error for non-existent file", async () => {
    await expect(buildStyle("/non/existent/file.css")).rejects.toThrow(
      "Style not found",
    );
  });

  test("should throw error for empty path", async () => {
    await expect(buildStyle("")).rejects.toThrow("File path is required");
  });

  test("should cache in production", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    const cssPath = path.join(testDir, "cache-test.css");
    writeFileSync(cssPath, ".cached { color: blue; }");

    const result1 = await buildStyle(cssPath);
    const result2 = await buildStyle(cssPath);

    expect(result1).toBe(result2);

    process.env.NODE_ENV = originalEnv;
  });
});

describe("buildAsset", () => {
  test("should handle image files", async () => {
    const pngPath = path.join(testDir, "test.png");
    // Create a minimal PNG file
    const pngData = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
      0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0x0f, 0x00, 0x00,
      0x01, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x13, 0x0a, 0x2e, 0xb4, 0x00,
      0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    writeFileSync(pngPath, pngData);

    const file = Bun.file(pngPath);
    const result = await buildAsset(file);

    expect(result).toMatch(/^\/test-[a-f0-9]{8}\.png$/);
  });

  test("should handle font files", async () => {
    const fontPath = path.join(testDir, "test.woff2");
    writeFileSync(fontPath, "fake font data");

    const file = Bun.file(fontPath);
    const result = await buildAsset(file);

    expect(result).toMatch(/^\/test-[a-f0-9]{8}\.woff2$/);
  });

  test("should handle JSON files", async () => {
    const jsonPath = path.join(testDir, "data.json");
    writeFileSync(jsonPath, JSON.stringify({ test: true }));

    const file = Bun.file(jsonPath);
    const result = await buildAsset(file);

    expect(result).toMatch(/^\/data-[a-f0-9]{8}\.json$/);
  });

  test("should handle PDF files", async () => {
    const pdfPath = path.join(testDir, "document.pdf");
    writeFileSync(pdfPath, "%PDF-1.4 fake pdf content");

    const file = Bun.file(pdfPath);
    const result = await buildAsset(file);

    expect(result).toMatch(/^\/document-[a-f0-9]{8}\.pdf$/);
  });

  test("should return empty string for undefined file", async () => {
    const result = await buildAsset(undefined);
    expect(result).toBe("");
  });

  test("should throw error for non-existent file", async () => {
    const file = Bun.file("/non/existent/file.png");
    await expect(buildAsset(file)).rejects.toThrow("Asset not found");
  });

  test("should throw error for file without name", async () => {
    // Create a mock BunFile-like object without name
    const fakeFile = {
      exists: async () => true,
      text: async () => "",
      arrayBuffer: async () => new ArrayBuffer(0),
    } as any;

    await expect(buildAsset(fakeFile)).rejects.toThrow(
      "BunFile object must have a name property",
    );
  });

  test("should cache in production", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    const imgPath = path.join(testDir, "cache-test.png");
    writeFileSync(imgPath, "fake image data");

    const file = Bun.file(imgPath);
    const result1 = await buildAsset(file);
    const result2 = await buildAsset(file);

    expect(result1).toBe(result2);

    process.env.NODE_ENV = originalEnv;
  });
});

describe("asset (legacy)", () => {
  test("should handle string paths for CSS", async () => {
    const cssPath = path.join(testDir, "legacy.css");
    writeFileSync(cssPath, ".legacy { color: green; }");

    const consoleWarnSpy = console.warn;
    let warnCalled = false;
    console.warn = () => {
      warnCalled = true;
    };

    const result = await asset(cssPath);

    expect(result).toMatch(/^\/legacy-[a-f0-9]{8}\.css$/);
    expect(warnCalled).toBe(true);

    console.warn = consoleWarnSpy;
  });

  test("should handle string paths for JS", async () => {
    const pkgPath = path.join(process.cwd(), "package.json");
    const originalPkg = (await Bun.file(pkgPath).exists())
      ? await Bun.file(pkgPath).text()
      : null;

    writeFileSync(
      pkgPath,
      JSON.stringify({
        name: "test-project",
        dependencies: {},
      }),
    );

    const jsPath = path.join(testDir, "legacy.js");
    writeFileSync(jsPath, "console.log('legacy');");

    const consoleWarnSpy = console.warn;
    let warnCalled = false;
    console.warn = () => {
      warnCalled = true;
    };

    const result = await asset(jsPath);

    expect(result).toMatch(/^\/legacy-[a-z0-9]{8}\.js$/);
    expect(warnCalled).toBe(true);

    console.warn = consoleWarnSpy;

    if (originalPkg) {
      writeFileSync(pkgPath, originalPkg);
    }
  });

  test("should handle BunFile objects", async () => {
    const imgPath = path.join(testDir, "legacy.png");
    writeFileSync(imgPath, "fake image");

    const file = Bun.file(imgPath);

    const consoleWarnSpy = console.warn;
    let warnCalled = false;
    console.warn = () => {
      warnCalled = true;
    };

    const result = await asset(file);

    expect(result).toMatch(/^\/legacy-[a-f0-9]{8}\.png$/);
    expect(warnCalled).toBe(true);

    console.warn = consoleWarnSpy;
  });
});

describe("serve", () => {
  test("should serve an app router when called with options only", async () => {
    const appDir = path.join(testDir, "app");
    mkdirSync(appDir, { recursive: true });

    writeFileSync(
      path.join(appDir, "layout.tsx"),
      `
      export default function RootLayout({ children }: { children: any }) {
        return <html><head><title>Test App</title></head><body><main>{children}</main></body></html>;
      }
    `,
    );
    writeFileSync(
      path.join(appDir, "page.tsx"),
      `
      export default function HomePage() {
        return <h1>Options Serve</h1>;
      }
    `,
    );

    const server = await serve({ appDir, port: getRandomPort() });

    try {
      const response = await fetch(`http://localhost:${server.port}/`);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("Options Serve");
    } finally {
      server.stop();
    }
  });

  test("should stream full page responses in shell, body, and tail chunks", async () => {
    const appDir = path.join(testDir, "stream-app");
    mkdirSync(appDir, { recursive: true });

    writeFileSync(
      path.join(appDir, "layout.tsx"),
      `
      export default function RootLayout({ children }: { children: any }) {
        return <html><head><title>Stream Test</title></head><body><main>{children}</main></body></html>;
      }
    `,
    );
    writeFileSync(
      path.join(appDir, "page.tsx"),
      `
      export default function StreamPage() {
        return <section>Body Chunk</section>;
      }
    `,
    );

    const handler = createAppRouter({ appDir });
    const measure = async (_label: string, fn: () => any) => await fn();
    const response = (await handler(
      new Request("http://tradjs.test/"),
      measure as any,
    )) as Response;

    expect(response.body).toBeTruthy();

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const chunks: string[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(decoder.decode(value, { stream: true }));
    }

    expect(chunks.length).toBe(3);
    expect(chunks[0]).toContain("<html>");
    expect(chunks[1]).toBe("<section>Body Chunk</section>");
    expect(chunks[2]).toContain("</main></body></html>");
  });

  test("should fall back to root route files when app dir is absent", async () => {
    const rootDir = path.join(testDir, "root-app");
    mkdirSync(rootDir, { recursive: true });

    writeFileSync(
      path.join(rootDir, "layout.tsx"),
      `
      export default function RootLayout({ children }: { children: any }) {
        return <html><head><title>Root App</title></head><body><main>{children}</main></body></html>;
      }
    `,
    );
    writeFileSync(
      path.join(rootDir, "page.tsx"),
      `
      export default function RootPage() {
        return <h1>Root Fallback</h1>;
      }
    `,
    );

    const originalCwd = process.cwd();
    process.chdir(rootDir);

    let server: any;
    try {
      server = await serve({ port: getRandomPort() });
      const response = await fetch(`http://localhost:${server.port}/`);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("Root Fallback");
    } finally {
      server?.stop();
      process.chdir(originalCwd);
    }
  });

  test("should throw when an explicitly requested port is already in use", async () => {
    const busyPort = getRandomPort();
    const listener = Bun.listen({
      port: busyPort,
      hostname: "127.0.0.1",
      socket: {
        close() {},
        data() {},
      },
    });

    try {
      await expect(serve(() => "OK", { port: busyPort })).rejects.toThrow();
    } finally {
      listener.stop();
    }
  });

  test("should find the next available port from 3000 when no port is passed", async () => {
    let listener: any;
    try {
      listener = Bun.listen({
        port: 3000,
        hostname: "127.0.0.1",
        socket: {
          close() {},
          data() {},
        },
      });
    } catch (error: any) {
      if (error?.code === "EACCES") {
        console.log(
          "⏭️  Skipping port-3000 fallback test because this environment denies binding 127.0.0.1:3000",
        );
        return;
      }
      throw error;
    }

    const originalArgv = [...process.argv];
    const originalBunPort = process.env.BUN_PORT;
    delete process.env.BUN_PORT;
    process.argv = process.argv.slice(0, 2);

    let server: any;
    try {
      server = await serve(() => "OK");
      expect(server.port).toBeGreaterThan(3000);

      const response = await fetch(`http://localhost:${server.port}/`);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("OK");
    } finally {
      server?.stop();
      process.argv = originalArgv;
      if (originalBunPort === undefined) {
        delete process.env.BUN_PORT;
      } else {
        process.env.BUN_PORT = originalBunPort;
      }
      listener.stop();
    }
  });

  test("should treat BUN_PORT as implicit and fall forward when busy", async () => {
    const startPort = getRandomPort();
    const listener = Bun.listen({
      port: startPort,
      hostname: "127.0.0.1",
      socket: {
        close() {},
        data() {},
      },
    });

    const originalArgv = [...process.argv];
    const originalBunPort = process.env.BUN_PORT;
    process.env.BUN_PORT = String(startPort);
    process.argv = process.argv.slice(0, 2);

    let server: any;
    try {
      server = await serve(() => "OK");
      expect(server.port).toBeGreaterThan(startPort);

      const response = await fetch(`http://localhost:${server.port}/`);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("OK");
    } finally {
      server?.stop();
      process.argv = originalArgv;
      if (originalBunPort === undefined) {
        delete process.env.BUN_PORT;
      } else {
        process.env.BUN_PORT = originalBunPort;
      }
      listener.stop();
    }
  });

  test("should create a server and handle string responses", async () => {
    const handler = () => "<h1>Hello World</h1>";
    const server = await serve(handler, { port: getRandomPort() });

    expect(server.port).toBeGreaterThan(0);

    const response = await fetch(`http://localhost:${server.port}/`);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/html; charset=utf-8",
    );
    expect(text).toBe("<h1>Hello World</h1>");

    server.stop();
  });

  test("should handle Response objects", async () => {
    const handler = () =>
      new Response("Custom Response", {
        status: 201,
        headers: { "X-Custom": "Header" },
      });
    const server = await serve(handler, { port: getRandomPort() });

    const response = await fetch(`http://localhost:${server.port}/`);
    const text = await response.text();

    expect(response.status).toBe(201);
    expect(response.headers.get("x-custom")).toBe("Header");
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(text).toBe("Custom Response");

    server.stop();
  });

  test("should handle JSON responses", async () => {
    const handler = () => ({ message: "Hello", count: 42 });
    const server = await serve(handler, { port: getRandomPort() });

    const response = await fetch(`http://localhost:${server.port}/`);
    const json = await response.json();

    expect(response.headers.get("content-type")).toBe("application/json");
    expect(json).toEqual({ message: "Hello", count: 42 });

    server.stop();
  });

  test("should handle async generator responses", async () => {
    async function* handler() {
      yield "Hello ";
      yield "Streaming ";
      yield "World!";
    }

    const server = await serve(handler, { port: getRandomPort() });

    const response = await fetch(`http://localhost:${server.port}/`);
    const text = await response.text();

    // Bun handles chunked transfer encoding internally —
    // the header may not be exposed to fetch consumers
    expect(response.status).toBe(200);
    expect(text).toBe("Hello Streaming World!");

    server.stop();
  });

  test("should serve built assets", async () => {
    // First, build an asset
    const cssPath = path.join(testDir, "serve-test.css");
    writeFileSync(cssPath, ".serve { color: blue; }");

    const assetPath = await buildStyle(cssPath);

    // Now serve and request the asset
    const handler = () => "Not found";
    const server = await serve(handler, { port: getRandomPort() });

    const response = await fetch(`http://localhost:${server.port}${assetPath}`);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/css");
    expect(text).toContain("color: blue");

    server.stop();
  });

  test("should add request ID to responses", async () => {
    const handler = () => "OK";
    const server = await serve(handler, { port: getRandomPort() });

    const response = await fetch(`http://localhost:${server.port}/`);

    expect(response.headers.get("x-request-id")).toBeTruthy();

    server.stop();
  });

  test("should use existing request ID if provided", async () => {
    const handler = () => "OK";
    const server = await serve(handler, { port: getRandomPort() });

    const customId = "custom-123";
    const response = await fetch(`http://localhost:${server.port}/`, {
      headers: { "X-Request-ID": customId },
    });

    expect(response.headers.get("x-request-id")).toBe(customId);

    server.stop();
  });

  test("should handle errors gracefully", async () => {
    const handler = () => {
      throw new Error("Test error");
    };
    const server = await serve(handler, { port: getRandomPort() });

    const response = await fetch(`http://localhost:${server.port}/`);
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).toContain("Test error");

    server.stop();
  });

  test("should treat the old HMR endpoint like a normal route when no handler matches it", async () => {
    const handler = () => "OK";
    const server = await serve(handler, { port: getRandomPort() });

    const response = await fetch(
      `http://localhost:${server.port}/__melina_hmr`,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("OK");

    server.stop();
  });
});

describe("getContentType", () => {
  test("should return correct content types", async () => {
    // Create test files with different extensions
    const testFiles = [
      { name: "image.jpg", expectedTypes: ["image/jpeg"] },
      { name: "style.css", expectedTypes: ["text/css"] },
      { name: "script.js", expectedTypes: ["text/javascript"] },
      { name: "font.woff2", expectedTypes: ["font/woff2"] },
      { name: "data.json", expectedTypes: ["application/json"] },
      { name: "video.mp4", expectedTypes: ["video/mp4"] },
      {
        name: "unknown.xyz",
        expectedTypes: ["application/octet-stream", "chemical/x-xyz"],
      },
    ];

    for (const { name, expectedTypes } of testFiles) {
      const filePath = path.join(testDir, name);
      writeFileSync(filePath, "test content");

      const file = Bun.file(filePath);
      const assetPath = await buildAsset(file);

      const handler = () => "Not found";
      const server = await serve(handler, { port: getRandomPort() });

      const response = await fetch(
        `http://localhost:${server.port}${assetPath}`,
      );

      const contentType = response.headers.get("content-type") || "";
      expect(
        expectedTypes.some((expectedType) =>
          contentType.includes(expectedType),
        ),
      ).toBe(true);

      server.stop();
    }
  });
});

// Clean up after all tests
afterAll(() => {
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {}
});
