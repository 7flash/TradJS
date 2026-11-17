import { isAllowedWebSocketOrigin } from "./serve";

export interface CsrfOptions {
  /** Extra origins allowed to send cookie-bearing writes, e.g. "https://admin.example". */
  allowedOrigins?: string[];
}

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Cross-site request forgery check. A browser attaches the user's cookies
 * to a form post or fetch from any site; this refuses such writes unless
 * they come from the app's own origin (or an allowed one).
 *
 * Refused: POST/PUT/PATCH/DELETE that carry a Cookie header and either an
 * Origin from another site, Origin "null", or (without Origin)
 * `Sec-Fetch-Site: cross-site`. Allowed: safe methods, requests without
 * cookies, and requests with neither header (servers, scripts, old clients).
 */
export function csrfRejection(
  req: Request,
  url: URL,
  options: CsrfOptions = {},
): Response | undefined {
  if (!UNSAFE_METHODS.has(req.method.toUpperCase())) return undefined;
  if (!req.headers.has("cookie")) return undefined;
  const origin = req.headers.get("origin");
  const crossSite = origin !== null
    ? !isAllowedWebSocketOrigin(origin, url, options.allowedOrigins)
    : req.headers.get("sec-fetch-site") === "cross-site";
  if (!crossSite) return undefined;
  return new Response("Forbidden: cross-site request", {
    status: 403,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
