---
name: tradjs
description: Bun-native web framework with file routing. Use this for building server-rendered pages with client mount scripts for interactivity.
---

# TradJS — Framework Skill

TradJS is a Bun-native web framework. Pages are server-rendered JSX, client interactivity is added via **mount scripts** — `.client.tsx` files compiled to lightweight VNodes with a ~2KB reconciler runtime.

**Current version: 2.5.8**

---

## 1. When to Use TradJS

Use TradJS when the user wants:
- Server-rendered HTML pages with file-based routing (Next.js App Router style)
- Client-side interactivity WITHOUT a full SPA framework (no React on the client)
- CSS styling (Tailwind CSS v4 or vanilla CSS)
- API endpoints alongside pages
- View Transitions for app-like navigation
- Lightweight client bundles (zero React, zero framework overhead)
- Static Site Generation (SSG) for pre-rendered pages

TradJS replaces the full Next.js / Vite stack — server pages, API routes, SSG, and client interactivity — with zero React on the client.

---

## 2. Project Setup

### New Project (from scratch)

```bash
mkdir my-app && cd my-app
bun init -y
bun add tradjs
```

Create `server.ts`:

```ts
import { serve } from 'tradjs';

await serve({
    port: parseInt(process.env.BUN_PORT || "3000"),
    defaultTitle: 'My App',
});
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
        "strict": true,
        "noEmit": true,
        "skipLibCheck": true
    },
    "include": ["app/**/*"]
}
```

> **Critical**: `"jsxImportSource": "tradjs/client"` is required. This tells TypeScript and Bun to use TradJS's VDOM runtime for JSX instead of React.

### Within the TradJS monorepo

When building examples inside the `tradjs` repo, import from local source:

```ts
// server.ts (inside examples/)
import { start } from '../../src/web';
```

And use `paths` in `tsconfig.json`:

```json
{
    "compilerOptions": {
        "paths": {
            "tradjs/client/*": ["../../src/client/*"],
            "tradjs/*": ["../../src/*"]
        }
    }
}
```

---

## 3. File Structure & Routing

```
my-app/
├── app/
│   ├── layout.tsx              # Root layout (wraps all pages)
│   ├── layout.client.tsx       # Persistent client mount script
│   ├── globals.css             # Global styles (auto-discovered)
│   ├── page.tsx                # Home page (/)
│   ├── page.client.tsx         # Home page mount script
│   ├── page.css                # Scoped CSS for home page
│   ├── middleware.ts           # Root middleware
│   ├── error.tsx               # Error boundary
│   ├── about/
│   │   └── page.tsx            # /about
│   ├── post/[id]/
│   │   ├── page.tsx            # /post/:id (dynamic route)
│   │   └── page.client.tsx     # Client interactivity for post
│   └── api/
│       └── messages/
│           └── route.ts        # API: GET/POST /api/messages
├── server.ts
├── tsconfig.json
└── package.json
```

### Routing Rules

| File Pattern | URL | Type |
|---|---|---|
| `app/page.tsx` | `/` | Page |
| `app/about/page.tsx` | `/about` | Page |
| `app/post/[id]/page.tsx` | `/post/:id` | Dynamic page |
| `app/api/messages/route.ts` | `/api/messages` | API route |
| `app/layout.tsx` | — | Layout (wraps children) |
| `app/middleware.ts` | — | Runs before page render |
| `app/error.tsx` | — | Catches render errors |

### Auto-discovered files

- `globals.css`, `global.css`, or `app.css` → processed with PostCSS + Tailwind v4
- `page.css` or `style.css` → scoped CSS for that route segment
- `layout.tsx` → layout wrapping child pages (nested layouts compose automatically)
- `layout.client.tsx` → persistent client mount (survives navigations)
- `page.client.tsx` → per-page transient client mount
- `middleware.ts` → runs root→leaf before page render
- `error.tsx` → catches render errors with full layout chrome

---

## 4. Server Pages (`page.tsx`)

Pages run on the server. They can access databases, read files, anything server-side. They return JSX rendered to HTML via `renderToString`.

```tsx
// app/page.tsx
export default function Page() {
    return (
        <div>
            <h1>Welcome</h1>
            <p>Server-rendered at {new Date().toISOString()}</p>
            <div id="app-root" />
        </div>
    );
}
```

**Important patterns:**
- Place `id=""` attributes on containers that client scripts will target
- Server pages render HTML — client scripts add interactivity

---

## 5. Layouts (`layout.tsx`)

Root layout wraps all pages. Must include `{children}`.

```tsx
// app/layout.tsx
export default function RootLayout({ children }: { children: any }) {
    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <title>My App</title>
            </head>
            <body>
                <nav><a href="/">Home</a> | <a href="/about">About</a></nav>
                <main id="melina-page-content">{children}</main>
            </body>
        </html>
    );
}
```

