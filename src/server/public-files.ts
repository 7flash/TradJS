import { realpathSync, statSync } from "node:fs";
import path from "node:path";

export interface PublicFilesOptions {
  /** Cache-Control for public files (default: revalidate every time). */
  cacheControl?: string;
}

const DEFAULT_CACHE_CONTROL = "public, max-age=0, must-revalidate";

/**
 * The file in `root` that `rawPathname` names, or null. Refuses anything
 * that could leave the folder or expose hidden files: `..` and dot
 * segments (.env, .git), NUL, backslashes, encoded slashes, and symlinks
 * resolving outside the folder.
 */
export function resolvePublicFile(root: string, rawPathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.includes("\\")) return null;
  const segments = decoded.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  if (segments.some((segment) => segment.startsWith(".") || segment.includes(":"))) return null;
  let realRoot: string;
  try {
    realRoot = realpathSync(root);
  } catch {
    return null;
  }
  const candidate = path.resolve(realRoot, ...segments);
  if (!candidate.startsWith(realRoot + path.sep)) return null;
  try {
    const real = realpathSync(candidate);
    if (!real.startsWith(realRoot + path.sep)) return null;
    if (!statSync(real).isFile()) return null;
    return real;
  } catch {
    return null;
  }
}

/** A GET/HEAD response for a public file: ETag/304, single Range, HEAD without body. */
export function publicFileResponse(
  req: Request,
  file: string,
  options: PublicFilesOptions = {},
): Response {
  const stat = statSync(file);
  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const blob = Bun.file(file);
  const headers: Record<string, string> = {
    "Content-Type": blob.type || "application/octet-stream",
    "Cache-Control": options.cacheControl ?? DEFAULT_CACHE_CONTROL,
    ETag: etag,
    "Last-Modified": new Date(stat.mtimeMs).toUTCString(),
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
  };
  const head = req.method === "HEAD";

  const ifNoneMatch = req.headers.get("if-none-match");
  // If-None-Match uses weak comparison for GET/HEAD (RFC 9110 §13.1.2).
  // The same entity tag may be supplied with or without the W/ prefix.
  const weakTag = (tag: string) => tag.trim().replace(/^W\//, "");
  if (ifNoneMatch && ifNoneMatch.split(",").some((tag) => tag.trim() === "*" || weakTag(tag) === weakTag(etag))) {
    return new Response(null, { status: 304, headers });
  }

  const range = req.headers.get("range");
  if (range) {
    // One range only; a multi-range request gets the whole file (allowed by RFC 9110).
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (match && (match[1] || match[2])) {
      const size = stat.size;
      let start = match[1] ? Number(match[1]) : size - Number(match[2]);
      let end = match[1] ? (match[2] ? Number(match[2]) : size - 1) : size - 1;
      if (start < 0) start = 0;
      if (end >= size) end = size - 1;
      if (size === 0 || start > end || start >= size) {
        return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
      }
      return new Response(head ? null : blob.slice(start, end + 1), {
        status: 206,
        headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
      });
    }
  }
  return new Response(head ? null : blob, {
    headers: { ...headers, "Content-Length": String(stat.size) },
  });
}
