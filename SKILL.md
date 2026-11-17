---
name: tradjs
description: Use when building or modifying Bun-first web applications with server-rendered JSX, file-based routing, API routes, native navigation, and explicit client interactivity without React or hydration.
---

# TradJS — Agent Coding Skill

TradJS is a Bun-first web framework for server-rendered JSX, file-based routing, API endpoints, static site generation (SSG), and explicit browser interactivity.

**Package:** `tradjs` (npm 4.6.0)

**Runtime:** Bun

**Version note:** This skill documents the 4.6.0 behavior. Do not assume older 4.5.x installations have the security protections, API method handling, CSS Modules support, or SSG behavior described here.

## 1. Mental Model

**Render HTML on the server, mount interactivity explicitly, and let the browser handle navigation.**

- **Server pages:** `page.tsx` returns JSX rendered to HTML. Async pages and layouts are supported.
- **Client scripts:** `page.client.tsx` and `layout.client.tsx` export a default mount function. They add behavior to the delivered document.
- **Client rendering:** Import `render()` from `tradjs/client`. Calling it explicitly reconciles JSX against a DOM container.
- **Navigation:** Use ordinary `<a href>` links or `window.location.assign()`. Every navigation loads a new document.
- **View Transitions:** Cross-document View Transitions are enabled by default. Supporting browsers animate native navigation; others navigate normally.
- **No hydration:** Server-rendered JSX is not hydrated into a React-style application.
- **No SPA router:** TradJS does not intercept navigation, preserve mounted layouts between documents, or maintain client state across routes.
- **No React dependency:** JSX uses TradJS's own runtime. React hooks and React-specific patterns are not required.

Client components are synchronous. State and repaint decisions are explicit.

Do not invent framework APIs or assume Next.js, React, or SPA lifecycle semantics.

## 2. Project Setup

Requires Bun.

```bash
mkdir my-app
cd my-app
bun init -y
bun add tradjs
mkdir app
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "tradjs/client",
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["app/**/*"]
}
```

**Critical:** Both JSX settings are required. They select TradJS's JSX runtime instead of React.

Start the application:

```bash
bunx tradjs serve
```

Alternative scaffolding:

```bash
bunx tradjs init my-app
cd my-app
bun run dev
```

The server requires Bun. `tradjs build` compiles assets; it does not generate a standalone deployment server or export a complete static HTML site.

## 3. File Conventions

TradJS discovers routes and supporting files under `app/`.

| File | Purpose |
|---|---|
| `app/page.tsx` | Server-rendered `/` page |
| `app/about/page.tsx` | Server-rendered `/about` page |
| `app/items/[id]/page.tsx` | Dynamic `/items/:id` page; receives `params` |
| `app/layout.tsx` | Root layout containing `{children}` |
| `app/docs/layout.tsx` | Nested layout wrapping descendant pages |
| `app/page.client.tsx` | Browser mount script for the corresponding page |
| `app/layout.client.tsx` | Browser mount script for the corresponding layout |
| `app/about/page.css` | Automatically injected, route-scoped CSS |
| `app/globals.css` | Automatically discovered global CSS |
| `app/middleware.ts` | Middleware applied to matching routes |
| `app/admin/error.tsx` | Server-rendering error boundary |
| `app/api/hello/route.ts` | API handlers for `/api/hello` |

Other supported global stylesheet names are `global.css` and `app.css`.

Route groups `(group)` and catch-all segments `[...name]` are supported.

Nested layouts compose from root to leaf. Layouts are rendered for each document request, not persisted across navigation.

**Only `page.css` is automatically route-scoped.** Do not treat `style.css` as an equivalent convention.

**Route matching uses decoded paths.** Paths are decoded once per segment and trailing slashes are normalized before matching. Encoded slashes, backslashes, control characters, dot segments, malformed encoding, and double encoding are rejected with 404. Do not depend on matching against the original percent-encoded path.

## 4. Correct Package Imports

