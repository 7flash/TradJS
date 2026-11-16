# TradJS

TradJS is a Bun-first web framework for server-rendered JSX pages, file-based routing, API routes, and explicit client interactivity; choose it over Next.js or Astro when you want to build a full-stack application without requiring React, hydration, or a JavaScript client-side router.

**The model:** Render HTML on the server, mount interactive components only where needed, and let the browser handle navigation.

- Runtime: Bun
- Language: TypeScript, TSX, JavaScript, JSX
- UI: Built-in JSX renderer, no React dependency required
- Routing: Files in `app/`
- Navigation: Native document navigation with optional cross-document View Transitions
- Client state: Explicit state updates and `render()` calls

TradJS is not a React framework, a single-page application router, or a Node.js server framework. Its full-stack runtime currently requires Bun.

## What's new in 4.6

- **Path-aware layouts:** Layouts receive `pathname`, allowing navigation links to identify the current page.
- **Interactive SSG:** Prerendered pages include layout and page client scripts, the client bootstrap, the React import map, and route-scoped `page.css`. Middleware runs before cached SSG responses, so authentication checks remain effective. Responses behind middleware are sent with `Cache-Control: no-store`. Expired entries are refilled automatically, with `Cache-Control` max-age matching `revalidate`.
- **Client initialization before first paint:** The bootstrap runs from `<head>` with `blocking="render"`. Layout initializers run first, followed by the page initializer, each awaited in order before the browser's first paint.
- **Improved View Transitions:** The router uses the shared document helper, including a `link rel="expect"` readiness marker and reduced-motion handling. Skipped transitions (`AbortError` and `TimeoutError`) no longer trigger the client error overlay.
- **Security:** server-rendered pages are sent with `Cache-Control: no-store`, so shared caches never reuse one user's page for another; only public prerendered pages are cacheable. Server rendering drops event props in any case, invalid attribute or tag names, `srcdoc`, and `javascript:`/`vbscript:`/`data:` URLs (raster `data:image/*` stays allowed in `src`, `srcset` and `poster`). `<Head>` collects per request. `renderPage()` escapes `title`, `viewport` and `meta`.
- **Raw `<style>` and `<script>` text:** their text children are no longer HTML-escaped, so `.card > h2` works in an inline `<style>`; a literal closing tag inside the text is neutralised.
- **Route compatibility and mobile fixes:** `.js` and `.jsx` page routes correctly pair with `.client.tsx` entries, and the built-in 404 page includes a mobile viewport meta tag.

## Quick start

