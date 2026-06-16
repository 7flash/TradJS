# TradJS 🦊

**Bun-first web framework with file-system routing, SSR, full-body client navigation, API routes, scoped CSS, SSG, middleware, error boundaries, and a tiny JSX renderer.**

```sh
npx tradjs init my-app
cd my-app
bun run dev
```

Open:

```txt
http://localhost:3000
```

## Runtime support

TradJS is currently **Bun-first**.

The full framework runtime expects Bun today:

- dev server uses Bun APIs
- build pipeline uses Bun bundling/runtime behavior
- scaffolded apps are Bun projects

Some internals are portable and adapter-ready:

- client renderer
- SSR string renderer
- route matcher
- most filesystem discovery logic
- `measure-fn` instrumentation

Node.js support should be implemented as a runtime adapter, not by scattering Bun/Node conditionals through the framework.

Recommended future shape:

```txt
src/runtime/types.ts
src/runtime/bun.ts
src/runtime/node.ts
src/runtime/index.ts
```

Until that lands, document the full-stack framework as Bun runtime required.

## Why TradJS?

- file-system routing from `app/`
- server-rendered pages by default
- client scripts only where you add `page.client.tsx` or `layout.client.tsx`
- API route handlers with `GET`, `POST`, etc.
- plain JSX, no React runtime required
- page CSS that can be scoped automatically
- full-body navigation with cleanup and script remounting
- predictable reconciliation: components re-run by default; `memo()` is opt-in
- Bun-first CLI, dev server, and build pipeline

## CLI

```sh
npx tradjs init <project-name>
npx tradjs init .
npx tradjs serve
npx tradjs build
```

### `tradjs serve`

```sh
npx tradjs serve
npx tradjs serve 3000
npx tradjs serve --appdir ./app
npx tradjs serve --unix /tmp/tradjs.sock
```

### `tradjs build`

```sh
npx tradjs build
npx tradjs build --outdir ./out
npx tradjs build --appdir ./app
npx tradjs build --css app/globals.css
npx tradjs build --entry src/a.ts --entry src/b.tsx --outdir ./dist
```

## Project structure

```txt
app/
  layout.tsx
  page.tsx
  page.client.tsx
  globals.css

  counter/
    page.tsx
    page.client.tsx

  api/
    data/
      route.ts

  features/
    middleware/
      middleware.ts
      page.tsx

    error-crash/
      page.tsx
      error.tsx
```

## Pages

```tsx
// app/page.tsx

export default function HomePage() {
  return (
    <main>
      <h1>Hello TradJS</h1>
      <p>This page is server-rendered.</p>
      <div id="counter-root" />
    </main>
  );
}
```

| File | Route |
|---|---|
| `app/page.tsx` | `/` |
| `app/about/page.tsx` | `/about` |
| `app/items/[id]/page.tsx` | `/items/:id` |
| `app/api/data/route.ts` | `/api/data` |

## Layouts

```tsx
// app/layout.tsx

export default function RootLayout({ children }: { children: any }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>TradJS App</title>
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
```

Nested route segments can define their own layouts.

## Client scripts

Add `page.client.tsx` next to a page to mount browser behavior.

```tsx
// app/counter/page.tsx

export default function CounterPage() {
  return (
    <main>
      <h1>Counter</h1>
      <div id="counter-root" />
    </main>
  );
}
```

```tsx
// app/counter/page.client.tsx

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

The default export is a mount function. If it returns a function, TradJS calls it before the next navigation replaces the page.

## Navigation philosophy

TradJS navigation is **document-like**, not island-like.

On client navigation, TradJS:

1. fetches the next page HTML
2. runs current page/layout cleanup functions
3. syncs `<head>` and root attributes
4. replaces the entire `<body>`
5. reactivates scripts in the new body
6. lets new layout/page scripts mount fresh behavior

This keeps navigation predictable. There is no hidden partial hydration system and no island lifecycle abstraction.

If a small region needs fresh data, use a JSON API route and update that region from your client script.

If something should persist across pages, persist its state explicitly with browser primitives:

- `sessionStorage`
- `localStorage`
- IndexedDB
- URL/search params
- cookies
- server session

For smooth visual persistence across full-body transitions, use the Browser View Transition API with stable `view-transition-name` values.

```css
.player-shell {
  view-transition-name: persistent-player;
}
```

```tsx
// layout.tsx

export default function Layout({ children }: { children: any }) {
  return (
    <html>
      <body>
        <div className="player-shell" id="player-root" />
        {children}
      </body>
    </html>
  );
}
```

State still belongs in explicit storage:

```ts
// layout.client.tsx

const key = 'tradjs:player-state';

