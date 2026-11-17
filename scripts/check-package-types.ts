/**
 * Pack the package, install it into a temporary strict TypeScript project
 * and type-check a consumer under `moduleResolution: bundler` and `node16`
 * with `skipLibCheck: false`. Run after `bun run build`.
 */
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const repo = path.resolve(import.meta.dir, "..");
const dir = mkdtempSync(path.join(tmpdir(), "tradjs-types-"));
const run = (cmd: string[], cwd: string) => {
  const r = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  return { ok: r.exitCode === 0, out: r.stdout.toString() + r.stderr.toString() };
};

try {
  const pack = run(["npm", "pack", "--silent", "--pack-destination", dir], repo);
  if (!pack.ok) throw new Error(`npm pack failed:\n${pack.out}`);
  const tarball = readdirSync(dir).find((f) => f.endsWith(".tgz"))!;
  const target = path.join(dir, "node_modules", "tradjs");
  mkdirSync(target, { recursive: true });
  // Relative paths: GNU tar on Windows reads "C:" in a path as a remote host.
  const untar = run(["tar", "-xzf", tarball, "-C", "node_modules/tradjs", "--strip-components=1"], dir);
  if (!untar.ok) throw new Error(`tar failed:\n${untar.out}`);
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "consumer", private: true, type: "module" }));
  // The consumer gets typescript and Bun's types the way an app would.
  const add = run(["bun", "add", "typescript", "@types/bun"], dir);
  if (!add.ok) throw new Error(`bun add failed:\n${add.out}`);

  writeFileSync(
    path.join(dir, "app.tsx"),
    `import { createAppRouter } from "tradjs";
import { render } from "tradjs/client";
import { Head, renderToString } from "tradjs/server";
const handler = createAppRouter({ appDir: "app" });
const html: string = renderToString(<main><Head><title>x</title></Head>hello</main>);
render(<p>hi</p>, {} as HTMLElement);
void handler; void html;
`,
  );
  let failed = false;
  for (const [module, resolution] of [["esnext", "bundler"], ["node16", "node16"]] as const) {
    writeFileSync(
      path.join(dir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          strict: true, noEmit: true, skipLibCheck: false,
          module, moduleResolution: resolution, target: "esnext",
          jsx: "react-jsx", jsxImportSource: "tradjs/client", lib: ["esnext", "dom"],
        },
        files: ["app.tsx"],
      }),
    );
    const fallback = run(["bun", path.join(dir, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.json"], dir);
    console.log(`${resolution}: ${fallback.ok ? "ok" : "FAILED"}`);
    if (!fallback.ok) {
      console.log(fallback.out);
      failed = true;
    }
  }
  if (failed) process.exit(1);
} finally {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
