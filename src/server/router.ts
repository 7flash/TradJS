import { readdirSync, lstatSync, existsSync } from "node:fs";
import path from "path";
import { errorMessage } from "./errors";
import { routeMeasure } from "./measure";
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
    if (existsSync(candidate) && lstatSync(candidate).isFile())
      return candidate;
  }
  return undefined;
}
export interface Route {
  filePath: string;
  pattern: string;
  pathname: string;
  paramNames: string[];
  regex: RegExp;
  layouts: string[];
  errorPath?: string;
  loadingPath?: string;
  middlewares: string[];
  type: "page" | "api";
}
export interface RouteMatch {
  route: Route;
  params: Record<string, string>;
}
export function filePathToPattern(
  filePath: string,
  appDir: string,
): {
  pattern: string;
  paramNames: string[];
} {
  let relativePath = path.relative(appDir, filePath);
  if (!isInsideDirectory(path.resolve(filePath), path.resolve(appDir)))
    throw new Error(`Route is outside app directory: ${filePath}`);
  relativePath = relativePath.replace(/\\/g, "/");
  relativePath = relativePath.replace(/(^|\/)(page|route)\.(tsx?|jsx?)$/, "");
  if (!relativePath || relativePath === ".") {
    return { pattern: "/", paramNames: [] };
  }
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
        if (segment.match(/^\([^)]+\)$/)) {
          return null;
        }
        return segment;
      })
      .filter(Boolean)
      .join("/");
  return { pattern: pattern || "/", paramNames };
}
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
export interface DiscoverRoutesOptions {
  quiet?: boolean;
}
const IGNORED_DIR_NAMES = new Set([
  "node_modules",
  "public",
  "out",
  "coverage",
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
  appDir = path.resolve(appDir);
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
          stats = lstatSync(fullPath);
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
        } else if (stats.isFile() && entry.match(/^page\.(tsx?|jsx?)$/)) {
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
        } else if (stats.isFile() && entry.match(/^route\.(tsx?|jsx?)$/)) {
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
  return routeMeasure.measureSync(
    {
      start: () => "Discover routes",
      end: (routes: Route[]) => ({ count: routes.length }),
      catch: (error: unknown) => {
        throw error;
      },
    },
    discover,
  );
}
export function matchRoute(
  pathname: string,
  routes: Route[],
): RouteMatch | null {
  for (const route of routes) {
    const match = pathname.match(route.regex);
    if (match) {
      const params: Record<string, string> = Object.create(null);
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
