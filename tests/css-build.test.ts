import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import {
  buildCSSModule,
  buildScopedStyle,
  builtAssets,
} from "../src/server/build";

const tempDirs: string[] = [];

function tempCss(name: string, contents: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "tradjs-css-"));
  tempDirs.push(dir);
  const file = path.join(dir, name);
  writeFileSync(file, contents);
  return file;
}

function assetText(url: string): string {
  const asset = builtAssets[url];
  if (!asset) throw new Error(`Missing built asset ${url}`);
  return new TextDecoder().decode(asset.content);
}

afterEach(() => {
  for (const dir of tempDirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

describe("CSS build correctness", () => {
  test("page.css selectors are actually route-scoped and keyframes are untouched", async () => {
    const file = tempCss(
      "page.css",
      `
.box, .title:hover { color: red; }
body.theme .shell { background: black; }
@media (min-width: 600px) { .box { color: blue; } }
@keyframes spin { from { opacity: 0; } 50% { opacity: .5; } to { opacity: 1; } }
`,
    );

    const url = await buildScopedStyle(file, "/demo");
    const css = assetText(url);

    expect(css).toContain('body[data-page="/demo"] .box');
    expect(css).toContain('body[data-page="/demo"] .title:hover');
    expect(css).toContain('body[data-page="/demo"].theme .shell');
    expect(css).toContain("@media");
    expect(css).toContain("@keyframes spin");
    expect(css).toContain("from { opacity: 0; }");
    expect(css).not.toContain('body[data-page="/demo"] from');
    expect(css).not.toContain('body[data-page="/demo"] 50%');
  });

  test("CSS modules rewrite authored selector classes only", async () => {
    const file = tempCss(
      "card.module.css",
      `
.real { content: ".fake"; background-image: url("./icon.foo.svg"); }
[data-label=".attribute-fake"] .other:not(.nested) { color: red; }
@keyframes pulse { from { opacity: 0; } to { opacity: 1; } }
`,
    );

    const result = await buildCSSModule(file);

    expect(result.classMap.real).toBeTruthy();
    expect(result.classMap.other).toBeTruthy();
    expect(result.classMap.nested).toBeTruthy();
    expect(result.classMap.fake).toBeUndefined();
    expect(result.classMap.foo).toBeUndefined();
    expect(result.classMap["attribute-fake"]).toBeUndefined();
    expect(result.css).toContain('content: ".fake"');
    expect(result.css).toContain('url("./icon.foo.svg")');
    expect(result.css).toContain('[data-label=".attribute-fake"]');
  });
});