Use only public package exports.

| Import | Purpose |
|---|---|
| `tradjs` | `start`, `serve`, `createAppRouter`, server APIs |
| `tradjs/web` | Web server APIs, including `cors` |
| `tradjs/server` | `Head`, SSR renderers, SSG and build utilities |
| `tradjs/server/ssr` | Server-side rendering utilities |
| `tradjs/server/build` | Asset-building utilities |
| `tradjs/server/router` | Router utilities |
| `tradjs/server/serve` | Server utilities |
| `tradjs/server/imports` | Server import utilities |
| `tradjs/client` | `render`, `h`, `createElement`, `Fragment`, `memo`, reconciler APIs |
| `tradjs/client/render` | Client rendering utilities |
| `tradjs/client/types` | Client JSX and VNode types |
| `tradjs/client/reconcilers` | Reconciliation utilities |
| `tradjs/client/jsx-runtime` | Automatic JSX runtime |
| `tradjs/client/jsx-dev-runtime` | Development JSX runtime |
| `tradjs/client/jsx-dom` | DOM JSX utilities |

The JSX runtime is selected by `tsconfig.json`; do not normally import it manually.

Typical imports:

```tsx
import { render, memo } from "tradjs/client";
import { Head, renderToStringAsync } from "tradjs/server";
import { createAppRouter } from "tradjs";
```

**Never use:**

- `melina`, `melina/web`, `melina/client`, or other `melina/*` imports.
- `navigate` or `Link` from `tradjs/client`; these exports do not exist.
- Undocumented deep imports that are absent from `package.json` exports.
- React hooks or React hydration APIs as substitutes for TradJS's client rendering.

Keep server-only modules out of browser mount scripts.

## 5. Six Correct Examples

### Example 1 — Server Page + API Route

`app/page.tsx`:

```tsx
export default async function HomePage() {
  const message = await Promise.resolve("Hello from TradJS");

  return (
    <main>
      <h1>{message}</h1>
      <div id="counter-root" />
      <a href="/api/hello">Open the JSON API</a>
    </main>
  );
}
```

`app/api/hello/route.ts`:

```ts
export function GET(_req: Request) {
  return Response.json({
    message: "Hello from the API",
    ok: true,
  });
}

export async function POST(req: Request) {
  const data = await req.json();
  return Response.json({ received: data });
}
```

Pages may be async. TradJS awaits server rendering before constructing the response; it does not progressively stream async component output.

When a page tree includes an async component, declare the page `async`. Async layouts similarly enable async rendering within their layout tree.

API routes export named HTTP method handlers. A default export can act as a fallback. Dynamic API routes receive `params` in the second handler argument.

Return `Response.json()` for JSON, and a `Response` containing a `ReadableStream` for streaming.

API method handling also provides these behaviors:

- `HEAD` is handled using `GET` when no explicit `HEAD` handler is exported. The response has no body.
- `OPTIONS` returns `204` with an `Allow` header when no explicit `OPTIONS` handler is exported.
- An unsupported method returns `405` with an `Allow` header.

Export your own `HEAD` or `OPTIONS` handler when the route needs custom behavior.

**Never return an async generator directly from an API route.** The app router JSON-serializes non-`Response` return values.

### Example 2 — Layout with Current Navigation Link

`app/layout.tsx`:

```tsx
export default function Layout({
  children,
  pathname,
}: {
  children: any;
  pathname: string;
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1"
        />
        <title>My TradJS App</title>
      </head>
      <body>
        <nav>
          <a
            href="/"
            aria-current={pathname === "/" ? "page" : undefined}
          >
            Home
          </a>
          <a
            href="/about"
            aria-current={pathname === "/about" ? "page" : undefined}
          >
            About
          </a>
        </nav>
        {children}
      </body>
    </html>
  );
}
```

Layouts receive a `pathname` property from the router.

Use it for active-link states rather than assuming layouts persist or subscribe to client-side route changes.

