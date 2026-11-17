# Changelog

## 4.6.2 (2026-11-18)

### Security
- Client re-renders now apply the same attribute rules as the first render. An update that changed `href`, `src`, `action` or another URL attribute to `javascript:` or executable `data:`, or set `srcdoc`, was written to the DOM unchecked (4.6.0 only covered the first render).

### Fixed
- Removing `className` on a re-render removes the `class` attribute instead of leaving `class=""`.
- Siblings that share a duplicate `key` keep their DOM nodes on reorder; all but the last were recreated (losing focus and typed input). Duplicate keys still warn.

### Tests
- `tests/renderer-matrix.test.ts`: 64 seeds x 80 random updates and 216 exhaustive three-step sequences (insert, remove, move, reverse, shuffle, keys on/off, duplicate keys, prop changes, wrapper and type changes, raw HTML), each compared with a fresh render of the same tree, plus event and form-state checks.

## 4.6.1 (2026-11-18)

### Security
- CSRF and websocket origin checks refuse a plain-http page writing to an https server on the same host (a network attacker can inject such a page). An https page reaching an http request URL is still allowed: that is a TLS-terminating proxy in front of the app.

### Fixed
- Public files: `If-None-Match` uses weak comparison (RFC 9110), so a tag sent back without its `W/` prefix gets 304.

### Tests
- `tests/request-attack-matrix.test.ts`: 599 hostile and malformed requests (path traversal in every encoding, dotfiles, CSRF variants, Host and X-Forwarded headers, Range abuse, reflected input, error leaks, SSG cache poisoning, middleware bypass) against every route kind, in production and development.

## 4.6.0 (2026-11-17)

### Added

- Request `locals`: middleware writes, layouts/pages/error pages read the `locals` prop, API handlers read `ctx.locals`. Types `Locals`, `RouteContext`, `PageProps` from `tradjs/server`.
- Static files from `public/` (option `publicDir`, `publicCacheControl`): routes win, ETag/304, Range, HEAD; dotfiles and paths outside the folder are never served.

### Security

