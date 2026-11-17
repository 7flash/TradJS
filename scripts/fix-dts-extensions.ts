/**
 * tsc emits declaration files with extensionless relative imports
 * (`from "./render"`). Consumers using `moduleResolution: node16`/`nodenext`
 * cannot resolve those, so every type from the package (JSX included)
 * silently becomes `any`. Rewrite them to explicit `.js` paths, or
 * `/index.js` for directories, after the build.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..", "dist");
const SPECIFIER = /((?:from|import)\s*\(?\s*["'])(\.{1,2}\/[^"']+?)(["'])/g;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith(".d.ts") ? [full] : [];
  });
}

function withExtension(file: string, spec: string): string {
  if (/\.(m|c)?js$/.test(spec)) return spec;
  const base = path.resolve(path.dirname(file), spec);
  if (existsSync(`${base}.d.ts`)) return `${spec}.js`;
  if (existsSync(path.join(base, "index.d.ts"))) return `${spec.replace(/\/$/, "")}/index.js`;
  return spec;
}

let changed = 0;
for (const file of walk(root)) {
  const before = readFileSync(file, "utf8");
  const after = before.replace(SPECIFIER, (_m, head, spec, tail) => `${head}${withExtension(file, spec)}${tail}`);
  if (after !== before) {
    writeFileSync(file, after);
    changed++;
  }
}
console.log(`fix-dts-extensions: rewrote ${changed} declaration files`);
