import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppRouter } from "../src/server/app-router";
import { canonicalPathname } from "../src/server/router";
import { isAllowedWebSocketOrigin } from "../src/server/serve";

// Tests use Request URLs, rather than raw HTTP request-target bytes: the URL
// parser normalizes literal dot segments before TradJS can inspect them.
// A raw-wire/proxy differential test needs an actual HTTP listener.
type Mode = "production" | "development";
type Kind = "static" | "dynamic" | "catch-all" | "SSG" | "denied" |
  "API" | "error" | "not-found" | "public" | "websocket";
const modes: Mode[] = ["production", "development"];
const kinds: Kind[] = ["static", "dynamic", "catch-all", "SSG", "denied", "API", "error", "not-found", "public", "websocket"];
const paths: Record<Kind, string> = {
  static: "/static", dynamic: "/dynamic/item", "catch-all": "/catch/a/b",
  SSG: "/ssg/a", denied: "/locked/secret", API: "/api/echo",
  error: "/error", "not-found": "/missing", public: "/safe.txt", websocket: "/socket",
};
let root = "";
const apps = {} as Record<Mode, ReturnType<typeof createAppRouter>>;
const write = async (name: string, contents: string) => {
  const file = join(root, "app", name);
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(file, contents);
};

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "tradjs-request-matrix-"));
  await mkdir(join(root, "public"));
  await writeFile(join(root, "outside.txt"), "OUTSIDE_PRIVATE_MARKER");
  await writeFile(join(root, "public", ".env"), "DOTENV_PRIVATE_MARKER");
  await writeFile(join(root, "public", "safe.txt"), "0123456789");
  await write("static/page.tsx", `export default function Page(){ return <main>STATIC_OK</main>; }`);
  await write("dynamic/[id]/page.tsx", `export default function Page({params}:any){ return <main data-value={params.id}>{params.id}</main>; }`);
  await write("catch/[...rest]/page.tsx", `export default function Page({params}:any){ return <main data-value={params.rest}>{params.rest}</main>; }`);
  await write("ssg/[slug]/page.tsx", `export const ssg = true; export function ssgParams(){return [{slug:'a'}];} export default function Page({params}:any){return <main>SSG_FIXED:{params.slug}</main>;}`);
  await write("locked/middleware.ts", `export default function middleware(){return new Response('DENIED_BY_MIDDLEWARE',{status:403});}`);
  await write("locked/secret/page.tsx", `export default function Page(){return <main>PROTECTED_PRIVATE_MARKER</main>;}`);
  await write("api/echo/route.ts", `export const GET=(req:Request)=>Response.json({method:'GET',query:new URL(req.url).search}); export const POST=()=>Response.json({method:'POST'}); export const PUT=()=>Response.json({method:'PUT'}); export const DELETE=()=>Response.json({method:'DELETE'});`);
  await write("error/page.tsx", `export default function Page(){throw new Error('INTERNAL_PRIVATE_MARKER');}`);
  await write("not-found.tsx", `export default function Page(){return <main>NOT_FOUND_SAFE</main>;}`);
  for (const mode of modes) {
    apps[mode] = createAppRouter({ appDir: join(root, "app"), mode });
    await apps[mode].ready;
  }
});
afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });

async function send(mode: Mode, pathname: string, method = "GET", headers: Record<string, string> = {}) {
  return await apps[mode](new Request(`http://app.test${pathname}`, { method, headers })) as Response;
}
function assertSafe(body: string) {
  expect(body).not.toContain("OUTSIDE_PRIVATE_MARKER");
  expect(body).not.toContain("DOTENV_PRIVATE_MARKER");
  expect(body).not.toContain("PROTECTED_PRIVATE_MARKER");
}

const hostilePaths: { name: string; mutate: (base: string) => string }[] = [
  { name: "literal traversal", mutate: p => `/../outside.txt${p}` },
  { name: "encoded dot dot", mutate: p => `/%2e%2e/outside.txt${p}` },
  { name: "double-encoded dot", mutate: p => `/%252e%252e${p}` },
  { name: "encoded slash", mutate: p => `/a%2fb${p}` },
  { name: "backslash", mutate: p => `/a\\b${p}` },
  { name: "encoded backslash", mutate: p => `/a%5Cb${p}` },
  { name: "NUL", mutate: p => `/a%00b${p}` },
  { name: "overlong UTF-8", mutate: p => `/a%c0%af${p}` },
  { name: "invalid percent", mutate: p => `/a%GG${p}` },
  { name: "double slash", mutate: p => `//a${p}` },
  { name: "trailing dot", mutate: p => `${p}.` },
  { name: "trailing space", mutate: p => `${p}%20` },
  { name: "unicode decomposed", mutate: p => `${p}%CC%81` },
  { name: "very long path", mutate: p => `${p}/${"x".repeat(12000)}` },
  { name: "mixed-case segment", mutate: p => p.replace("static", "StAtIc").replace("locked", "LoCkEd") },
];