- CSRF protection: `POST`/`PUT`/`PATCH`/`DELETE` with cookies from another site (by `Origin`, or `Sec-Fetch-Site: cross-site`) get 403 before middleware. Options: `csrf: { allowedOrigins }`, `csrf: false`.
- WebSocket upgrades from another site (a browser `Origin` that is not the app's own) are refused with 403; allow extra sites with `serve(handler, { websocketOrigins: [...] })`.
- In 4.5.1, prerendered SSG pages could be served without running middleware, allowing protected pages to bypass authentication checks. Middleware now runs before cached pages are served.
- In 4.5.1, dynamic SSR responses were publicly cacheable for up to one hour, potentially exposing one user's HTML to another user through a shared cache. Dynamic pages and middleware-protected SSG pages now use `Cache-Control: no-store`.
- In 4.5.1, unsafe SSR attribute names and values could cause attribute injection, and unescaped page titles could inject HTML or scripts. SSR now validates HTML attribute and tag names, removes event handlers regardless of case, rejects `srcdoc` and unsafe URL schemes, and escapes title, viewport, and metadata values.
- In 4.5.1, concurrent requests could share `<Head>` elements, causing titles and metadata from one request to appear in another response. Each page, layout, and SSG render now isolates its own `<Head>` elements.
- `<Head>` now also rejects executable URLs and `srcdoc` attributes, consistent with SSR attribute handling.
- The server's detailed error page (message, stack, details) is shown only to requests from the same machine, even when `NODE_ENV` is not set to `production`.
- In 4.5.1, a route's `error.tsx` received the raw error message in production, which could expose SQL, file paths or other internals. In production it now gets a generic message and an `error.digest` that matches the server log line.
- The client renderer applies the same attribute and URL rules as server rendering, so a `javascript:` link or `srcdoc` set from the browser is dropped too.
- `style` values are checked too: `url(javascript:...)`, `url(vbscript:...)` and non-image `data:` URLs (including CSS-escaped spellings) drop the style attribute, on server and client. Raster `data:image/*` backgrounds stay allowed.
- In 4.5.1, routes were matched on the encoded URL, so `GET /%61dmin` could reach a sibling `/:slug` route instead of `/admin` and skip its middleware, and `GET /admin/` could fall through to a catch-all. Paths are now decoded once per segment and trailing slashes normalized before matching; encoded slashes, backslashes, control characters, dot segments and malformed or double encoding return 404.
- CLI builds no longer read an automatically discovered `globals.css` through a symlink pointing outside the app, or write through an output directory that is (or sits under) a symlink.

### Fixed

- A stylesheet with a relative `@import` of a missing file fails the build with a clear error; before, the whole stylesheet silently came out empty.
- Layouts in dynamic folders receive the route `params`, like the page.
- Unknown URLs render the app's nearest `not-found.tsx` (inside its layouts) instead of the built-in 404 page; `notFound()` in an API route answers 404 instead of 500.
- An async page or layout that never resolves fails after 30 seconds with the error page, instead of holding the request open forever.
- Production: an error after the page started (a click handler, a third-party script) is logged instead of covering the page with the "client failed to start" overlay; the overlay is kept for failed mounts.
- Client renderer: `render(0)` and components returning `0` show `0`; the first render applies the same URL and attribute rules as updates (`javascript:` links were kept, `aria-hidden={false}` was dropped); `onClickCapture` and `onDoubleClick` work; `dangerouslySetInnerHTML` replaces children instead of appending them; duplicate sibling keys log a warning; a component that grows from one child to several keeps them in order.
- `@keyframes` defined in a route's `page.css` get a per-route name, so two routes defining the same keyframes no longer overwrite each other.
- Scoped `page.css`: `:global(...)` is left unscoped, comments are not rewritten, nested `&` rules are not prefixed twice, and `:is(body, ...)` scopes each alternative.
- A page's `<Head>` `<title>`, `<meta name|property>` and canonical link now replace the layout's instead of both being emitted.
- Prerendered SSG pages now include client bundles, initialization scripts, import maps, and route-scoped stylesheets. Interactive components work on SSG pages instead of remaining inert.
- SSG pages now regenerate after their revalidation period expires instead of permanently falling back to dynamic rendering. Concurrent cache misses share a single regeneration.
- Text inside `<style>` and `<script>` elements is no longer HTML-escaped, so CSS selectors and JavaScript retain their intended content. Embedded closing tags are neutralized to prevent premature element termination.
- Client scripts are now correctly discovered for `.js` and `.jsx` routes.
- The client renderer creates nodes in the container's own document, so rendering into an iframe or another window works.
- A client render that throws partway (component, ref callback, later child) no longer leaves half-mounted nodes, listeners or refs behind; the container keeps its previous content and the next `render()` works.
- Expected view-transition cancellations, including `AbortError` and `TimeoutError` skips, no longer trigger the client error overlay. Unrelated errors remain visible.
- The 404 page now includes a mobile viewport declaration.
- The published type declarations work in strict projects: `serve()` no longer names Bun's `Server` without its type argument, and relative imports in `.d.ts` files carry `.js` so `moduleResolution: node16`/`nodenext` resolves them (JSX types were `any` there).
- The showcase reconnects its event stream after back/forward cache restoration and keeps previously displayed events.
- The showcase uses dynamic viewport heights with fallbacks and keeps its diagnostics panel visible above mobile keyboards.

### Changed

- Client initialization now runs layout initializers first, followed by the page initializer, awaiting each in order. A failed initializer prevents dependent initializers from running.
- Client bootstrap scripts now run from `<head>` with `blocking="render"`. First paint waits for client initialization to complete.
- View transitions now use the shared document transition policy, including stable-root styling, resource readiness checks, and updated reduced-motion handling.
- Public SSG responses now use a cache `max-age` matching their `revalidate` setting, defaulting to 3600 seconds. Middleware-protected SSG responses are not stored.
- HTML responses now explicitly declare UTF-8 encoding.
- The README and framework skill documentation now describe the current APIs, supported features, and application conventions.

### Added

- SSG for routes with params: a page exports `ssgParams()` returning the param sets to prerender (`[{ slug: "a" }]`); other paths render dynamically.
- CLI: `tradjs start` (production), `--host`, graceful shutdown on SIGINT/SIGTERM (the option was dropped before), owner-only Unix sockets, and in production a busy port is an error instead of a silent move.
- `createBoundary({ fallback })`: a client boundary can render a fallback when its render throws, and `boundary.reset()` retries.
- `notFound()` from `tradjs/server`: a page, layout or server component can answer 404, rendered with the nearest `not-found.tsx` inside its layouts or the built-in 404 page.
- `createAppRouter({ mode })` chooses development or production per router (default: `NODE_ENV` when the router is created, no longer when the module is imported), and the returned handler has `ready`, a promise of the number of prerendered pages.
- API route results: `undefined` gives 204, objects are JSON with a charset, async generators stream, values JSON cannot encode give a clear 500, and a thrown error gives a plain-text 500 (stack only in development).
- API routes answer `HEAD` (from `GET`, no body) and `OPTIONS` (204 with `Allow`, unless the route exports its own `OPTIONS`), and an unsupported method gets 405 with `Allow`.
- CSS Modules (`*.module.css`) now work in server-rendered pages, layouts and components, with the same class names as the client bundle; the page links the stylesheets it uses.
- Layouts now receive a `pathname` property, allowing navigation elements to identify the current route. During SSG prerendering, this property contains the route pattern.
- SSG routes now support automatic cache regeneration after their configured revalidation interval, with simultaneous regeneration requests deduplicated.

### Upgrading from 4.5

- **Dynamic page caching:** Dynamic SSR pages now use `Cache-Control: no-store` instead of public caching. If your application depended on shared caching for dynamic HTML, move cacheable content to public SSG routes or configure an explicit application-level caching strategy.
- **URL attributes:** Unsafe URL schemes (`javascript:`, `vbscript:`, and `data:`) are now dropped from URL-bearing attributes. Raster `data:image/*` URLs remain permitted in `src`, `srcset`, and `poster`. Replace blocked URLs with safe HTTP(S) resources or supported image data URLs. Remove any reliance on `srcdoc` or inline event-handler attributes.
- **First paint:** Rendering now waits for client initializers to finish. Keep initialization work short, avoid unnecessary network requests, and ensure initializer promises resolve or reject rather than hanging.
- **Bootstrap location:** Client bootstrap scripts have moved from the end of the document to `<head>` with `blocking="render"`. Remove assumptions that bootstrap scripts appear after body content or other scripts, and explicitly coordinate any code that depends on initialization order.
- **Layout pathname:** Layouts now receive `pathname`. Update layout prop types or signatures where necessary, and use this property for route-aware navigation. Remember that SSG prerendering supplies the route pattern rather than a concrete parameterized pathname.
- **View-transition errors:** The client error overlay now ignores expected skipped transitions caused by aborts or timeouts. Do not rely on the overlay to report these events; handle or log transition skips explicitly if your application needs to observe them.