During SSG prerendering, `pathname` contains the route pattern, not a concrete parameterized pathname.

The root layout must render `{children}` and should provide a normal HTML document containing `<head>` and `<body>`.

### Example 3 — Client Mount Script

`app/page.client.tsx`:

```tsx
import { render } from "tradjs/client";

export default function mount() {
  const root = document.getElementById("counter-root");
  if (!root) return;

  let count = 0;

  function paint() {
    render(
      <button
        onClick={() => {
          count++;
          paint();
        }}
      >
        Count: {count}
      </button>,
      root,
    );
  }

  paint();
}
```

The matching server page provides `<div id="counter-root" />`.

The framework discovers and executes the default-exported mount function.

`render()` reconciles successive VNodes with the existing DOM. State updates require explicit repaint calls.

A `layout.client.tsx` follows the same pattern, but belongs to its layout.

**Mount lifecycle:**

- Client bootstrap is injected in `<head>` with `blocking="render"`.
- Client initializers execute in layout-then-page order, awaiting each in order before first paint.
- A failed initializer prevents dependent initializers from running.
- Each document navigation starts a new lifecycle.
- Layout client scripts do not survive navigation.
- Returned cleanup functions are not invoked by the router.

For cleanup within a document, manage event listeners and resources explicitly. Use appropriate browser lifecycle events when necessary.

Do not rely on a returned `() => cleanup()` function.

### Example 4 — Static Site Generation

`app/pricing/page.tsx`:

```tsx
export const ssg = { revalidate: 60 };

export default function PricingPage() {
  return (
    <main>
      <h1>Pricing</h1>
      <p>Public pricing information.</p>
    </main>
  );
}
```

Use `export const ssg = true` for an entry without a configured expiration.

SSG prerenders eligible static routes and caches the HTML.

For a route with params (`app/blog/[slug]/page.tsx`), also export `ssgParams()` returning the param sets to prerender, e.g. `[{ slug: "hello" }]`. Listed paths are cached; other paths render dynamically.

`revalidate` specifies the cache lifetime in seconds. After expiration, the page is regenerated automatically on a subsequent request. Concurrent requests that need the same regeneration share a single regeneration operation.

Public SSG responses use a cache `max-age` matching the `revalidate` setting, defaulting to 3600 seconds.

- SSG responses include the normal client bundles, initialization scripts, import maps, and route-scoped stylesheets.
- Middleware runs before cached SSG responses are served.
- Middleware-protected SSG responses use `Cache-Control: no-store` and are not stored as public cached responses.

SSG is not static HTML export. Avoid putting personalized or user-specific HTML in public SSG pages.

### Example 5 — Middleware Authentication

`app/api/private/middleware.ts`:

```ts
export default function middleware(req: Request) {
  const expected = Bun.env.PRIVATE_API_TOKEN;

  if (
    !expected ||
    req.headers.get("authorization") !== `Bearer ${expected}`
  ) {
    return new Response("Unauthorized", { status: 401 });
  }
}
```

This example protects an API route segment using a server-configured bearer token. For browser pages, use validated session cookies or equivalent server-side session authentication.

Middleware runs root-to-leaf before route processing.

Return a `Response` to stop processing. Return nothing to continue.

**Middleware runs before cached SSG responses.** Protect restricted SSG routes with middleware; do not assume prerendering performs request-time authentication.

Middleware-protected SSG responses are not stored and use `Cache-Control: no-store`.

Dynamic SSR pages also use `Cache-Control: no-store`. Do not assume dynamic HTML can be stored in a shared cache.

Authorization must not rely solely on client scripts.

### Example 6 — Automatically Scoped CSS

`app/about/page.tsx`:

```tsx
export default function AboutPage() {
  return (
    <main>
      <article className="card">
        <h1>About</h1>
      </article>
    </main>
  );
}
```

`app/about/page.css`:

