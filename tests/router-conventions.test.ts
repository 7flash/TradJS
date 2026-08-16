import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { discoverRoutes } from "../src/server/router";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

describe("route convention extensions", () => {
  test("discovers JS/JSX/TS/TSX convention files consistently", () => {
    const appDir = mkdtempSync(path.join(os.tmpdir(), "tradjs-router-"));
    tempDirs.push(appDir);
    mkdirSync(path.join(appDir, "nested"), { recursive: true });
    mkdirSync(path.join(appDir, "api"), { recursive: true });
    writeFileSync(
      path.join(appDir, "layout.js"),
      "export default ({children}) => children;\n",
    );
    writeFileSync(
      path.join(appDir, "middleware.jsx"),
      "export default () => {};\n",
    );
    writeFileSync(
      path.join(appDir, "nested", "layout.ts"),
      "export default ({children}) => children;\n",
    );
    writeFileSync(
      path.join(appDir, "nested", "page.jsx"),
      "export default () => null;\n",
    );
    writeFileSync(
      path.join(appDir, "nested", "error.js"),
      "export default () => null;\n",
    );
    writeFileSync(
      path.join(appDir, "nested", "loading.ts"),
      "export default () => null;\n",
    );
    writeFileSync(
      path.join(appDir, "api", "route.jsx"),
      "export const GET = () => new Response('ok');\n",
    );

    const routes = discoverRoutes(appDir, { quiet: true });
    const page = routes.find((route) => route.pattern === "/nested")!;
    const api = routes.find((route) => route.pattern === "/api")!;

    expect(page.layouts.map((file) => path.basename(file))).toEqual([
      "layout.js",
      "layout.ts",
    ]);
    expect(path.basename(page.errorPath!)).toBe("error.js");
    expect(path.basename(page.loadingPath!)).toBe("loading.ts");
    expect(page.middlewares.map((file) => path.basename(file))).toEqual([
      "middleware.jsx",
    ]);
    expect(api.type).toBe("api");
    expect(path.basename(api.filePath)).toBe("route.jsx");
  });
});
