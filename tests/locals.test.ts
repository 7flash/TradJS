import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppRouter } from "../src/server/app-router";

let appDir = "";
beforeAll(async () => {
  appDir = await mkdtemp(join(tmpdir(), "tradjs-locals-"));
  const w = async (p: string, c: string) => {
    await mkdir(join(appDir, p, ".."), { recursive: true });
    await writeFile(join(appDir, p), c);
  };
  await w("middleware.ts", "export default function mw(req: Request, ctx: any) { ctx.locals.user = req.headers.get('x-user') ?? 'guest'; }");
  await w("layout.tsx", "export default function L({ children, locals }: any) { return <html><body><nav>hi {locals.user}</nav>{children}</body></html>; }");
  await w("page.tsx", "export default function P({ locals }: any) { return <p>page for {locals.user}</p>; }");
  await w("boom/page.tsx", "export default function P() { throw new Error('boom'); }");
  await w("boom/error.tsx", "export default function E({ locals }: any) { return <p>sorry {locals.user}</p>; }");
  await w("api/me/route.ts", "export function GET(_req: Request, ctx: any) { return Response.json({ user: ctx.locals.user, pattern: ctx.route.pattern }); }");
});
afterAll(async () => { await rm(appDir, { recursive: true, force: true }); });

const get = async (app: any, url: string) =>
  (await app(new Request(`http://localhost${url}`, { headers: { "x-user": "ada" } }))) as Response;

test("middleware fills locals; layout, page, error page and API handler read them", async () => {
  const app = createAppRouter({ appDir, mode: "production" });
  await app.ready;
  const html = await (await get(app, "/")).text();
  expect(html).toContain("hi ada");
  expect(html).toContain("page for ada");
  expect(await (await get(app, "/boom")).text()).toContain("sorry ada");
  expect(await (await get(app, "/api/me")).json()).toEqual({ user: "ada", pattern: "/api/me" });
});

test("each request gets its own locals", async () => {
  const app = createAppRouter({ appDir, mode: "production" });
  await app.ready;
  const a = await (await app(new Request("http://localhost/", { headers: { "x-user": "a" } })) as Response).text();
  const b = await (await app(new Request("http://localhost/")) as Response).text();
  expect(a).toContain("page for a");
  expect(b).toContain("page for guest");
});
