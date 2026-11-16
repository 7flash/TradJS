---
name: tradjs
description: Use when building or modifying Bun-first web applications with server-rendered JSX, file-based routing, API routes, native navigation, and explicit client interactivity without React or hydration.
---

# TradJS — Agent Coding Skill

TradJS is a Bun-first web framework for server-rendered JSX, file-based routing, API endpoints, static site generation (SSG), and explicit browser interactivity.

**Package:** `tradjs` (npm 4.5.1)

**Runtime:** Bun

**Important version note:** This skill also documents recent router changes on the development branch that are not yet released in npm 4.5.1. These include layout `pathname` props, complete SSG asset injection, middleware before cached SSG responses, and ordered client initialization before first paint. Code using these features requires the updated branch until they are published.

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

`pathname` is supplied to layouts by the updated router branch.

Use it for active-link states rather than assuming layouts persist or subscribe to client-side route changes.

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

- On the updated router, client bootstrap is injected in `<head>` with `blocking="render"`.
- Client initializers execute in layout-then-page order before first paint.
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

SSG prerenders eligible static routes at production startup and caches the HTML in memory.

`revalidate` specifies expiration in seconds. After expiration, the current router falls back to regular SSR rather than automatically repopulating the cache.

On the updated branch:

- Cached SSG responses include the normal client bootstrap scripts and `page.css`.
- Middleware runs before cached SSG responses are served.

SSG is not static HTML export. Avoid caching personalized or user-specific HTML.

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

**Updated router behavior:** Middleware also runs before cached SSG responses. Protect restricted SSG routes with middleware; do not assume prerendering performs request-time authentication.

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

CSS Modules (`*.module.css`) are supported through imports in client bundles only.

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

## 7. Critical Pitfalls

1. **Inline `<style>` content is HTML-escaped.** CSS combinators such as `>` can become escaped text and break selectors. Prefer `page.css` or an external stylesheet instead of putting CSS rules inside JSX `<style>` elements.

2. **Async server rendering is supported.** An `async` page or layout can await data and render async descendants. A synchronous page cannot render an async child component. Async SSR is awaited, not progressively streamed.

3. **Client components remain synchronous.** Do not render async components through browser `render()`.

4. **SSG authentication requires middleware.** On the updated branch, middleware runs before cached SSG responses. Cached HTML must still avoid personalized data.

5. **SSG assets are included on the updated branch.** Prerendered pages receive the normal client scripts and route-scoped `page.css`. Do not retain the old limitation claiming otherwise.

6. **CSS Modules are client-bundle-only.** Use `page.css` for automatically scoped server-page styles.

7. **Client initialization is ordered.** The updated bootstrap runs layout initializers before page initializers, using a render-blocking script in `<head>`. Do not add arbitrary timers to compensate for the old initialization timing.

8. **No mount cleanup contract.** Do not return cleanup functions expecting the framework to invoke them on navigation.

9. **No persistent layouts.** Native document navigation reloads the document, layout, and mount scripts.

10. **API streaming requires a `Response`.** An async generator returned directly from a route handler is not treated as an SSE stream.

11. **Use correct package names.** Import from `tradjs` exports, never `melina/*`.

12. **Use `page.css` for route scoping.** `style.css` is not an automatically scoped page stylesheet.

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
- Route CSS is placed in `page.css`.
- API handlers return valid `Response` objects when streaming.
- Authenticated routes enforce access on the server.
- Branch-only router features are available in the target TradJS installation.

**Default implementation strategy:** Write the page in server JSX, add a client mount script only when interactivity is needed, use native links for navigation, and keep authentication and data access on the server.
