import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppRouter } from "../src/server/app-router";

let appDir = "";
let app: Awaited<ReturnType<typeof createAppRouter>>;
const notFoundModule = join(import.meta.dir, "..", "src", "server", "not-found.ts").replaceAll("\\", "/");

beforeAll(async () => {
  appDir = await mkdtemp(join(tmpdir(), "tradjs-nf-"));
  const w = async (p: string, c: string) => {
    await mkdir(join(appDir, p, ".."), { recursive: true });
    await writeFile(join(appDir, p), c);
  };
  await w("layout.tsx", "export default function L({children}:any){return <html><body><nav>site nav</nav>{children}</body></html>}");
  await w("page.tsx", "export default function P(){return <p>home</p>}");
  await w("not-found.tsx", "export default function N(){return <p>root 404</p>}");
  await w("docs/page.tsx", "export default function P(){return <p>docs</p>}");
  await w("docs/not-found.tsx", "export default function N(){return <p>docs 404</p>}");
  await w("api/thing/route.ts", `import { notFound } from "${notFoundModule}"; export function GET(){ notFound(); }`);
  app = createAppRouter({ appDir, mode: "production" });
  await app.ready;
});
afterAll(async () => { await rm(appDir, { recursive: true, force: true }); });

const get = async (url: string, method = "GET") =>
  (await app(new Request(`http://localhost${url}`, { method }))) as Response;

test("an unknown URL gets the app's own not-found page inside its layout", async () => {
  const res = await get("/nope");
  expect(res.status).toBe(404);
  const html = await res.text();
  expect(html).toContain("root 404");
  expect(html).toContain("site nav");
});

test("the nearest not-found page wins for an unknown URL in a folder", async () => {
  const res = await get("/docs/missing/page");
  expect(res.status).toBe(404);
  expect(await res.text()).toContain("docs 404");
});

test("HEAD on an unknown URL is a bodyless 404", async () => {
  const res = await get("/nope", "HEAD");
  expect(res.status).toBe(404);
  expect(await res.text()).toBe("");
});

test("notFound() in an API route answers 404, not 500", async () => {
  const res = await get("/api/thing");
  expect(res.status).toBe(404);
});
