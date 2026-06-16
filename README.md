# TradJS 🦊

**Bun-native web framework with file-system routing, SSR, client mounts, API routes, scoped CSS, SSG, middleware, and a tiny JSX renderer.**

TradJS is a small full-stack framework for Bun. It gives you an app-router style file structure, server-rendered pages, client-side interactivity, API route handlers, page-level CSS, static pre-rendering, and a lightweight VDOM renderer for browser mounts.

```bash
npx tradjs init my-app
cd my-app
bun run dev
```

Open:

```txt
http://localhost:3000
```

## Why TradJS?

TradJS is built around a few simple ideas:

* file-system routing from `app/`
* server-rendered pages by default
* client interactivity only where you add `page.client.tsx`
* API handlers with `GET`, `POST`, etc.
* plain JSX, no React runtime required
* page CSS that can be scoped automatically
* explicit client rendering with `render(<App />, root)`
* predictable reconciliation: components re-run by default; `memo()` is opt-in
* Bun-first CLI, dev server, and build pipeline

## Installation

Create a new project:

```bash
npx tradjs init my-app
cd my-app
bun run dev
```

Or install into an existing Bun project:

```bash
bun add tradjs
```

## CLI

```bash
npx tradjs init <project-name>
npx tradjs init .
npx tradjs serve
npx tradjs build
```

### `tradjs init`

Create a new TradJS project:

```bash
npx tradjs init my-app
```

Create in the current directory:

```bash
npx tradjs init .
```

### `tradjs serve`

Run the dev server:

```bash
npx tradjs serve
```

With an explicit port:

```bash
npx tradjs serve 3000
```

With a custom app directory:

```bash
npx tradjs serve --appdir ./app
```

With a Unix socket:

```bash
npx tradjs serve --unix /tmp/tradjs.sock
```

### `tradjs build`

Build routes and assets to disk:

```bash
npx tradjs build
```

Custom output directory:

```bash
npx tradjs build --outdir ./out
```

Custom app directory:

```bash
npx tradjs build --appdir ./app
```

Build specific entry points:

```bash
npx tradjs build --entry src/a.ts --entry src/b.tsx --outdir ./dist
```

Global CSS entry:

```bash
npx tradjs build --css app/globals.css
```

## Project Structure

A typical app:

```txt
app/
  layout.tsx
  page.tsx
  page.client.tsx
  globals.css

  about/
    page.tsx

  counter/
    page.tsx
    page.client.tsx

  api/
    data/
      route.ts

  features/
    ssg/
      page.tsx
      page.client.tsx

    middleware/
      middleware.ts
      page.tsx

    error-crash/
      page.tsx
      error.tsx
```

## Pages

A page is a server component exported from `page.tsx`.

```tsx
// app/page.tsx

export default function HomePage() {
  return (
    <div>
      <h1>Hello TradJS</h1>
      <p>This page is server-rendered.</p>
      <div id="app-root" />
    </div>
  );
}
```

The route is inferred from the file path:

| File                     | Route       |
| ------------------------ | ----------- |
| `app/page.tsx`           | `/`         |
| `app/about/page.tsx`     | `/about`    |
| `app/blog/[id]/page.tsx` | `/blog/:id` |
| `app/api/data/route.ts`  | `/api/data` |

## Layouts

`layout.tsx` wraps child pages.

```tsx
// app/layout.tsx

export default function RootLayout({ children }: { children: any }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>My TradJS App</title>
      </head>
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
```

Nested folders can define their own layouts.

## Client Interactivity

Add a `page.client.tsx` next to a page to mount browser-side behavior.

```tsx
// app/counter/page.tsx

export default function CounterPage() {
  return (
    <div>
      <h1>Counter</h1>
      <div id="counter-root" />
    </div>
  );
}
```

```tsx
// app/counter/page.client.tsx

import { render } from 'tradjs/client';

let count = 0;

function Counter() {
  return (
    <div>
      <strong>{count}</strong>

      <button
        onClick={() => {
          count++;
          update();
        }}
      >
        +1
      </button>
    </div>
  );
}

function update() {
  const root = document.getElementById('counter-root');
  if (!root) return;

  render(<Counter />, root);
}

export default function mount() {
  update();

  return () => {
    const root = document.getElementById('counter-root');
    if (root) render(null, root);
  };
}
```

The default export is the mount function. If it returns a function, that function runs as cleanup when the page unmounts or navigates away.

## JSX Runtime

