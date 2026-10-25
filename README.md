# TradJS 🦊

**Bun-first web framework with file-system routing, SSR, native browser navigation, API routes, scoped CSS, SSG, middleware, error boundaries, and a tiny JSX renderer.**

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
- browser-native document navigation with cross-document View Transitions
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

### Async server components

SSR stays synchronous by default. A normal `page.tsx` or `layout.tsx` is rendered with `renderToString()` and every component below that synchronous render root must also be synchronous.

Declare the page or layout `async` when its server-rendered tree is allowed to contain async components. TradJS then uses `renderToStringAsync()` for that render root and recursively awaits async descendants.

```tsx
async function AccountName() {
  const account = await loadAccount();
  return <strong>{account.name}</strong>;
}

export default async function Page() {
  return (
    <main>
      Signed in as <AccountName />
    </main>
  );
}
```

TradJS does not start with synchronous rendering and then rerun the tree asynchronously when it discovers a Promise. Doing so could execute components, fetches, logging, mutations, or `<Head>` collection twice. If a synchronous page or layout reaches async component output, rendering fails with a focused error telling you to make that page or layout async.

`renderToString()` remains the explicit synchronous low-level API and `renderToStringAsync()` remains the explicit async API. Async SSR currently produces the complete page/shell HTML before the route response is returned; using a `ReadableStream` for the response does not yet make async component rendering progressively streamed.
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
}
```
The default export is a mount function. TradJS runs it when the document loads. Navigation is browser-native, so TradJS does not retain or call a returned cleanup function when moving to another route. Use normal browser lifecycle primitives such as `pagehide` when explicit teardown or persistence is needed.

Client-rendered components are synchronous. Put browser-side async work in an action/controller function, await it there, update state, then repaint the affected render boundaries. Passing an async component to client `render()` throws a focused error instead of treating the returned Promise as a VNode.
## Navigation philosophy

TradJS uses **browser-native document navigation**. It does not install a client router, intercept same-origin anchors, fetch the next page in JavaScript, synchronize `<head>`, or replace `<body>` manually.

Use normal links:

```tsx
<a href="/counter">Counter</a>
```

For programmatic navigation, use the browser APIs directly:

```ts
window.location.assign('/counter');
window.location.replace('/counter');
```

Each route change is a normal document request. The server renders the destination document, the browser loads it, and that document's `layout.client.tsx` / `page.client.tsx` scripts mount normally. Do not rely on in-memory client state surviving a route change; persist state explicitly when it must survive navigation.

By default, TradJS enables native cross-document View Transitions with:

```css
@view-transition {
  navigation: auto;
}
```

Supporting browsers perform the transition as part of normal document navigation; TradJS does not emulate it with a JavaScript router. Set `viewTransitions: false` on the router if you do not want TradJS to inject the opt-in. Browsers without cross-document View Transition support simply use normal document navigation.

Use stable `view-transition-name` values when elements in the old and new documents should participate in the same transition:

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

If state must survive navigation, persist it explicitly with browser or server storage such as `sessionStorage`, `localStorage`, IndexedDB, URL/search params, cookies, or a server session. Save important client state when it changes or from a browser lifecycle event such as `pagehide`; do not depend on a TradJS route-cleanup callback.

```ts
// layout.client.tsx

const key = 'tradjs:player-state';

export default function mount() {
  const root = document.getElementById('player-root');
  if (!root) return;

  const state = JSON.parse(sessionStorage.getItem(key) || '{"playing":false}');
  root.textContent = state.playing ? 'Playing' : 'Paused';

  window.addEventListener(
    'pagehide',
    () => sessionStorage.setItem(key, JSON.stringify(state)),
    { once: true },
  );
}
```

This is the intended model: native document navigation, optional native View Transitions, and explicit persistence when needed.
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
import { render, h, memo } from 'tradjs/client';

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

Function components may return `null`, become non-empty again later, or change their rendered root type. Application code does not need a permanent wrapper such as `display: contents` to make `element -> null -> element` work. Component and fragment fibers are logical fibers; their output is reconciled against the actual host parent and keeps its logical sibling position.

For applications with multiple independently changing regions, treat each container passed to `render()` as an explicit subtree boundary. Keep state changes and the repaint decision together in controller/action methods, and repaint only the boundaries affected by that transition.

A useful application-level boundary helper is just a ref plus a measured `paint()` function; it does not need to be a TradJS framework API:

```tsx
import { createMeasure } from "measure-fn";
import { render } from "tradjs/client";

const m = createMeasure("pool");

type Boundary<T extends HTMLElement> = {
  ref: { current: T | null };
  paint: (view: any) => void;
};

function createBoundary<T extends HTMLElement>(name: string): Boundary<T> {
  const ref = { current: null as T | null };
  return {
    ref,
    paint(view) {
      return m.sync(`render:${name}`, () => {
        if (ref.current) render(view, ref.current);
      });
    },
  };
}

