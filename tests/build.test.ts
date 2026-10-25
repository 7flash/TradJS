import { describe, test, expect, beforeAll } from "bun:test";
import {
  getContentType,
  buildScript,
  buildStyle,
  clearCaches,
  builtAssets,
  buildCache,
} from "../src/server/build";
import path from "path";
import { writeFileSync } from "fs";
describe("getContentType", () => {
  test("returns correct types for images", () => {
    expect(getContentType(".jpg")).toBe("image/jpeg");
    expect(getContentType(".jpeg")).toBe("image/jpeg");
    expect(getContentType(".png")).toBe("image/png");
    expect(getContentType(".gif")).toBe("image/gif");
    expect(getContentType(".webp")).toBe("image/webp");
    expect(getContentType(".svg")).toBe("image/svg+xml");
    expect(getContentType(".ico")).toBe("image/x-icon");
  });
  test("returns correct types for fonts", () => {
    expect(getContentType(".ttf")).toBe("font/ttf");
    expect(getContentType(".otf")).toBe("font/otf");
    expect(getContentType(".woff")).toBe("font/woff");
    expect(getContentType(".woff2")).toBe("font/woff2");
    expect(getContentType(".eot")).toBe("application/vnd.ms-fontobject");
  });
  test("returns correct types for styles and scripts", () => {
    expect(getContentType(".css")).toBe("text/css");
    expect(getContentType(".js")).toBe("text/javascript");
  });
  test("returns correct types for data formats", () => {
    expect(getContentType(".json")).toBe("application/json");
    expect(getContentType(".pdf")).toBe("application/pdf");
  });
  test("returns correct types for media", () => {
    expect(getContentType(".mp3")).toBe("audio/mpeg");
    expect(getContentType(".mp4")).toBe("video/mp4");
    expect(getContentType(".webm")).toBe("video/webm");
  });
  test("returns octet-stream for unknown extensions", () => {
    expect(getContentType(".xyz")).toBe("application/octet-stream");
    expect(getContentType(".unknown")).toBe("application/octet-stream");
  });
  test("is case-insensitive", () => {
    expect(getContentType(".JPG")).toBe("image/jpeg");
    expect(getContentType(".PNG")).toBe("image/png");
    expect(getContentType(".CSS")).toBe("text/css");
  });
});
describe("buildScript", () => {
  const fixtureFile = path.join(
    import.meta.dir,
    "..",
    "examples",
    "showcase",
    "app",
    "streaming",
    "page.client.tsx",
  );
  let builtUrl: string;
  beforeAll(async () => {
    builtUrl = await buildScript(fixtureFile);
  });
  test("returns a hashed URL starting with /", () => {
    expect(builtUrl).toMatch(/^\//);
    expect(builtUrl).toMatch(/\.js$/);
    expect(builtUrl).toContain("-");
  });
  test("stores built asset in builtAssets", () => {
    expect(builtAssets[builtUrl]).toBeDefined();
    expect(builtAssets[builtUrl].contentType).toContain("text/javascript");
  });
});
describe("buildStyle", () => {
  const fixtureFile = path.join(
    import.meta.dir,
    "..",
    "examples",
    "showcase",
    "app",
    "globals.css",
  );
  let builtUrl: string;
  beforeAll(async () => {
    builtUrl = await buildStyle(fixtureFile);
  });
  test("returns a hashed CSS URL", () => {
    expect(builtUrl).toMatch(/^\//);
    expect(builtUrl).toMatch(/\.css$/);
  });
  test("stores built CSS in builtAssets", () => {
    expect(builtAssets[builtUrl]).toBeDefined();
    expect(builtAssets[builtUrl].contentType).toBe("text/css");
  });
});
describe("build deduplication", () => {
  test("coalesces concurrent style builds across relative and absolute paths", async () => {
    const fixtureFile = path.join(import.meta.dir, "tmp-concurrency.css");
    writeFileSync(fixtureFile, ".race-check { color: rebeccapurple; }");
    clearCaches();
    const relativePath = path.relative(process.cwd(), fixtureFile);
    const [fromRelative, fromAbsolute] = await Promise.all([
      buildStyle(relativePath),
      buildStyle(fixtureFile),
    ]);
    expect(fromRelative).toBe(fromAbsolute);
    expect(builtAssets[fromRelative]).toBeDefined();
    expect(Object.keys(buildCache)).toContain(path.resolve(fixtureFile));
  });
});
describe("clearCaches", () => {
  test("clears build cache", () => {
    clearCaches();
    expect(Object.keys(buildCache).length).toBe(0);
  });
});
