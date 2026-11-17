import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppRouter } from "../src/server/app-router";

test("layouts receive the route params, like the page", async () => {
  const appDir = await mkdtemp(join(tmpdir(), "tradjs-layout-params-"));
  try {
    const w = async (p: string, c: string) => {
      await mkdir(join(appDir, p, ".."), { recursive: true });
      await writeFile(join(appDir, p), c);
    };
    await w("teams/[team]/layout.tsx",
      "export default function L({ children, params }: any) { return <section>team {params.team}{children}</section>; }");
    await w("teams/[team]/page.tsx", "export default function P({ params }: any) { return <p>page {params.team}</p>; }");
    for (const mode of ["development", "production"] as const) {
      const app = createAppRouter({ appDir, mode });
      await app.ready;
      const html = await ((await app(new Request("http://localhost/teams/red"))) as Response).text();
      expect(html).toContain("team red");
      expect(html).toContain("page red");
    }
  } finally {
    await rm(appDir, { recursive: true, force: true });
  }
});