Set your TypeScript config to use TradJS JSX:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "tradjs/client",
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true
  }
}
```

You can use React-style event handlers:

```tsx
<button onClick={() => console.log('clicked')}>
  Click me
</button>

<input onInput={(event) => console.log(event.currentTarget.value)} />
<form onSubmit={(event) => event.preventDefault()} />
```

Server rendering skips event props, so `onClick`, `onInput`, and other handlers do not appear as HTML attributes.

## Client Renderer

Import from `tradjs/client`:

```tsx
import { render, h, memo, Link } from 'tradjs/client';
```

Render into a DOM node:

```tsx
render(<App />, document.getElementById('root')!);
```

Clear a root:

```tsx
render(null, root);
```

Use `h()` if you prefer function calls:

```tsx
render(h('button', { onClick: () => alert('hi') }, 'Click'), root);
```

## Re-rendering and `memo()`

TradJS function components re-run by default whenever you call `render()`.

That means this works correctly:

```tsx
import { render } from 'tradjs/client';

let mode = 'close';

function App() {
  return mode === 'close'
    ? <button data-click="panel-close">Close panel</button>
    : <button data-tab="buildings">Buildings tab</button>;
}

const root = document.getElementById('root')!;

render(<App />, root);

mode = 'tab';
render(<App />, root);
```

TradJS re-executes `App`, produces the next vnode tree, then reconciles it against the previous tree. The DOM is reused where possible and patched where needed.

Use `memo()` only when you explicitly want a props-based bailout:

```tsx
import { memo } from 'tradjs/client';

const ExpensiveCard = memo(function ExpensiveCard({ title }: { title: string }) {
  return <article>{title}</article>;
});
```

By default, components may read global state, module state, browser state, time, or mutable objects. TradJS therefore does not assume unchanged props mean unchanged output unless you opt in with `memo()`.

## Links and Navigation

Use regular anchors for normal navigation:

```tsx
<a href="/about">About</a>
```

Or use `Link` from `tradjs/client` for client-side navigation:

```tsx
import { Link } from 'tradjs/client';

export default function Nav() {
  return (
    <nav>
      <Link href="/">Home</Link>
      <Link href="/counter">Counter</Link>
    </nav>
  );
}
```

Programmatic navigation:

```tsx
import { navigate } from 'tradjs/client';

navigate('/counter');
```

## API Routes

Create `route.ts` inside `app/api/...`.

```ts
// app/api/data/route.ts

