import { readdirSync, statSync, existsSync } from "fs";
import path from "path";
import { routeMeasure } from "./measure";

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
  /** Nearest error.tsx — walks up from page dir to root */
  errorPath?: string;
  /** Nearest loading.tsx — walks up from page dir to root */
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

  // Convert [param] to :param and [...slug] to *slug, collecting param names
  const paramNames: string[] = [];
  const pattern =
    "/" +
    relativePath
      .split("/")
      .map((segment) => {
        const catchAllMatch = segment.match(/^\[\.\.\.([^\]]+)\]$/);
        if (catchAllMatch) {
          paramNames.push(catchAllMatch[1]);
          return `*${catchAllMatch[1]}`;
        }

        const match = segment.match(/^\[([^\]]+)\]$/);
        if (match) {
          paramNames.push(match[1]);
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
  const regexStr = pattern
    .replace(/\//g, "\\/")
    .replace(/\*([^\/]+)/g, "(.+)")
    .replace(/:([^\/]+)/g, "([^\\/]+)");
  return new RegExp(`^${regexStr}$`);
}

/**
 * Find all layout.tsx files from appDir to the page's directory
 */
function findLayouts(pageFilePath: string, appDir: string): string[] {
  const layouts: string[] = [];
  let currentDir = path.dirname(pageFilePath);

  // Walk up from page directory to appDir, collecting layouts
  while (currentDir.startsWith(appDir) || currentDir === appDir) {
    const layoutPath = path.join(currentDir, "layout.tsx");
    if (existsSync(layoutPath)) {
      layouts.unshift(layoutPath); // Add to front (root layouts first)
    }

    if (currentDir === appDir) break;
    currentDir = path.dirname(currentDir);
  }

  return layouts;
}

/**
 * Find the nearest error.tsx by walking up from page dir to appDir.
 * Returns the first found (most specific) or undefined.
 */
function findErrorBoundary(
  pageFilePath: string,
  appDir: string,
): string | undefined {
  let currentDir = path.dirname(pageFilePath);
  while (currentDir.startsWith(appDir) || currentDir === appDir) {
    for (const ext of [".tsx", ".ts", ".jsx", ".js"]) {
      const errorPath = path.join(currentDir, `error${ext}`);
      if (existsSync(errorPath)) return errorPath;
    }
    if (currentDir === appDir) break;
    currentDir = path.dirname(currentDir);
  }
  return undefined;
}

/**
 * Find the nearest loading.tsx by walking up from page dir to appDir.
 */
function findLoadingComponent(
  pageFilePath: string,
  appDir: string,
): string | undefined {
  let currentDir = path.dirname(pageFilePath);
  while (currentDir.startsWith(appDir) || currentDir === appDir) {
    for (const ext of [".tsx", ".ts", ".jsx", ".js"]) {
      const loadingPath = path.join(currentDir, `loading${ext}`);
      if (existsSync(loadingPath)) return loadingPath;
    }
    if (currentDir === appDir) break;
    currentDir = path.dirname(currentDir);
  }
  return undefined;
}

/**
 * Find all middleware.ts files from appDir to the page's directory.
 * Collected root→page (outermost first), like layouts.
 */
function findMiddlewares(pageFilePath: string, appDir: string): string[] {
  const middlewares: string[] = [];
  let currentDir = path.dirname(pageFilePath);
  while (currentDir.startsWith(appDir) || currentDir === appDir) {
    for (const ext of [".ts", ".tsx", ".js"]) {
      const mwPath = path.join(currentDir, `middleware${ext}`);
      if (existsSync(mwPath)) {
        middlewares.unshift(mwPath); // root first
        break; // one per directory
      }
    }
    if (currentDir === appDir) break;
    currentDir = path.dirname(currentDir);
  }
  return middlewares;
}

/**
 * Recursively discover all page.tsx/page.ts and route.ts files in app directory
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

    function scanDir(dir: string) {
      try {
        const entries = readdirSync(dir);

        for (const entry of entries) {
          const fullPath = path.join(dir, entry);
          const stats = statSync(fullPath);

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
          } else if (entry.match(/^route\.(tsx?|js)$/)) {
            // API route
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
      } catch (error: any) {
        // Directory doesn't exist or can't be read
        console.warn(`Could not scan directory ${dir}:`, error.message);
      }
    }

    scanDir(appDir);

    // Sort routes by specificity (more specific routes first)
    // Static routes before dynamic routes
    routes.sort((a, b) => {
      const aCatchAll = a.pattern.includes("*");
      const bCatchAll = b.pattern.includes("*");
      const aStatic = !a.pattern.includes(":") && !aCatchAll;
      const bStatic = !b.pattern.includes(":") && !bCatchAll;

      if (aStatic && !bStatic) return -1;
      if (!aStatic && bStatic) return 1;
      if (aCatchAll && !bCatchAll) return 1;
      if (!aCatchAll && bCatchAll) return -1;

      // If same class, sort by depth (deeper first)
      const aDepth = a.pattern.split("/").length;
      const bDepth = b.pattern.split("/").length;
      return bDepth - aDepth;
    });

    return routes;
  };

  if (options.quiet) {
    return discover();
  }

  return routeMeasure.measureSync("Discover routes", discover);
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
        params[name] = match[index + 1];
      });

      return { route, params };
    }
  }

  return null;
}
