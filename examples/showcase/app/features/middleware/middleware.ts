/**
 * Middleware for the /features/middleware route.
 * Runs before the page renders — can inspect request, add headers, or block access.
 */
export default async function middleware(
  req: Request,
): Promise<Response | void> {
  const url = new URL(req.url);

  // Example: block access if ?blocked is present
  if (url.searchParams.has("blocked")) {
    return new Response(
      `<!DOCTYPE html>
<html lang="en"><head><meta charSet="utf-8"><title>403 Blocked</title></head>
<body style="font-family:system-ui;background:#0a0a0a;color:#e5e5e5;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center;max-width:500px">
<div style="font-size:4rem;margin-bottom:16px">🛡️</div>
<h1 style="color:#ef4444;margin-bottom:12px">403 — Blocked by Middleware</h1>
<p style="color:#a3a3a3;margin-bottom:24px">
The middleware detected <code>?blocked</code> in the URL and short-circuited the request
by returning a Response before the page had a chance to render.
</p>
<a href="/features/middleware" style="color:#6366f1;text-decoration:underline">← Go back (without ?blocked)</a>
</div></body></html>`,
      {
        status: 403,
        headers: {
          "Content-Type": "text/html",
          "X-Middleware": "blocked",
        },
      },
    );
  }

  // Example: add a custom header (doesn't block, just enriches)
  // NOTE: returning void means "continue to the page"
  console.log(`[middleware] ${req.method} ${url.pathname} — allowed through`);
}
