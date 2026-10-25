import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { buildClientScript, builtAssets, clearCaches } from "../src/server/build";
import { buildToDisk } from "../src/server/cli-build";

async function fixture(run: (dir: string) => Promise<void>) {
  // Keep resolution within this project's pinned development dependencies.
  const dir = mkdtempSync(path.join(import.meta.dir, ".browser-buffer-"));
  try { clearCaches(); await run(dir); }
  finally { clearCaches(); rmSync(dir, { recursive: true, force: true }); }
}

test("bare buffer uses Bun's browser implementation", () => fixture(async dir => {
  const entry = path.join(dir, "entry.ts");
  writeFileSync(entry, 'import { Buffer } from "buffer"; globalThis.result = Buffer.from("browser").toString("hex");');
  const url = await buildClientScript(entry);
  const sandbox: any = {};
  runInNewContext(new TextDecoder().decode(builtAssets[url].content), sandbox);
  expect(sandbox.result).toBe("62726f77736572");
}));

test("configured server packages and auto-detected Bun SDKs stay blocked", () => fixture(async dir => {
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({
    tradjs: { serverOnly: ["secret-sdk"] }, dependencies: { "bun-sdk": "1.0.0" },
  }));
  const sdk = path.join(dir, "node_modules", "bun-sdk");
  mkdirSync(sdk, { recursive: true });
  writeFileSync(path.join(sdk, "package.json"), '{"main":"index.js"}');
  writeFileSync(path.join(sdk, "index.js"), 'export { Database } from "bun:sqlite";');
  const buildUrl = pathToFileURL(path.resolve(import.meta.dir, "../src/server/build.ts")).href;
  for (const specifier of ["secret-sdk", "secret-sdk/keys", "bun-sdk", "bun-sdk/keys"]) {
    writeFileSync(path.join(dir, "entry.ts"), 'import "./dependency";');
    writeFileSync(path.join(dir, "dependency.ts"), `import * as sdk from ${JSON.stringify(specifier)}; console.log(sdk);`);
    // Fresh process isolates the framework's package detection cache and cwd.
    const result = spawnSync(process.execPath, ["-e", `import { buildClientScript } from ${JSON.stringify(buildUrl)}; await buildClientScript('./entry.ts');`], { cwd: dir, encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`Server-only import "${specifier}"`);
  }
}), 20000);

test("web3 browser entry builds directly and round-trips unsigned transactions without Node globals", () => fixture(async dir => {
  const entry = path.join(dir, "page.client.tsx");
  writeFileSync(entry, `
    import { Transaction, PublicKey, SystemProgram } from '@solana/web3.js';
    const payer = new PublicKey(new Uint8Array(32).fill(1));
    const recipient = new PublicKey(new Uint8Array(32).fill(2));
    const tx = new Transaction({ feePayer: payer, recentBlockhash: payer.toBase58() });
    tx.add(SystemProgram.transfer({ fromPubkey: payer, toPubkey: recipient, lamports: 123 }));
    const bytes = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    const restored = Transaction.from(bytes);
    globalThis.result = {
      original: Array.from(bytes),
      restored: Array.from(restored.serialize({ requireAllSignatures: false, verifySignatures: false })),
      payer: restored.feePayer.toBase58(), expectedPayer: payer.toBase58(),
      instructions: restored.instructions.length,
    };
  `);
  await buildToDisk({ entries: [entry], outDir: path.join(dir, "out") });
  const url = await buildClientScript(entry);
  const sandbox: any = { console, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer };
  expect(sandbox.Buffer).toBeUndefined();
  expect(sandbox.process).toBeUndefined();
  runInNewContext(new TextDecoder().decode(builtAssets[url].content), sandbox);
  expect(sandbox.result.restored).toEqual(sandbox.result.original);
  expect(sandbox.result.payer).toBe(sandbox.result.expectedPayer);
  expect(sandbox.result.instructions).toBe(1);
}), 20000);

for (const specifier of ["fs", "fs/promises", "node:fs", "node:buffer", "bun:sqlite", "bun"]) {
  for (const transitive of [false, true]) {
    test(`rejects ${transitive ? "transitive" : "direct"} ${specifier}`, () => fixture(async dir => {
      const entry = path.join(dir, "entry.ts");
      const source = `import * as value from ${JSON.stringify(specifier)}; console.log(value);`;
      writeFileSync(entry, transitive ? 'import "./dependency";' : source);
      if (transitive) writeFileSync(path.join(dir, "dependency.ts"), source);
      await expect(buildClientScript(entry)).rejects.toThrow(`Server-only import "${specifier}"`);
    }));
  }
}
