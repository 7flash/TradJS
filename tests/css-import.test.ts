import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildStyle } from "../src/server/build";

test("a missing local @import fails the CSS build instead of emptying it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tradjs-css-"));
  try {
    await writeFile(join(dir, "broken.css"), '@import "./missing.css";\nbody { color: red; }\n');
    await expect(buildStyle(join(dir, "broken.css"))).rejects.toThrow('@import "./missing.css" not found');
    await writeFile(join(dir, "part.css"), "h1 { color: blue; }\n");
    await writeFile(join(dir, "ok.css"), '@import "./part.css";\nbody { color: red; }\n');
    await expect(buildStyle(join(dir, "ok.css"))).resolves.toMatch(/^\/ok-[0-9a-f]{8}\.css$/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