const gravity = createBoundary<HTMLSpanElement>("gravity");
const wallet = createBoundary<HTMLSpanElement>("wallet");
const stats = createBoundary<HTMLSpanElement>("stats");

const pool = {
  token: { symbol: "GRAV", gravity: 0 },
  wallet: { address: null as string | null },
  updates: 0,

  updateGravity(delta: number) {
    return m.sync("pool:updateGravity", () => {
      this.token.gravity += delta;
      this.updates++;
      gravity.paint(<Gravity />);
      stats.paint(<Stats />);
    });
  },

  toggleWallet() {
    return m.sync("pool:toggleWallet", () => {
      this.wallet.address = this.wallet.address ? null : "7F3A…91C2";
      this.updates++;
      wallet.paint(<Wallet />);
      stats.paint(<Stats />);
    });
  },
};

function Gravity() {
  return <strong>{pool.token.gravity}</strong>;
}

function Wallet() {
  return <strong>{pool.wallet.address ?? "Disconnected"}</strong>;
}

function Stats() {
  return <small>{pool.updates} updates</small>;
}

function App() {
  return (
    <main>
      <h1>{pool.token.symbol} Pool</h1>
      <p>
        Gravity: <span ref={gravity.ref} />
      </p>
      <p>
        Wallet: <span ref={wallet.ref} />
      </p>
      <p>
        Stats: <span ref={stats.ref} />
      </p>
      <button onClick={() => pool.updateGravity(-1)}>-1</button>
      <button onClick={() => pool.updateGravity(1)}>+1</button>
      <button onClick={() => pool.toggleWallet()}>Toggle wallet</button>
    </main>
  );
}

export default function mount() {
  const root = document.getElementById("pool-root");
  if (!root) return;
  return m.sync("mount", () => {
    render(<App />, root);
    gravity.paint(<Gravity />);
    wallet.paint(<Wallet />);
    stats.paint(<Stats />);
  });
}
```

The controller owns the state transition and the repaint decision. Event handlers call the controller instead of duplicating `state mutation + render()` logic. Perform all mutations for one logical action first, then paint each dependent boundary once. If several regions always repaint together, use one common boundary instead of splitting them artificially.

Use `memo()` only for explicit props-based bailout:

```tsx
const Card = memo(function Card({ title }: { title: string }) {
  return <article>{title}</article>;
});
```

This matches the React mental model: no implicit function-component memoization.
## Links

TradJS uses normal browser links; there is no framework `Link` component or `navigate()` helper.

```tsx
<a href="/counter">Counter</a>
<a href="/docs#routing">Routing docs</a>
```

For programmatic document navigation, use `window.location.assign()` or `window.location.replace()`. Native navigation also means standard browser behavior for `target`, `download`, modifier-clicks, history, reloads, and external URLs remains untouched.
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

### CORS

TradJS also exports a handler-level `cors()` middleware from `tradjs/web`. Wrap the app router when the server should answer cross-origin browser requests and preflights centrally instead of adding CORS headers inside individual routes.

```ts
import { cors, createAppRouter, serve } from 'tradjs/web';

const app = cors(createAppRouter(), {
  origin: ['https://app.example.com'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
  maxAge: 600,
});

await serve(app);
```

`cors()` handles `OPTIONS` preflight requests and applies the corresponding CORS headers to normal responses. `origin` may be `"*"`, a single origin, an allowlist, or a resolver function. CORS is a browser access policy, not authentication or authorization; keep authorization in route middleware and handlers.
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

Server-rendering errors and client-bundle build errors go through the route error path instead of being logged and followed by a successful empty page. If `page.client.tsx` or `layout.client.tsx` fails to bundle, the request fails rather than returning HTTP 200 with an empty client mount. In development, the built-in fallback error page includes the escaped error details; production fallback output hides implementation details. A route `error.tsx` remains the preferred custom error UI.

After a client bundle has successfully loaded, TradJS also surfaces browser module-import failures, rejected async mount functions, uncaught errors, and unhandled promise rejections in an in-page error overlay. Build failures cannot use that browser overlay because no working client bundle exists yet, so those failures are handled by the server response.
Client builds allow bare `buffer` imports to resolve through Bun's browser implementation, including imports inside browser SDKs such as `@solana/web3.js`. This does not install a global `Buffer`; application code should import `{ Buffer }` from `"buffer"` when needed. Explicit `node:` imports (including `node:buffer`), other Node builtins such as `fs`, Bun modules such as `bun:sqlite`, and packages marked as server-only remain rejected, including transitive imports.

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
  Fragment,
} from 'tradjs/client';
```

### `tradjs/web`

```ts
import {
  Head,
  serve,
  start,
  createAppRouter,
  cors,
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
- navigation uses the browser document lifecycle
- persistence is explicit through browser/server storage
- memoization is explicit through `memo()`
- routing comes from files
- CSS can be global, scoped, or modular

## License

MIT