```css
.card {
  padding: 1rem;
  border: 1px solid #ddd;
  border-radius: 12px;
}

.card > h1 {
  margin: 0;
}
```

TradJS discovers `page.css`, processes it, scopes its selectors using the route's `body[data-page]` attribute, and includes it automatically.

Do not manually import or link `page.css`.

Use `globals.css`, `global.css`, or `app.css` for application-wide styles.

CSS Modules (`*.module.css`) work through imports in server-rendered pages, layouts, and components, as well as client bundles. They produce the same class names in server and client output, and the page links the stylesheets it uses.

## 6. Navigation Rules

Use native browser navigation:

```tsx
<a href="/about">About</a>
```

Or:

```ts
window.location.assign("/about");
window.location.replace("/about");
```

Do not use `navigate()`, `<Link>`, an imaginary navigation hook, or SPA router conventions.

TradJS enables cross-document View Transitions by default. Supporting browsers animate native document navigation.

To disable the feature:

```ts
import { createAppRouter } from "tradjs";

const router = createAppRouter({
  viewTransitions: false,
});
```

In-memory client state resets across document navigations. Persist necessary state using URLs, browser storage, cookies, or server sessions.

**Route matching uses the decoded path.** TradJS decodes each path segment once and normalizes trailing slashes before matching. Encoded slashes, backslashes, control characters, dot segments, malformed encoding, and double encoding return 404. Do not build authorization assumptions around encoded-path distinctions.

### Answering 404 from a page

```tsx
import { notFound } from "tradjs/server";

export default async function Item({ params }: { params: { id: string } }) {
  const item = await loadItem(params.id);
  if (!item) notFound(); // 404 with the nearest not-found.tsx, never error.tsx
  return <h1>{item.name}</h1>;
}
```

## 7. Critical Pitfalls

1. **SSR validates HTML attributes and tag names.** Unsafe attribute names and values are not passed through unchecked. Event-handler attributes are removed regardless of case. `srcdoc` is rejected. Unsafe URL schemes are dropped from URL-bearing attributes. Title, viewport, and metadata values are escaped.

2. **The client renderer applies the same attribute and URL protections.** Do not expect a client render to preserve an unsafe URL or `srcdoc` attribute that server rendering would reject.

3. **Unsafe CSS `style` values are dropped.** The server and client both check style values. If a style contains `url(javascript:...)`, `url(vbscript:...)`, or a non-image `data:` URL, the entire `style` attribute is dropped. CSS-escaped spellings of these unsafe URLs are also detected. Raster `data:image/*` backgrounds remain allowed.

4. **Allowed image data URLs are limited.** Raster `data:image/*` URLs remain permitted in `src`, `srcset`, and `poster`. Do not rely on `javascript:`, `vbscript:`, or other `data:` URLs in URL-bearing attributes. Replace blocked values with safe resources.

5. **`<Head>` uses the same security rules.** It rejects `srcdoc` and executable URLs in addition to the SSR attribute protections. Each page, layout, and SSG render has its own isolated `<Head>` collection; concurrent requests do not share head elements. `renderPage()` collects the `<Head>` elements for its own render.

6. **Dynamic HTML is not publicly cacheable.** Dynamic SSR responses use `Cache-Control: no-store`. Middleware-protected SSG responses also use `no-store` and are not stored. Public SSG responses use `max-age` matching their `revalidate` setting, defaulting to 3600 seconds.

7. **Detailed error pages are local-only.** The framework's detailed error page, including message, stack, and details, is shown only to requests from the same machine. This restriction applies even when `NODE_ENV` is not `production`. Do not assume that leaving `NODE_ENV` unset exposes detailed errors remotely.

8. **Production `error.tsx` does not receive raw error messages.** In production, the error boundary receives a generic message and an `error.digest` matching the corresponding server log line. Use the digest to correlate a user-visible error with server logs. Do not expect the original exception message, SQL, file paths, or other internals to be available through the production error prop.

