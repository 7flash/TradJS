import { describe, expect, test } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildClientScript,
  buildStyle,
  buildScopedStyle,
  buildAsset,
  builtAssets,
  getBuiltAssetPaths,
  clearCaches,
} from "../src/server/build";
import { buildToDisk } from "../src/server/cli-build";
const text = (url: string) =>
  new TextDecoder().decode(builtAssets[url].content);
async function fixture(run: (dir: string) => Promise<void>) {
  const dir = mkdtempSync(path.join(tmpdir(), "tradjs-build-contract-"));
  try {
    clearCaches();
    await run(dir);
  } finally {
    clearCaches();
    rmSync(dir, { recursive: true, force: true });
  }
}
describe("native build contracts", () => {
  test(
    "CSS-module imports complete without waiting on the parent build queue",
    () =>
      fixture(async (dir) => {
        writeFileSync(
          path.join(dir, "card.module.css"),
          ".card { color: red; }",
        );
        writeFileSync(
          path.join(dir, "client.ts"),
          'import styles from "./card.module.css"; export default () => styles.card;',
        );
        const url = await buildClientScript(path.join(dir, "client.ts"));
        expect(text(url)).toContain("card_");
      }),
    10000,
  );
  test("scoped CSS cache keys include route context", () =>
    fixture(async (dir) => {
      const css = path.join(dir, "page.css");
      writeFileSync(css, ".card { color: red; }");
      const a = await buildScopedStyle(css, "/a"),
        b = await buildScopedStyle(css, "/b"),
        global = await buildStyle(css);
      expect(a).not.toBe(b);
      expect(text(a)).toContain('data-page="/a"');
      expect(text(b)).toContain('data-page="/b"');
      expect(text(global)).not.toContain("data-page");
    }));
  test("dev script fingerprints detect dependency contents despite unchanged timestamps", () =>
    fixture(async (dir) => {
      if (process.env.NODE_ENV === "production")
        throw new Error("Run build contracts with NODE_ENV=development.");
      const dep = path.join(dir, "dep.ts"),
        entry = path.join(dir, "entry.ts");
      writeFileSync(dep, 'export const value="before-marker";');
      writeFileSync(entry, 'export { value } from "./dep";');
      const stat = statSync(dep);
      const first = await buildClientScript(entry);
      writeFileSync(dep, 'export const value="after-marker";');
      utimesSync(dep, stat.atime, stat.mtime);
      const second = await buildClientScript(entry);
      expect(second).not.toBe(first);
      expect(text(second)).toContain("after-marker");
    }));
  test("a failed rebuild rejects instead of returning stale JavaScript", () =>
    fixture(async (dir) => {
      const entry = path.join(dir, "entry.ts");
      writeFileSync(entry, "export const value=1;");
      await buildClientScript(entry);
      writeFileSync(entry, "export const = broken;");
      await expect(buildClientScript(entry)).rejects.toThrow();
    }));
  test("server dependencies in browser entries fail explicitly", () =>
    fixture(async (dir) => {
      const entry = path.join(dir, "entry.ts");
      writeFileSync(
        entry,
        'import { readFileSync } from "node:fs"; export default () => readFileSync("secret");',
      );
      await expect(buildClientScript(entry)).rejects.toThrow();
    }));
  test("CLI emits selected outputs and companions, excluding unrelated registry assets", () =>
    fixture(async (dir) => {
      const unrelated = path.join(dir, "unrelated.txt"),
        entry = path.join(dir, "entry.ts"),
        out = path.join(dir, "out");
      writeFileSync(unrelated, "not selected");
      const other = await buildAsset(Bun.file(unrelated));
      writeFileSync(entry, "export const selected=42;");
      const selected = await buildClientScript(entry);
      await buildToDisk({ entries: [entry], outDir: out });
      const emitted = readdirSync(out);
      expect(emitted).not.toContain(other.slice(1));
      for (const asset of getBuiltAssetPaths(selected))
        expect(readFileSync(path.join(out, asset.slice(1))).byteLength).toBe(
          builtAssets[asset].content.byteLength,
        );
    }));
});