**Key points:**
- `{children}` is where the current page renders
- `id="melina-page-content"` enables targeted page swaps during navigation
- Nested layouts compose automatically — place `layout.tsx` in any subdirectory

---

## 6. `<Head>` Component

Declarative per-page `<head>` management:

```tsx
// app/features/about/page.tsx
import { Head } from 'melina/web';

export default function AboutPage() {
    return (
        <>
            <Head>
                <title>About Us — My App</title>
                <meta name="description" content="Learn about our team" />
                <link rel="canonical" href="https://example.com/about" />
            </Head>
            <main><h1>About Us</h1></main>
        </>
    );
}
```

Head elements are collected during SSR and injected into `<head>`.

---

## 7. Client Architecture (`page.client.tsx`)

Melina uses a **pure VDOM architecture** for client interactivity. No hooks, no signals. Call `render(vnode, container)` to update the UI.

### Mount Script Pattern

```tsx
// app/counter/page.client.tsx
import { render } from 'melina/client';

function Counter({ count, onIncrement }: { count: number; onIncrement: () => void }) {
    return (
        <div>
            <span>Count: {count}</span>
            <button onClick={onIncrement}>+1</button>
        </div>
    );
}

export default function mount() {
    const root = document.getElementById('counter-root');
    if (!root) return;

    let count = 0;
    const update = () => {
        render(<Counter count={count} onIncrement={() => { count++; update(); }} />, root);
    };
    update();

    // Cleanup — called when navigating away
    return () => render(null, root);
}
```

### Mount Script Lifecycle

| File | Lifecycle | Use Case |
|---|---|---|
| `page.client.tsx` | Mounts on page load, unmounts on navigate away | Page-specific interactions |
| `layout.client.tsx` | Mounts once, survives across navigations | Global widgets, persistent state |

Both must `export default function mount()`:
- Called when the script enters the DOM
- Return value is a cleanup function, called on unmount
- Uses `render(vnode, container)` to mount/update content

### Pluggable Reconciler

Three diffing strategies:
1. **Keyed diff** — O(n log n) via LIS for list reorders
2. **Sequential diff** — O(n) linear patch for static layouts
3. **Replace** — Full replace (baseline)

```ts
import { setReconciler } from 'melina/client';

setReconciler('auto');        // Default — inspects children for keys
setReconciler('keyed');       // Best for dynamic lists
setReconciler('sequential');  // Best for static layouts
```

| Use Case | Strategy |
|---|---|
| Dynamic lists with reorder | `keyed` |
| Static forms, fixed layouts | `sequential` |
| Large lists (1000+) | `keyed` |
| Not sure | `auto` (default) |

---

## 8. API Routes (`route.ts`)

Export named HTTP method handlers:

```ts
// app/api/messages/route.ts
export async function GET(req: Request) {
    return Response.json([{ id: 1, text: 'Hello' }]);
}

export async function POST(req: Request) {
    const body = await req.json();
    return Response.json({ ok: true });
}
```

### Streaming (SSE)

Return an `AsyncGenerator` for Server-Sent Events:

```ts
// app/api/stream/route.ts
export async function* GET(req: Request) {
    for (let i = 0; i < 10; i++) {
        yield `data: ${JSON.stringify({ count: i })}\n\n`;
        await new Promise(r => setTimeout(r, 1000));
    }
}
```

---

## 9. Middleware (`middleware.ts`)

Middleware functions run before page rendering, root→leaf:

```ts
// app/middleware.ts
export default async function middleware(req: Request) {
    const token = req.headers.get('authorization');
    if (!token) {
        return new Response('Unauthorized', { status: 401 });
    }
    // Return nothing to continue to the page
}
```

---

## 10. Error Boundaries (`error.tsx`)

Catches render errors and displays them with full layout chrome:

```tsx
// app/error.tsx
export default function ErrorPage({ error }: { error: { message: string; stack?: string } }) {
    return (
        <div style={{ padding: '40px', color: '#ef4444' }}>
            <h1>Something went wrong</h1>
            <pre>{error.message}</pre>
        </div>
    );
}
```

---

## 11. SSG (Static Site Generation)

Pre-render pages at startup, serve from memory:

```tsx
// app/pricing/page.tsx
export const ssg = true;

export default function PricingPage() {
    return <main><h1>Pricing</h1></main>;
}
```

With TTL (time-to-live):

```tsx
export const ssg = { revalidate: 60 }; // re-render after 60 seconds
```

SSG API:

```ts
import { getPrerendered, setPrerendered, clearSSGCache } from 'melina/server';

// Check if a page is cached
const html = getPrerendered('/pricing');

// Clear cache (e.g., after content update)
clearSSGCache('/pricing');
```

---

## 12. Styling

### Tailwind CSS v4

Create `app/globals.css`:

