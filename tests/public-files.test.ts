import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppRouter } from "../src/server/app-router";

let root = "";
let app: any;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "tradjs-public-"));
  const appDir = join(root, "app");
  await mkdir(join(root, "public", "img"), { recursive: true });
  await mkdir(join(appDir, "about"), { recursive: true });
  await writeFile(join(root, "secret.txt"), "outside");
  await writeFile(join(root, "public", ".env"), "SECRET=1");
  await writeFile(join(root, "public", "robots.txt"), "User-agent: *\n");
  await writeFile(join(root, "public", "about"), "file named like a route");
  await writeFile(join(root, "public", "img", "logo.svg"), "<svg xmlns='http://www.w3.org/2000/svg'/>");
  await writeFile(join(root, "public", "video.bin"), "0123456789");
  await writeFile(join(appDir, "about", "page.tsx"), "export default function P(){ return <p>about page</p>; }");
  try { await symlink(join(root, "secret.txt"), join(root, "public", "link.txt")); } catch {}
  app = createAppRouter({ appDir, mode: "production" });
  await app.ready;
});
afterAll(async () => { await rm(root, { recursive: true, force: true }); });

const get = async (path: string, init: RequestInit = {}) =>
  (await app(new Request(`http://localhost${path}`, init))) as Response;

test("serves public files with a content type and revalidation headers", async () => {
  const res = await get("/robots.txt");
  expect(res.status).toBe(200);
  expect(await res.text()).toBe("User-agent: *\n");
  expect(res.headers.get("content-type")).toContain("text/plain");
  expect(res.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
  expect((await get("/img/logo.svg")).headers.get("content-type")).toContain("image/svg+xml");
});

test("nothing outside the folder and no dotfiles, however the path is written", async () => {
  for (const path of ["/../secret.txt", "/%2e%2e/secret.txt", "/img/%2e%2e/%2e%2e/secret.txt", "/%2e%2e%2fsecret.txt",
    "/img%5c..%5c..%5csecret.txt", "/.env", "/%2eenv", "/img/..%00/x", "/link.txt", "/C:/Windows/win.ini"]) {
    expect([path, (await get(path)).status]).toEqual([path, 404]);
  }
});

test("an app route wins over a public file with the same path", async () => {
  expect(await (await get("/about")).text()).toContain("about page");
});

test("ETag gives 304, HEAD has no body, Range gives 206 or 416", async () => {
  const first = await get("/video.bin");
  const etag = first.headers.get("etag")!;
  expect((await get("/video.bin", { headers: { "if-none-match": etag } })).status).toBe(304);
  const head = await get("/video.bin", { method: "HEAD" });
  expect(head.status).toBe(200);
  expect(await head.text()).toBe("");
  const part = await get("/video.bin", { headers: { range: "bytes=2-5" } });
  expect(part.status).toBe(206);
  expect(part.headers.get("content-range")).toBe("bytes 2-5/10");
  expect(await part.text()).toBe("2345");
  expect(await (await get("/video.bin", { headers: { range: "bytes=-3" } })).text()).toBe("789");
  expect((await get("/video.bin", { headers: { range: "bytes=50-60" } })).status).toBe(416);
});

test("publicDir: false turns it off", async () => {
  const off = createAppRouter({ appDir: join(root, "app"), mode: "production", publicDir: false });
  await off.ready;
  expect(((await off(new Request("http://localhost/robots.txt"))) as Response).status).toBe(404);
});