9. **Routes match decoded, normalized paths.** The router decodes each segment once and normalizes trailing slashes before matching. Encoded slashes, backslashes, control characters, dot segments, malformed encoding, and double encoding return 404. Do not depend on the old behavior of matching the encoded URL.

10. **Raw `<style>` and `<script>` text is preserved.** Text inside these elements is not HTML-escaped, so CSS selectors and JavaScript retain their intended content. Embedded closing tags are neutralized to prevent premature element termination. Do not assume ordinary HTML text escaping is applied inside these elements.

11. **Async server rendering is supported.** An `async` page or layout can await data and render async descendants. A synchronous page cannot render an async child component. Async SSR is awaited, not progressively streamed.

12. **Client components remain synchronous.** Do not render async components through browser `render()`.

13. **SSG assets are included.** Prerendered pages receive the normal client bundles, initialization scripts, import maps, and route-scoped stylesheets. Interactive components work on SSG pages.

14. **SSG regenerates after expiration.** Expired pages are automatically regenerated on subsequent requests. Concurrent cache misses share one regeneration. Do not retain the old assumption that expiration permanently falls back to dynamic rendering without repopulating the cache.

15. **CSS Modules work on server and client.** `import styles from "./x.module.css"` gives the same class names in server-rendered components and client bundles, and the page links the stylesheets it uses. `page.css` remains the simplest way to scope a whole page.

16. **Client initialization is ordered.** The bootstrap runs layout initializers before the page initializer, awaiting each in order. Bootstrap scripts run from `<head>` with `blocking="render"`, so first paint waits for initialization. A failed initializer prevents dependent initializers from running. Keep initialization work short and ensure initializer promises resolve or reject rather than hanging.

17. **No mount cleanup contract.** Do not return cleanup functions expecting the framework to invoke them on navigation.

18. **No persistent layouts.** Native document navigation reloads the document, layout, and mount scripts.

19. **API streaming requires a `Response`.** An async generator returned directly from a route handler is not treated as an SSE stream.

20. **API method handling is automatic unless overridden.** `HEAD` uses `GET` without a body; `OPTIONS` returns `204` with `Allow` unless the route exports its own `OPTIONS`; unsupported methods return `405` with `Allow`.

21. **Use correct package names.** Import from `tradjs` exports, never `melina/*`.

22. **Use `page.css` for route scoping.** `style.css` is not an automatically scoped page stylesheet.

23. **CLI filesystem paths are restricted.** Builds do not read an automatically discovered `globals.css` through a symlink pointing outside the app, or write through an output directory that is itself a symlink or sits under one. Do not depend on those symlink paths for build inputs or outputs.

## 8. Agent Checklist

Before producing TradJS code, verify:

- JSX configuration selects `tradjs/client`.
- Files follow the `app/` routing conventions.
- Imports use actual public package exports.
- Server code and browser mount code remain separate.
- Async components are used only within appropriately async server trees.
- Client interactivity uses a default-exported mount function and explicit `render()`.
- Links use native browser navigation.
- Client state is not assumed to persist across routes.
- Route matching assumptions use decoded, normalized paths.
- Route CSS is placed in `page.css`.
- CSS Module imports work in the server and client contexts where they are used.
- Dynamic SSR pages and middleware-protected SSG pages are not publicly cached.
- Public SSG cache lifetimes match the intended `revalidate` setting.
- API handlers return valid `Response` objects when streaming.
- API routes account for automatic `HEAD`, `OPTIONS`, and `405` behavior.
- Authenticated routes enforce access on the server.
- Attribute, URL, and style values do not rely on unsafe markup being preserved.
- Error boundaries do not expose raw production error messages.
- Client initialization order and render-blocking behavior are accounted for.

**Default implementation strategy:** Write the page in server JSX, add a client mount script only when interactivity is needed, use native links for navigation, and keep authentication and data access on the server. Rely on the framework's current security protections, but do not use them as a substitute for correct server-side authorization or safe application design.