```css
@import "tailwindcss";

@theme {
    --color-background: #0a0a0f;
    --color-surface: #111118;
    --color-foreground: #e4e4e7;
    --color-accent: #6366f1;
}
```

Melina auto-discovers `globals.css`, `global.css`, or `app.css`.

### Scoped CSS

Place `page.css` or `style.css` alongside a page — auto-injected for that route only.

### Vanilla CSS

You don't need Tailwind — any CSS works. Just use standard stylesheets.

---

## 13. Package Exports

| Import Path | Module | Use Case |
|---|---|---|
| `melina` | `src/web.ts` | Server: `start`, `serve`, `createAppRouter` |
| `melina/web` | `src/web.ts` | Same as above |
| `melina/server` | `src/server/index.ts` | Server: `renderToString`, `Head`, SSG, build helpers |
| `melina/server/ssr` | `src/server/ssr.ts` | Server: `renderToString` only |
| `melina/client` | `src/client/index.ts` | Client: `render`, `createElement`, `setReconciler`, `navigate`, `Link` |
| `melina/client/render` | `src/client/render.ts` | Client: same as above (direct) |
| `melina/client/types` | `src/client/types.ts` | Types: `VNode`, `Props`, `Component` |
| `melina/client/reconcilers` | `src/client/reconcilers/index.ts` | Reconciler strategies |
| `melina/client/jsx-runtime` | `src/client/jsx-runtime.ts` | JSX transform (auto, don't import manually) |
| `melina/client/jsx-dom` | `src/client/jsx-dom.ts` | Real DOM JSX factory |

### Architecture: SSR vs Client separation

- **Client bundles** (`src/client/`) are bundled for the browser — no server code
- **SSR** (`renderToString`) lives at `src/server/ssr.ts` — never in client bundles
- **Server** imports from `melina/server` or `melina/web`
- **Client mount scripts** import from `melina/client`

---

## 14. Server API Reference

### `start(options)` — Quick start

```ts
import { start } from 'melina';

await start({
    appDir: './app',                    // default: './app'
    port: 3000,                         // default: 3000 or BUN_PORT env
    defaultTitle: 'My App',
    // hotReload: true,                 // opt-in in dev, off by default
});
```

### `serve(handler, options)` + `createAppRouter(options)` — Advanced

```ts
import { serve, createAppRouter } from 'melina';

const router = createAppRouter({
    appDir: './app',
    defaultTitle: 'My App',
    globalCss: './app/globals.css',
});

serve(router, { port: 3000 });
```

### Build Helpers

```ts
import { buildScript, buildStyle, buildAsset } from 'melina/server';

const scriptUrl = await buildScript('./src/app.ts');     // JS/TS → hashed URL
const cssUrl = await buildStyle('./src/style.css');       // CSS → processed URL
const imgUrl = await buildAsset(Bun.file('./icon.png')); // Static → hashed URL
```

---

## 15. Common Patterns

### Event Delegation for Lists

For dynamic lists, use `data-*` attributes with delegated event handlers:

```tsx
// In page.client.tsx
document.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-item-id]');
    if (btn) {
        const id = (btn as HTMLElement).dataset.itemId;
        selectItem(id);
    }
});

// In component
function Item({ item }: { item: { id: string; name: string } }) {
    return <button data-item-id={item.id}>{item.name}</button>;
}
```

### Persistent Floating Widget

```tsx
// layout.client.tsx — survives across navigations
import { render } from 'melina/client';

export default function mount() {
    const root = document.getElementById('widget-root');
    if (!root) return;

    let isOpen = false;
    const update = () => render(
        <div>
            {isOpen && <div className="widget-panel">Widget content</div>}
            <button onClick={() => { isOpen = !isOpen; update(); }}>
                {isOpen ? '✕' : '?'}
            </button>
        </div>,
        root
    );
    update();
    return () => render(null, root);
}
```

### Client-Side Navigation

```ts
import { navigate } from 'melina/client';

// Programmatic navigation with View Transitions
navigate('/dashboard');
```

---

## 16. Gotchas & Troubleshooting

### ❌ `async` Server Components

Melina's `renderToString` does NOT support `async` server components.

- **Wrong**: `export default async function Page() { ... }`
- **Right**: `export default function Page() { ... }`

If you need async data, fetch it before the component renders and pass it as props.

### ❌ Missing `mount()` export

Client scripts MUST `export default function mount()`. Without this, no interactivity.

### ❌ CSS 404

Melina auto-maps `app/globals.css` → `/globals.css`. Don't use custom paths in `<link>` tags.

### ❌ Ghost Processes (EADDRINUSE)

On Windows, stale Bun processes may hold ports:

```powershell
netstat -ano | findstr ":3000"
taskkill /F /PID <PID>
```

### ❌ Stale Dependencies

After switching package versions or linking locally:

```powershell
Remove-Item -Recurse -Force node_modules, bun.lock; bun install
```