for (const mode of modes) {
  describe(`request attack matrix / ${mode}`, () => {
    for (const kind of kinds) {
      for (const attack of hostilePaths) {
        test(`${attack.name} x ${kind} x ${mode}`, async () => {
          const mutated = attack.mutate(paths[kind]);
          if (kind === "websocket") {
            // WebSocket upgrade is tested separately without opening a listener.
            const origin = "https://evil.example";
            expect(isAllowedWebSocketOrigin(origin, new URL(`http://app.test${paths[kind]}`))).toBe(false);
            return;
          }
          const res = await send(mode, mutated);
          const body = await res.text();
          expect(res.status).toBeGreaterThanOrEqual(200);
          expect(res.status).toBeLessThan(600);
          assertSafe(body);
          if (kind === "denied" && res.status === 200) {
            // A changed URL may legitimately resolve elsewhere, but never to private content.
            expect(body).not.toContain("PROTECTED_PRIVATE_MARKER");
          }
          if (mode === "production") expect(body).not.toContain("INTERNAL_PRIVATE_MARKER");
        });
      }
    }
  });
}

for (const mode of modes) {
  describe(`method, origin, cache and reflection / ${mode}`, () => {
    for (const method of ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS", "PATCH"])
      for (const kind of kinds.filter(k => k !== "websocket")) {
        test(`${method} x ${kind} x ${mode}`, async () => {
          const response = await send(mode, paths[kind], method);
          const body = await response.text();
          expect(response.status).toBeGreaterThanOrEqual(200);
          expect(response.status).toBeLessThan(600);
          assertSafe(body);
          if (method === "HEAD") expect(body).toBe("");
          if (kind === "denied") expect(response.status).toBe(403);
          if (mode === "production") expect(body).not.toContain("INTERNAL_PRIVATE_MARKER");
        });
      }
    for (const [name, headers, forbidden] of [
      ["origin null", { cookie: "s=1", origin: "null" }, true],
      ["cross-site fetch", { cookie: "s=1", "sec-fetch-site": "cross-site" }, true],
      ["same-site fetch", { cookie: "s=1", "sec-fetch-site": "same-site" }, false],
      ["different port", { cookie: "s=1", origin: "http://app.test:8080" }, true],
      // https page, http request URL: a TLS-terminating proxy in front of the app. Allowed.
      ["https page behind a proxy", { cookie: "s=1", origin: "https://app.test" }, false],
      ["referer only", { cookie: "s=1", referer: "https://evil.example/p" }, false],
      ["absent cookie", { origin: "https://evil.example" }, false],
      ["same origin", { cookie: "s=1", origin: "http://app.test" }, false],
      ["spoofed host", { cookie: "s=1", origin: "https://evil.example", host: "evil.example" }, true],
      ["spoofed forwarded host", { cookie: "s=1", origin: "https://evil.example", "x-forwarded-host": "evil.example" }, true],
      ["spoofed forwarded proto", { cookie: "s=1", origin: "https://evil.example", "x-forwarded-proto": "https" }, true],
    ] as const) for (const method of ["POST", "PUT", "DELETE"]) {
      test(`CSRF ${name} x API ${method} x ${mode}`, async () => {
        const response = await send(mode, "/api/echo", method, headers);
        expect(response.status).toBe(forbidden ? 403 : 200);
      });
    }
    for (const kind of kinds.filter(k => k !== "websocket")) {
      for (const [name, headers] of [
        ["long header", { "x-pad": "a".repeat(16000) }],
        ["spoofed forwarded headers", { host: "evil.example", "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" }],
        ["query reflection", { "x-marker": "<script>alert(1)</script>" }],
      ] as const) {
        test(`${name} x ${kind} x ${mode}`, async () => {
          const res = await send(mode, `${paths[kind]}?echo=%3Cscript%3Ealert(1)%3C%2Fscript%3E`, "GET", headers);
          const body = await res.text();
          assertSafe(body);
          if (mode === "production") expect(body).not.toContain("INTERNAL_PRIVATE_MARKER");
          if (kind === "denied") expect(res.status).toBe(403);
        });
      }
    }
    for (const method of ["GET", "POST", "PUT", "DELETE"]) {
      test(`method override x API ${method} x ${mode}`, async () => {
        const res = await send(mode, "/api/echo", method, { "x-http-method-override": "DELETE" });
        expect((await res.json()).method).toBe(method);
      });
    }
    for (const value of ["<script>alert(1)</script>", `\" onmouseover=\"alert(1)`, "<img src=x onerror=alert(1)>"]) {
      for (const kind of ["dynamic", "catch-all"] as const) {
        test(`reflected XSS ${JSON.stringify(value)} x ${kind} x ${mode}`, async () => {
          const prefix = kind === "dynamic" ? "/dynamic/" : "/catch/";
          const html = await (await send(mode, prefix + encodeURIComponent(value))).text();
          expect(html).not.toContain("<script>alert(1)</script>");
          expect(html).not.toContain('onmouseover="alert(1)');
          expect(html).not.toContain("<img src=x onerror=alert(1)>");
        });
      }
    }
    for (const header of ["", "bytes=0-3", "bytes=-3", "bytes=999999999999999999999-", "bytes=0-1,3-4", "bytes=-0", "bytes=2-1", "bytes=0-99999999999999999999"]) {
      test(`Range ${JSON.stringify(header)} x public x ${mode}`, async () => {
        const res = await send(mode, "/safe.txt", "GET", header ? { range: header } : {});
        expect([200, 206, 416]).toContain(res.status);
        const data = await res.text();
        expect("0123456789".includes(data)).toBe(true);
      });
    }
    test(`If-None-Match strong equivalent x public x ${mode}`, async () => {
      const first = await send(mode, "/safe.txt");
      const weak = first.headers.get("etag")!;
      const strong = weak.replace(/^W\//, "");
      expect((await send(mode, "/safe.txt", "GET", { "if-none-match": strong })).status).toBe(304);
    });
    test(`If-None-Match list and wildcard x public x ${mode}`, async () => {
      const first = await send(mode, "/safe.txt");
      const etag = first.headers.get("etag")!;
      expect((await send(mode, "/safe.txt", "GET", { "if-none-match": `"no-match", ${etag}` })).status).toBe(304);
      expect((await send(mode, "/safe.txt", "GET", { "if-none-match": "*" })).status).toBe(304);
    });
    test(`public dotfile and traversal x public x ${mode}`, async () => {
      for (const pathname of ["/.env", "/%2eenv", "/%252eenv", "/%2e%2e/outside.txt", "/..%5coutside.txt", "/safe.txt%00"]) {
        const response = await send(mode, pathname);
        assertSafe(await response.text());
      }
    });
    test(`SSG query/header poisoning x SSG x ${mode}`, async () => {
      const baseline = await (await send(mode, "/ssg/a")).text();
      for (const [query, headers] of [
        ["?injected=<script>alert(1)</script>", {}],
        ["?cache=poison", { "x-forwarded-host": "evil.example" }],
        ["?cache=poison2", { host: "evil.example", "x-forwarded-proto": "https" }],
      ] as const) {
        const res = await send(mode, `/ssg/a${query}`, "GET", headers);
        expect(await res.text()).toBe(baseline);
      }
    });
    test(`error details x error x ${mode}`, async () => {
      const body = await (await send(mode, "/error")).text();
      if (mode === "production") expect(body).not.toContain("INTERNAL_PRIVATE_MARKER");
      else expect(body).toContain("INTERNAL_PRIVATE_MARKER");
    });
  });
}

for (const origin of ["https://evil.example", "null", "http://app.test:8080", "http://app.test.evil.example"]) {
  test(`bad websocket Origin ${origin} x websocket x production/development`, () => {
    expect(isAllowedWebSocketOrigin(origin, new URL("http://app.test/socket"))).toBe(false);
  });
}
test("explicit allowed websocket origin permits only exact scheme + host + port", () => {
  const requestUrl = new URL("http://app.test/socket");
  expect(isAllowedWebSocketOrigin("https://admin.example", requestUrl, ["https://admin.example"])).toBe(true);
  expect(isAllowedWebSocketOrigin("http://admin.example", requestUrl, ["https://admin.example"])).toBe(false);
});

test("canonical path rejects encoded separators, malformed encoding and control bytes", () => {
  for (const path of ["/locked%2fsecret", "/locked%5csecret", "/bad%00", "/bad%GG", "/%252e%252e/outside", "/bad%c0%af", "/a//b"])
    expect(canonicalPathname(path)).toBeNull();
});

test("downgrade: an http page cannot write to or open a socket on an https server", () => {
  const secure = new URL("https://app.test/api/x");
  expect(isAllowedWebSocketOrigin("http://app.test", secure)).toBe(false);
  expect(isAllowedWebSocketOrigin("https://app.test", secure)).toBe(true);
  expect(isAllowedWebSocketOrigin("https://app.test", new URL("http://app.test/api/x"))).toBe(true);
});