export function GET(req: Request) {
  return Response.json({
    message: 'Hello from TradJS',
    time: new Date().toISOString(),
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  return Response.json({
    received: body,
    ok: true,
  });
}
```

Route handlers receive a standard `Request` and return a standard `Response`.

Supported pattern:

```ts
export function GET(req: Request) {}
export function POST(req: Request) {}
export function PUT(req: Request) {}
export function PATCH(req: Request) {}
export function DELETE(req: Request) {}
```

## Middleware

Add `middleware.ts` next to a route or layout segment.

```ts
// app/features/middleware/middleware.ts

export default async function middleware(req: Request): Promise<Response | void> {
  const url = new URL(req.url);

  if (url.searchParams.has('blocked')) {
    return new Response('Blocked by middleware', {
      status: 403,
      headers: {
        'Content-Type': 'text/plain',
      },
    });
  }

  // Return void to continue.
}
```

Middleware can:

* inspect the request
* log traffic
* block with a `Response`
* redirect
* enforce auth
* add request-level behavior before a page or API handler runs

## Error Boundaries

Add `error.tsx` near a page to render a friendly error UI when server rendering fails.

```tsx
// app/features/error-crash/error.tsx

export default function ErrorBoundary({
  error,
  pathname,
}: {
  error: { message?: string; stack?: string };
  pathname: string;
}) {
  return (
    <div>
      <h1>Something went wrong</h1>
      <p>{error.message || 'Unknown error'}</p>
      <a href={pathname}>Try again</a>
    </div>
  );
}
```

Example crashing page:

```tsx
// app/features/error-crash/page.tsx

export default function ErrorCrashPage() {
  throw new Error('Intentional crash');
}
```

TradJS finds the nearest `error.tsx` by walking up the route tree.

## Head Tags

Use `Head` to add per-page head tags during SSR.

```tsx
import { Head } from 'tradjs/web';

export default function AboutPage() {
  return (
    <div>
      <Head>
        <title>About | My App</title>
        <meta name="description" content="About our app" />
        <meta property="og:title" content="About" />
      </Head>

      <h1>About</h1>
    </div>
  );
}
```

`Head` content is collected during server rendering and injected into the document `<head>`.

## Static Site Generation

Opt a page into SSG:

```tsx
// app/features/ssg/page.tsx

export const ssg = true;

export default function SsgPage() {
  const builtAt = new Date().toISOString();

  return (
    <main>
      <h1>Static page</h1>
      <p>Built at: {builtAt}</p>
    </main>
  );
}
```

With revalidation:

```tsx
export const ssg = {
  revalidate: 60,
};
```

SSG pages are pre-rendered and cached, then served from memory on matching requests.

SSG is best for:

* docs
* marketing pages
* static dashboards
* expensive pages that do not need per-request freshness

Use SSR for pages that need fresh data on every request.

## Scoped CSS

Place `page.css` next to `page.tsx`.

```txt
app/features/scoped-css/
  page.tsx
  page.css
```

Example:

```css
/* app/features/scoped-css/page.css */

.scoped-title {
  color: #818cf8;
}

.scoped-card {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  padding: 16px;
}
```

TradJS scopes page CSS to the route so it does not leak across the app.

## Global CSS

Use global CSS for app-wide styles.

```css
/* app/globals.css */

body {
  margin: 0;
  font-family: system-ui, sans-serif;
}
```

Build with a global CSS entry:

```bash
npx tradjs build --css app/globals.css
```

Or include global styles from your layout depending on your app setup.

## Streaming Responses

API routes can return standard streamed responses.

```ts
// app/api/stream/route.ts

export function GET(req: Request) {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let count = 0;

      const interval = setInterval(() => {
        count++;
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ count })}\n\n`),
        );
      }, 1000);

      req.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
```

## Build Output

Build the app:

```bash
bun run build
```

Or directly:

```bash
npx tradjs build
```

The build step discovers routes, builds client entries, processes CSS, and writes output to `dist/` by default.

Custom output:

```bash
npx tradjs build --outdir ./out
```

## Observability

TradJS uses scoped `measure-fn` instrumentation internally for request and build steps.

Request logs look like:

```txt
[http:a] ... GET /users req_abc123
[http:a-a] ... Route match
[http:a-b] ... Render page
[http:a] ··············· 12.51ms → {"status":200}
```

Build logs look like:

```txt
[build:a] ... Discover routes
[build:a] ············· 8.20ms → 12
[build:b] ... Client: /counter
[build:b] ············· 41.88ms
```

Handler APIs stay clean:

```ts
export function GET(req: Request) {
  return Response.json({ ok: true });
}
```

No measurement function is passed into route handlers.

## Full Minimal Example

```tsx
// app/layout.tsx

export default function RootLayout({ children }: { children: any }) {
  return (
    <html lang="en">
      <head>
        <title>TradJS App</title>
      </head>
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
```

```tsx
// app/page.tsx

export default function HomePage() {
  return (
    <div>
      <h1>Hello TradJS</h1>
      <p>Server-rendered page.</p>
      <div id="counter-root" />
    </div>
  );
}
```

```tsx
// app/page.client.tsx

import { render } from 'tradjs/client';

let count = 0;

function Counter() {
  return (
    <button
      onClick={() => {
        count++;
        update();
      }}
    >
      Count: {count}
    </button>
  );
}

function update() {
  const root = document.getElementById('counter-root');
  if (root) render(<Counter />, root);
}

export default function mount() {
  update();

  return () => {
    const root = document.getElementById('counter-root');
    if (root) render(null, root);
  };
}
```

```ts
// app/api/data/route.ts

export function GET() {
  return Response.json({
    message: 'Hello from API',
  });
}
```

Run:

```bash
npx tradjs serve
```

## Public API

### `tradjs/client`

```ts
import {
  render,
  createElement,
  h,
  memo,
  Link,
  navigate,
  Fragment,
} from 'tradjs/client';
```

### `tradjs/web`

```ts
import {
  Head,
  serve,
  start,
} from 'tradjs/web';
```

### `tradjs/server`

```ts
import {
  renderToString,
  renderToStringAsync,
} from 'tradjs/server';
```

## Design Notes

TradJS intentionally keeps the model small:

* server pages are just functions returning JSX
* API routes are just functions returning `Response`
* client interactivity is explicit through mount scripts
* rendering is explicit through `render()`
* memoization is explicit through `memo()`
* routing comes from files
* CSS can be global or page-scoped

This makes the framework easy to inspect, easy to debug, and friendly to Bun-native projects.

## License

MIT
