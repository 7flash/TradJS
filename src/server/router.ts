import { readdirSync, statSync, existsSync } from "fs";
import path from "path";
import { errorMessage } from "./errors";
import { measureRequiredSync, routeMeasure } from "./measure";

const CONVENTION_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"] as const;

function isInsideDirectory(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

function findConventionFile(dir: string, stem: string): string | undefined {
  for (const ext of CONVENTION_EXTENSIONS) {
    const candidate = path.join(dir, `${stem}${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

export interface Route {
  /** File path to the page component */
  filePath: string;
  /** URL pattern (e.g., "/posts/:id") */
  pattern: string;
  /** URL pathname (e.g., "/posts/123") */
  pathname: string;
  /** Parameter names in order (e.g., ["id"]) */
  paramNames: string[];
  /** Regex for matching URLs */
  regex: RegExp;
  /** Layout file paths from root to page (for nested layouts) */
  layouts: string[];
  /** Nearest error convention file — walks up from page dir to root */
  errorPath?: string;
  /** Nearest loading convention file — walks up from page dir to root */
  loadingPath?: string;
  /** Middleware file paths from root to page (like layouts) */
  middlewares: string[];
  /** Route type: 'page' or 'api' */
  type: "page" | "api";
}

export interface RouteMatch {
  /** The matched route */
  route: Route;
  /** Extracted parameters from URL */
  params: Record<string, string>;
}

/**
 * Convert file path to URL pattern
 * Examples:
 *   app/page.tsx -> /
 *   app/about/page.tsx -> /about
 *   app/posts/[id]/page.tsx -> /posts/:id
 *   app/blog/[year]/[month]/page.tsx -> /blog/:year/:month
 */
export function filePathToPattern(
  filePath: string,
  appDir: string,
): { pattern: string; paramNames: string[] } {
  // Remove appDir prefix and page.tsx/page.ts suffix
  let relativePath = path.relative(appDir, filePath);
  // Normalize Windows backslashes to forward slashes
  relativePath = relativePath.replace(/\\/g, "/");
  // Remove page.tsx/page.ts or route.ts suffix
  relativePath = relativePath.replace(/(^|\/)(page|route)\.(tsx?|jsx?)$/, "");

  // Handle root page
  if (!relativePath || relativePath === ".") {
    return { pattern: "/", paramNames: [] };
  }

  // Convert [param] to :param and [...slug] to *slug, collecting param names.
  const paramNames: string[] = [];
  const addParamName = (name: string) => {
    if (paramNames.includes(name)) {
      throw new Error(`Duplicate route parameter "${name}" in ${filePath}`);
    }
    paramNames.push(name);
  };
  const pattern =
    "/" +
    relativePath
      .split("/")
      .map((segment: string) => {
        const catchAllMatch = segment.match(/^\[\.\.\.([^\]]+)\]$/);
        if (catchAllMatch) {
          addParamName(catchAllMatch[1]);
          return `*${catchAllMatch[1]}`;
        }

        const match = segment.match(/^\[([^\]]+)\]$/);
        if (match) {
          addParamName(match[1]);
          return `:${match[1]}`;
        }

        // Handle route groups like (group) - ignore them in URL
        if (segment.match(/^\([^)]+\)$/)) {
          return null;
        }
        return segment;
      })
      .filter(Boolean)
      .join("/");

  return { pattern: pattern || "/", paramNames };
}

/**
 * Convert URL pattern to RegExp for matching
 * /posts/:id -> /^\/posts\/([^\/]+)$/
 * /docs/*slug -> /^\/docs\/(.+)$/
 */
export function patternToRegex(pattern: string): RegExp {
  if (pattern === "/") return /^\/$/;

  const escapeRegex = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const source = pattern
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      if (segment.startsWith(":")) return "([^/]+)";
      if (segment.startsWith("*")) return "(.+)";
      return escapeRegex(segment);
    })
    .join("\\/");

  return new RegExp(`^\\/${source}$`);
}

/** Find all layout files from appDir to the page directory, root first. */
function findLayouts(pageFilePath: string, appDir: string): string[] {
  const layouts: string[] = [];
  let currentDir = path.dirname(pageFilePath);

  while (isInsideDirectory(currentDir, appDir)) {
    const layoutPath = findConventionFile(currentDir, "layout");
    if (layoutPath) layouts.unshift(layoutPath);

    if (currentDir === appDir) break;
    currentDir = path.dirname(currentDir);
  }

  return layouts;
}

/**
 * Find the nearest error convention file by walking up from page dir to appDir.
 * Returns the first found (most specific) or undefined.
 */
function findErrorBoundary(
  pageFilePath: string,
  appDir: string,
): string | undefined {
  let currentDir = path.dirname(pageFilePath);
  while (isInsideDirectory(currentDir, appDir)) {
    const errorPath = findConventionFile(currentDir, "error");
    if (errorPath) return errorPath;
    if (currentDir === appDir) break;
    currentDir = path.dirname(currentDir);
  }
  return undefined;
}

/**
 * Find the nearest loading convention file by walking up from page dir to appDir.
 */
function findLoadingComponent(
  pageFilePath: string,
  appDir: string,
): string | undefined {
  let currentDir = path.dirname(pageFilePath);
  while (isInsideDirectory(currentDir, appDir)) {
    const loadingPath = findConventionFile(currentDir, "loading");
    if (loadingPath) return loadingPath;
    if (currentDir === appDir) break;
    currentDir = path.dirname(currentDir);
  }
  return undefined;
}

/**
 * Find all middleware convention files from appDir to the page's directory.
 * Collected root→page (outermost first), like layouts.
 */
function findMiddlewares(pageFilePath: string, appDir: string): string[] {
  const middlewares: string[] = [];
  let currentDir = path.dirname(pageFilePath);
  while (isInsideDirectory(currentDir, appDir)) {
    const mwPath = findConventionFile(currentDir, "middleware");
    if (mwPath) middlewares.unshift(mwPath);
    if (currentDir === appDir) break;
    currentDir = path.dirname(currentDir);
  }
  return middlewares;
}

/**
 * Recursively discover page and route convention files in the app directory
 */
export interface DiscoverRoutesOptions {
  quiet?: boolean;
}

const IGNORED_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "package",
  ".tradjs",
  ".prompts",
  ".vscode",
  ".idea",
]);

export function discoverRoutes(
  appDir: string,
  options: DiscoverRoutesOptions = {},
): Route[] {
  const discover = () => {
    const routes: Route[] = [];

    function scanDir(dir: string, isRoot = false) {
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch (error) {
        if (isRoot) {
          throw new Error(
            `Could not scan app directory ${dir}: ${errorMessage(error)}`,
            {
              cause: error,
            },
          );
        }
        if (!options.quiet) {
          console.warn(
            `Could not scan directory ${dir}: ${errorMessage(error)}`,
          );
        }
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        let stats;
        try {
          stats = statSync(fullPath);
        } catch (error) {
          if (!options.quiet) {
            console.warn(
              `Could not inspect ${fullPath}: ${errorMessage(error)}`,
            );
          }
          continue;
        }

        if (stats.isDirectory()) {
          if (IGNORED_DIR_NAMES.has(entry)) {
            continue;
          }
          scanDir(fullPath);
        } else if (entry.match(/^page\.(tsx?|jsx?)$/)) {
          const { pattern, paramNames } = filePathToPattern(fullPath, appDir);
          const regex = patternToRegex(pattern);
          const layouts = findLayouts(fullPath, appDir);
          const errorPath = findErrorBoundary(fullPath, appDir);
          const loadingPath = findLoadingComponent(fullPath, appDir);
          const middlewares = findMiddlewares(fullPath, appDir);

          routes.push({
            filePath: fullPath,
            pattern,
            pathname: pattern,
            paramNames,
            regex,
            layouts,
            errorPath,
            loadingPath,
            middlewares,
            type: "page",
          });
        } else if (entry.match(/^route\.(tsx?|jsx?)$/)) {
          const { pattern, paramNames } = filePathToPattern(fullPath, appDir);
          const regex = patternToRegex(pattern);
          const middlewares = findMiddlewares(fullPath, appDir);

          routes.push({
            filePath: fullPath,
            pattern,
            pathname: pattern,
            paramNames,
            regex,
            layouts: [],
            middlewares,
            type: "api",
          });
        }
      }
    }

    scanDir(appDir, true);

    // Different parameter names can still compile to the exact same matcher
    // (`/[id]` and `/[slug]`). Reject those instead of silently choosing one
    // based on directory traversal order.
    const matchers = new Map<string, Route>();
    for (const route of routes) {
      const matcherKey = route.regex.source;
      const existing = matchers.get(matcherKey);
      if (existing) {
        throw new Error(
          `Route conflict for "${route.pattern}": ${path.relative(appDir, existing.filePath)} and ${path.relative(appDir, route.filePath)}`,
        );
      }
      matchers.set(matcherKey, route);
    }

    // Order overlapping routes deterministically, comparing each URL segment.
    // A static segment is more specific than a dynamic segment, which is more
    // specific than a catch-all. This makes `/users/:id` beat `/:section/new`
    // for `/users/new` without depending on filesystem enumeration order.
    const segmentRank = (segment: string): number => {
      if (segment.startsWith("*")) return 0;
      if (segment.startsWith(":")) return 1;
      return 2;
    };

    routes.sort((a, b) => {
      const aSegments = a.pattern.split("/").filter(Boolean);
      const bSegments = b.pattern.split("/").filter(Boolean);
      const sharedLength = Math.min(aSegments.length, bSegments.length);

      for (let i = 0; i < sharedLength; i++) {
        const rankDifference =
          segmentRank(bSegments[i]) - segmentRank(aSegments[i]);
        if (rankDifference !== 0) return rankDifference;
      }

      if (aSegments.length !== bSegments.length) {
        return bSegments.length - aSegments.length;
      }

      return a.pattern.localeCompare(b.pattern);
    });

    return routes;
  };

  if (options.quiet) {
    return discover();
  }

  return measureRequiredSync(
    routeMeasure,
    {
      label: "Discover routes",
      appDir,
      result: (value: Route[]) => ({ count: value.length }),
    },
    discover,
  );
}

/**
 * Match a pathname against discovered routes
 * Returns the first matching route with extracted parameters
 */
export function matchRoute(
  pathname: string,
  routes: Route[],
): RouteMatch | null {
  for (const route of routes) {
    const match = pathname.match(route.regex);
    if (match) {
      const params: Record<string, string> = {};
      route.paramNames.forEach((name, index) => {
        const rawValue = match[index + 1] ?? "";
        try {
          params[name] = decodeURIComponent(rawValue);
        } catch {
          params[name] = rawValue;
        }
      });

      return { route, params };
    }
  }

  return null;
}