export default function mount() {
  const root = document.getElementById('player-root');
  if (!root) return;

  const state = JSON.parse(sessionStorage.getItem(key) || '{"playing":false}');

  root.textContent = state.playing ? 'Playing' : 'Paused';

  return () => {
    sessionStorage.setItem(key, JSON.stringify(state));
  };
}
```

This is the intended model: full page replacement, explicit persistence when needed.

## JSX runtime

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

Use React-style event props:

```tsx
<button onClick={() => console.log('clicked')}>Click</button>
<input onInput={(event) => console.log(event.currentTarget.value)} />
<form onSubmit={(event) => event.preventDefault()} />
```

Server rendering skips event props, so handlers do not become HTML attributes.

## Client renderer

```tsx
import { render, h, memo, Link, navigate } from 'tradjs/client';

render(<App />, document.getElementById('root')!);
render(null, root);
```

Use `h()` manually if preferred:

```tsx
render(h('button', { onClick: () => alert('hi') }, 'Click'), root);
```

## Re-rendering and `memo()`

Function components re-run by default whenever you call `render()`.

```tsx
let mode = 'close';

function App() {
  return mode === 'close'
    ? <button data-click="panel-close">Close panel</button>
    : <button data-tab="buildings">Buildings tab</button>;
}

render(<App />, root);

mode = 'tab';
render(<App />, root);
```

TradJS executes `App` again, produces a new vnode tree, and reconciles it against the previous tree. DOM nodes are reused where possible and replaced only when needed.

Use `memo()` only for explicit props-based bailout:

```tsx
const Card = memo(function Card({ title }: { title: string }) {
  return <article>{title}</article>;
});
```

This matches the React mental model: no implicit function-component memoization.

## Links

```tsx
import { Link, navigate } from 'tradjs/client';

<Link href="/counter">Counter</Link>

navigate('/counter');
navigate('/counter', { replace: true, scroll: false });
```

Normal anchors are intercepted when safe:

- same origin
- no `target`
- no `download`
- no modifier key
- not marked with `data-no-intercept`

External links and special clicks use the browser default behavior.

## API routes

```ts
// app/api/data/route.ts

export function GET(req: Request) {
  return Response.json({ ok: true });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return Response.json({ received: body });
}
```

Supported exports:

```ts
export function GET(req: Request) {}
export function POST(req: Request) {}
export function PUT(req: Request) {}
export function PATCH(req: Request) {}
export function DELETE(req: Request) {}
```

## Middleware

```ts
// app/admin/middleware.ts

export default async function middleware(req: Request): Promise<Response | void> {
  const url = new URL(req.url);

  if (!url.searchParams.has('token')) {
    return new Response('Unauthorized', { status: 401 });
  }
}
```

Return `void` to continue. Return a `Response` to short-circuit.

## Error boundaries

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
    <main>
      <h1>Something went wrong</h1>
      <p>{error.message || 'Unknown error'}</p>
      <a href={pathname}>Try again</a>
    </main>
  );
}
```

## Head tags

```tsx
import { Head } from 'tradjs/web';

export default function AboutPage() {
  return (
    <main>
      <Head>
        <title>About | TradJS</title>
        <meta name="description" content="About this app" />
      </Head>

      <h1>About</h1>
    </main>
  );
}
```

## Static site generation

```tsx
export const ssg = true;

export default function Page() {
  return <main>Static page</main>;
}
```

With revalidation metadata:

```tsx
export const ssg = {
  revalidate: 60,
};
```

## Scoped CSS

```txt
app/features/scoped-css/
  page.tsx
  page.css
```

```css
.scoped-card {
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 12px;
  padding: 16px;
}
```

TradJS scopes `page.css` to the route.

## CSS Modules

```css
/* nav.module.css */
.nav {
  display: flex;
}
```

```tsx
import styles from './nav.module.css';

export default function Nav() {
  return <nav className={styles.nav}>Nav</nav>;
}
```

## Streaming responses

```ts
export function GET(req: Request) {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode('hello'));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain' },
  });
}
```

## Observability

TradJS uses scoped `measure-fn` internally.

```txt
[http:a] ... GET /users req_abc123
[http:a-a] ... Import page
[http:a-b] ... SSR renderPage
[http:a] ··········· 12.51ms → {"status":200}
```

Handlers stay clean:

```ts
export function GET(req: Request) {
  return Response.json({ ok: true });
}
```

No measurement function is passed into route handlers.

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

## Design notes

TradJS intentionally keeps the model small:

- server pages return JSX
- API routes return `Response`
- client interactivity is explicit through scripts
- navigation replaces the full body
- persistence is explicit through browser/server storage
- memoization is explicit through `memo()`
- routing comes from files
- CSS can be global, scoped, or modular

## License

MIT