Requires [Bun](https://bun.sh).

### 1. Create a project

```bash
mkdir my-app
cd my-app
bun init -y
bun add tradjs
mkdir -p app/api/hello
```

Create the following files:

```text
my-app/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── page.client.tsx
│   └── api/
│       └── hello/
│           └── route.ts
├── tsconfig.json
└── package.json
```

### 2. Configure JSX

Create or replace `tsconfig.json`:

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

The two JSX settings are essential. They direct the automatic JSX transform to TradJS's own JSX runtime instead of React.

### 3. Create a root layout

`app/layout.tsx`

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
        <nav aria-label="Main navigation">
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

The layout supplies the HTML document around each page.

Layouts receive `pathname`, allowing them to mark the active navigation link using `aria-current="page"` or apply route-specific styles. During normal requests, `pathname` is the request path. During SSG prerendering, it is the route pattern.

TradJS automatically injects the client bootstrap into `<head>` with `blocking="render"`. When client entry points exist, the bootstrap awaits layout initializers in order, then the page initializer, before the browser's first paint.

### 4. Create a server-rendered page

`app/page.tsx`

```tsx
export default function HomePage() {
  return (
    <main>
      <h1>Hello from TradJS</h1>
      <p>This HTML was rendered on the server.</p>

      <div id="counter-root" />

      <p>
        <a href="/api/hello">Try the JSON API</a>
      </p>
    </main>
  );
}
```

A `page.tsx` is a server page. It returns JSX that TradJS renders into HTML.

There is no automatic hydration. The empty `counter-root` container is where the client component will mount.

### 5. Add client interactivity

`app/page.client.tsx`

```tsx
import { render } from "tradjs/client";

export default function mount() {
  const root = document.getElementById("counter-root");
  if (!root) return;

  let count = 0;

  function Counter() {
    return (
      <button
        onClick={() => {
          count++;
          paint();
        }}
      >
        Count: {count}
      </button>
    );
  }

  function paint() {
    render(<Counter />, root);
  }

  paint();
}
```

TradJS discovers `page.client.tsx`, bundles it for the browser, and invokes its default-exported mount function through the generated client bootstrap.

The bootstrap is injected into `<head>` with `blocking="render"`. Layout client initializers run first, followed by the page initializer. Each initializer is awaited before the next begins, and a failing initializer prevents dependent initializers from running. This completes before the browser's first paint, avoiding an initial display of uninitialized interactive content.

Calling `render()` again reconciles the new JSX against the existing DOM. State management and repaint decisions are explicit; there are no required React hooks or signals.

Client entry points also work with SSG pages. Prerendered HTML includes the required client bundles and bootstrap.

### 6. Add an API route

`app/api/hello/route.ts`

```ts
export function GET(_req: Request) {
  return Response.json({
    message: "Hello from the TradJS API",
    ok: true,
  });
}
```

The route is available at `/api/hello`. API handlers use the standard Web `Request` and `Response` APIs.

### 7. Run it

```bash
bunx tradjs serve
```

Open [http://localhost:3000](http://localhost:3000) when port 3000 is available. If the default port is occupied, TradJS can select another available port.

You now have server-rendered HTML, an interactive counter, and a JSON endpoint without React or a client-side router.

Alternatively, scaffold a project with:

```bash
bunx tradjs init my-app
cd my-app
bun run dev
```

The initializer creates the project files and installs dependencies.

## Features

### 1. File-based routing

Files under `app/` become routes:

```text
app/page.tsx                 → /
app/about/page.tsx           → /about
app/items/[id]/page.tsx      → /items/:id
app/api/hello/route.ts       → /api/hello
```

Dynamic route parameters are supplied as props:

```tsx
// app/items/[id]/page.tsx
export default function Item({
  params,
}: {
  params: { id: string };
}) {
  return <h1>Item: {params.id}</h1>;
}
```

Visiting `/items/42` renders `Item: 42`.

Route groups using `(group)` and catch-all segments using `[...name]` are also supported.

Pages can use `.ts`, `.tsx`, `.js`, or `.jsx` extensions. JavaScript and JSX routes can also have TypeScript client companions:

```text
app/about/page.jsx           → /about
app/about/page.client.tsx    → client initializer for /about

app/contact/page.js          → /contact
app/contact/page.client.tsx  → client initializer for /contact
```

TradJS derives the `.client.tsx` path correctly for `.js` and `.jsx` server routes, just as it does for TypeScript routes. The server page itself is not mistakenly bundled as the client entry.

The built-in 404 document includes a viewport meta tag for proper rendering on mobile devices.

### 2. Nested layouts

Place `layout.tsx` in a route directory to wrap that directory's pages and descendants:

```tsx
// app/docs/layout.tsx
export default function DocsLayout({
  children,
  pathname,
}: {
  children: any;
  pathname: string;
}) {
  const inDocs = pathname === "/docs" ||
    pathname.startsWith("/docs/");

  return (
    <section>
      <nav aria-label="Documentation navigation">
        <a
          href="/docs"
          aria-current={pathname === "/docs" ? "page" : undefined}
        >
          Documentation
        </a>
        <a
          href="/docs/getting-started"
          aria-current={
            pathname === "/docs/getting-started"
              ? "page"
              : undefined
          }
        >
          Getting started
        </a>
      </nav>

      <div data-docs-section={inDocs ? "active" : undefined}>
        {children}
      </div>
    </section>
  );
}
```

Layouts compose from the application root toward the matched route. Each receives `pathname` and can use it to identify the current page or section.

Layouts are rendered as part of each document response; they do not persist as mounted browser components across navigation.

### 3. Server-side rendering

Pages render on the server by default:

```tsx
// app/time/page.tsx
export default function Page() {
  return <time>{new Date().toISOString()}</time>;
}
```

Async server components are supported when the relevant page or layout is declared `async`:

```tsx
export default async function Page() {
  const message = await Promise.resolve("Loaded");
  return <h1>{message}</h1>;
}
```

A synchronous page cannot render an async child component. Declare the page `async` to enable async rendering in its page tree. An async layout enables async rendering in that layout's tree.

Server SSR awaits the completed output before constructing the response. Async server-component rendering is not progressively streamed.

Client-rendered components must remain synchronous.

### 4. Native navigation and View Transitions

Navigation uses normal browser links:

```tsx
<a href="/about">About</a>
```

Programmatic navigation uses standard browser APIs:

```ts
window.location.assign("/about");
window.location.replace("/about");
```

TradJS does not intercept links or maintain a JavaScript client-side router.

Cross-document View Transitions are enabled by default through an injected CSS opt-in:

```css
@view-transition {
  navigation: auto;
}
```

You can assign matching transition names to elements in different documents:

```css
.hero-title {
  view-transition-name: hero-title;
}
```

Supporting browsers animate transitions during normal document navigation. Other browsers navigate normally.

The router uses the shared document View Transition helper. It provides stable-root transition styling, reduced-motion handling, and a `link rel="expect"` readiness marker so the transition does not capture a destination document before it is ready.

The readiness mechanism works alongside the render-blocking client bootstrap, allowing client initialization to complete before the new document is first painted.

Browsers may skip a cross-document transition, particularly during mobile back/forward navigation. Rejections caused by `AbortError` or `TimeoutError` are treated as expected transition skips and do not display the client error overlay. Unrelated errors, including duplicate `view-transition-name` failures, are still reported.

Disable the opt-in with:

```ts
import { createAppRouter } from "tradjs";

const router = createAppRouter({
  viewTransitions: false,
});
```

**Important:** Each navigation loads a new document. In-memory client state does not automatically survive. Use browser storage, URL parameters, cookies, or server-side sessions when persistence is needed.

TradJS does not export a `navigate()` helper or `Link` component, and does not invoke cleanup functions returned by client mount scripts during navigation.

### 5. API routes

Export HTTP method handlers from `route.ts`:

```ts
// app/api/messages/route.ts

export function GET() {
  return Response.json([{ text: "Hello" }]);
}

export async function POST(req: Request) {
  const body = await req.json();
  return Response.json({ received: body });
}
```

TradJS selects a named handler matching the incoming HTTP method, with a default export as a fallback.

Route handlers can also receive dynamic parameters as their second argument:

```ts
export function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  return Response.json({ id: params.id });
}
```

To stream an API response, return a `Response` containing a `ReadableStream`.

### 6. Scoped CSS

Put `page.css` next to a page:

```text
app/about/
├── page.tsx
└── page.css
```

```css
/* app/about/page.css */
.card {
  padding: 1rem;
  border-radius: 12px;
}
```

TradJS processes this stylesheet, scopes its selectors using the route's `body[data-page]` attribute, and includes it automatically.

Route-scoped `page.css` is included for both dynamically rendered and SSG pages. Prerendered HTML receives the same route-scoped stylesheet handling as ordinary SSR output.

For application-wide styles, create `app/globals.css`, `app/global.css`, or `app/app.css`. TradJS discovers and processes the first matching global stylesheet.

Client bundles also support CSS Modules through `.module.css` imports. CSS Modules are supported in client bundles, not as automatic server-side component CSS Modules.

### 7. Static site generation (SSG)

Opt a page into production startup prerendering:

```tsx
// app/pricing/page.tsx

export const ssg = true;

export default function PricingPage() {
  return <h1>Pricing</h1>;
}
```

In production mode, TradJS prerenders eligible pages into an in-memory HTML cache. Static routes without dynamic parameters are eligible.

SSG pages receive the same client assets as dynamically rendered pages, including:

- Layout client bundles and page client bundles.
- The render-blocking client bootstrap that awaits layout and page initializers.
- The React import map used by client assets when needed.
- The route-scoped `page.css` stylesheet.

A prerendered page can therefore include interactive components through `page.client.tsx`, rather than being restricted to server-only HTML.

An optional cache expiration can be configured:

```ts
export const ssg = { revalidate: 60 };
```

The value is in seconds. For a page configured with `revalidate: 60`, the SSG cache lifetime and response `Cache-Control` max-age are 60 seconds. Without an explicit `revalidate`, the default max-age is 3600 seconds.

When the cached entry expires, the next request causes TradJS to render the page again and refill the cache. Subsequent requests use the refreshed entry. Concurrent cache misses share a single render rather than triggering redundant renders.

Startup prerendering and cache refills use the same HTML rendering path, so the refreshed page retains its client assets and scoped styles.

Middleware executes before the SSG cache lookup, including when a prerendered response is already cached. Authentication and authorization checks in middleware therefore continue to protect SSG routes.

When an SSG page is behind middleware, its responses are sent with `Cache-Control: no-store`, so neither shared caches nor the browser reuse them after authorization changes. Dynamic (non-SSG) pages are always `no-store`.

The SSG cache is still an in-memory production-server feature. It does not export a directory of static HTML files for deployment to a static-only host.

### 8. Middleware

Place `middleware.ts` in a route directory:

```ts
// app/admin/middleware.ts

export default function middleware(req: Request) {
  const url = new URL(req.url);

  if (!url.searchParams.has("preview")) {
    return new Response("Forbidden", {
      status: 403,
    });
  }
}
```

Middleware executes from the application root toward the matched route, before route handling and before serving a cached SSG page.

Return a `Response` to stop processing. Return nothing to continue.

Middleware also protects prerendered routes. For example, if authentication middleware rejects an unauthenticated request with HTTP 401, TradJS returns that response instead of serving the cached SSG document.

Middleware runs on every applicable request, including SSG cache hits and requests that trigger cache refills. SSG responses behind middleware are sent with `Cache-Control: no-store`; the server-side SSG cache still follows the page's `revalidate` configuration.

This allows SSG routes to be protected by middleware without bypassing authorization checks or exposing their responses to shared public caches.

TradJS also exports `cors()` from `tradjs/web` for handler-level cross-origin request handling.

### 9. Error boundaries

Create `error.tsx` alongside a route or in a parent directory:

```tsx
// app/admin/error.tsx

export default function ErrorPage({
  error,
  pathname,
}: {
  error: { message?: string; stack?: string };
  pathname: string;
}) {
  return (
    <main>
      <h1>Something went wrong</h1>
      <p>{error.message}</p>
      <a href={pathname}>Try again</a>
    </main>
  );
}
```

TradJS searches for the nearest error boundary and uses it for server-side page failures, including rendering and client-bundle build errors.

Error responses return HTTP 500. Without a custom boundary, TradJS serves a built-in error page.

Browser-side failures after the client bundle loads are handled separately by an in-page error overlay.

Expected View Transition skips, including `AbortError` and `TimeoutError`, are ignored by the overlay. Actual transition errors, such as duplicate transition names, and unrelated client errors are still reported.

The built-in 404 document also declares a mobile viewport meta tag so not-found pages render with the appropriate viewport on mobile devices.

## CLI

```bash
# Start the application
bunx tradjs serve

# Explicit port
bunx tradjs serve 3000

# Custom app directory
bunx tradjs serve --appdir ./app

# Unix socket
bunx tradjs serve --unix /tmp/tradjs.sock

# Build client scripts and stylesheets
bunx tradjs build

# Custom build output
bunx tradjs build --outdir ./out

# Build specific entries
bunx tradjs build --entry src/main.ts
```

`tradjs build` writes compiled JavaScript and CSS assets to disk. It does not generate a complete set of static HTML pages or a standalone deployment server.

The normal server runtime uses Bun.

## Public imports

| Import | Purpose |
|---|---|
| `tradjs` | `start`, `serve`, `createAppRouter`, `Head`, build utilities |
| `tradjs/web` | Server APIs and `cors` |
| `tradjs/server` | SSR renderers, SSG cache, build and routing utilities |
| `tradjs/client` | `render`, `h`, `createElement`, `Fragment`, `memo`, reconciler APIs |
| `tradjs/client/jsx-runtime` | Automatic JSX runtime |

For browser interactions, import from `tradjs/client`:

```tsx
import { render, memo } from "tradjs/client";
```

For server rendering utilities:

```ts
import {
  renderToString,
  renderToStringAsync,
} from "tradjs/server";
```

### Component updates

TradJS re-executes ordinary function components on each explicit repaint and reconciles the resulting VNodes.

Use `memo()` to opt into props-based memoization:

```tsx
import { memo } from "tradjs/client";

const Card = memo(function Card({
  title,
}: {
  title: string;
}) {
  return <article>{title}</article>;
});
```

Application code controls when to call `render()` and which DOM container to repaint. There is no automatic state-driven rendering system.

## When to choose TradJS

TradJS is suited to Bun applications that need server-rendered pages, colocated API endpoints, simple file-based routing, and selective browser interactivity without adopting React or SPA navigation.

SSG pages can also use client interactivity, scoped CSS, and middleware-based authorization. The production server automatically refreshes expired SSG cache entries while preserving the normal client initialization behavior.

Consider a different framework if you need automatic client hydration, persistent in-memory application state across routes, a JavaScript SPA router, progressively streamed async server components, a full static HTML export pipeline, or Node.js as the server runtime.

## License

MIT
