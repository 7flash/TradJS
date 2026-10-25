import { build as bunBuild, type BuildConfig, type BunFile } from "bun";
import path from "path";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { builtinModules } from "node:module";
import { AsyncLocalStorage } from "node:async_hooks";
import autoprefixer from "autoprefixer";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { buildMeasure } from "./measure";
import { rewriteClassSelectors, scopeSelectorList } from "./css-selectors";
const isDev = process.env.NODE_ENV !== "production";
export const buildCache: Record<
  string,
  {
    outputPath: string;
    content: ArrayBuffer;
  }
> = Object.create(null);
export const builtAssets: Record<
  string,
  {
    content: ArrayBuffer;
    contentType: string;
  }
> = Object.create(null);
const devMtimeCache = new Map<
  string,
  {
    fingerprint: string;
    outputPath: string;
  }
>();
const outputAssets = new Map<string, string[]>();
let cacheGeneration = 0;
const buildGeneration = new AsyncLocalStorage<number>();
function canPublish(): boolean {
  return (buildGeneration.getStore() ?? cacheGeneration) === cacheGeneration;
}
function publishAsset(
  url: string,
  asset: {
    content: ArrayBuffer;
    contentType: string;
  },
): void {
  if (canPublish()) builtAssets[url] = asset;
}
function cacheOutput(
  key: string,
  value: {
    content: ArrayBuffer;
    outputPath: string;
  },
): void {
  if (canPublish()) buildCache[key] = value;
}
export function getBuiltAssetPaths(outputPath: string): readonly string[] {
  return outputAssets.get(outputPath) ?? [outputPath];
}
function normalizeBuildKey(filePath: string): string {
  const absolute = path.resolve(process.cwd(), filePath);
  return existsSync(absolute) ? realpathSync(absolute) : absolute;
}
function formatPosition(position: any): string {
  if (!position) return "";
  const file = position.file || position.filename;
  const line = position.line;
  const column = position.column;
  if (!file) return "";
  if (line != null && column != null) {
    return `${file}:${line}:${column}`;
  }
  if (line != null) {
    return `${file}:${line}`;
  }
  return file;
}
function formatBuildLog(log: any): string {
  if (!log) return "";
  const level = log.level ? `[${String(log.level).toUpperCase()}] ` : "";
  const message = log.message || String(log);
  const where = formatPosition(log.position);
  const parts: string[] = [];
  if (where) {
    parts.push(`${level}${where}`);
    parts.push(message);
  } else {
    parts.push(`${level}${message}`);
  }
  const lineText = log.position?.lineText;
  const column = log.position?.column;
  if (lineText) {
    parts.push(lineText);
    if (typeof column === "number" && column > 0) {
      parts.push(`${" ".repeat(Math.max(0, column - 1))}^`);
    }
  }
  if (Array.isArray(log.notes) && log.notes.length > 0) {
    for (const note of log.notes) {
      const noteMessage = note.message || String(note);
      const noteWhere = formatPosition(note.position);
      if (noteWhere) {
        parts.push(`note: ${noteWhere}`);
        parts.push(noteMessage);
      } else {
        parts.push(`note: ${noteMessage}`);
      }
      if (note.position?.lineText) {
        parts.push(note.position.lineText);
        if (
          typeof note.position.column === "number" &&
          note.position.column > 0
        ) {
          parts.push(`${" ".repeat(Math.max(0, note.position.column - 1))}^`);
        }
      }
    }
  }
  return parts.join("\n");
}
function formatBuildLogs(logs: any[] | undefined | null): string {
  if (!logs || logs.length === 0) return "";
  const formatted = logs.map(formatBuildLog).filter(Boolean).join("\n\n");
  return formatted.trim();
}
function formatPostCSSError(error: any): string {
  if (!error) return "Unknown PostCSS error";
  const parts: string[] = [];
  if (error.name || error.reason || error.message) {
    parts.push(error.reason || error.message || String(error));
  }
  const file = error.file || error.input?.file;
  const line = error.line;
  const column = error.column;
  if (file) {
    if (line != null && column != null) {
      parts.push(`${file}:${line}:${column}`);
    } else if (line != null) {
      parts.push(`${file}:${line}`);
    } else {
      parts.push(file);
    }
  }
  if (error.source && line != null) {
    const sourceLines = String(error.source).split(/\r?\n/);
    const sourceLine = sourceLines[line - 1];
    if (sourceLine) {
      parts.push(sourceLine);
      if (column != null && column > 0) {
        parts.push(`${" ".repeat(Math.max(0, column - 1))}^`);
      }
    }
  }
  if (error.stack && !String(error.stack).includes(parts[0] || "")) {
    parts.push(error.stack);
  }
  return parts.filter(Boolean).join("\n");
}
function formatUnknownError(error: unknown): string {
  if (!error) return "Unknown error";
  const anyError = error as any;
  if (Array.isArray(anyError.logs) && anyError.logs.length > 0) {
    const logs = formatBuildLogs(anyError.logs);
    if (logs) return logs;
  }
  if (anyError.name === "CssSyntaxError" || anyError.reason || anyError.input) {
    return formatPostCSSError(anyError);
  }
  if (error instanceof AggregateError) {
    return error.errors
      .map((item, index) => `Error ${index + 1}:\n${formatUnknownError(item)}`)
      .join("\n\n");
  }
  if (error instanceof Error) {
    return error.stack || error.message;
  }
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}
function makeDetailedError(context: string, error: unknown): Error {
  if (
    error instanceof Error &&
    error.message.startsWith(`[tradjs] ${context}`)
  ) {
    return error;
  }
  const details = formatUnknownError(error);
  return new Error(`[tradjs] ${context} failed\n\n${details}`, {
    cause: error,
  });
}
type BuildOperation = string | { label: string; [key: string]: unknown };
async function runBuildOperation<T>(
  action: BuildOperation,
  fn: () => Promise<T>,
): Promise<T> {
  const label = typeof action === "string" ? action : action.label;
  try {
    const generation = buildGeneration.getStore() ?? cacheGeneration;
    const result = await buildMeasure.measure(
      {
        start: () => label,
        catch: (error: unknown) => {
          throw error;
        },
      },
      () =>
        buildGeneration.run(generation, async () => {
          const value = await fn();
          if (!canPublish()) {
            throw new Error(
              "Build invalidated while running; retry the operation.",
            );
          }
          return value;
        }),
    );
    return result;
  } catch (error) {
    throw makeDetailedError(label, error);
  }
}
async function printBuildLogs(context: string, logs: any[] | undefined | null) {
  if (!logs || logs.length === 0) return;
  for (const log of logs) {
    const formatted = formatBuildLog(log);
    if (!formatted) continue;
    if (log.level === "warning")
      console.warn(`[tradjs] ${context} warning\n${formatted}`);
  }
}
async function runBunBuild(config: BuildConfig, context: string) {
  let result: Awaited<ReturnType<typeof bunBuild>>;
  try {
    result = await serializedBuild(() => bunBuild(config));
  } catch (error) {
    throw makeDetailedError(context, error);
  }
  await printBuildLogs(context, result.logs);
  if ((result as any).success === false) {
    const logs = formatBuildLogs((result as any).logs);
    throw new Error(
      `[tradjs] ${context} failed\n\n${logs || "Bun build returned success=false without logs"}`,
    );
  }
  return result;
}
async function runPostCSS(
  context: string,
  cssContent: string,
  options: Parameters<ReturnType<typeof postcss>["process"]>[1],
) {
  try {
    return await postcss([autoprefixer, tailwind]).process(cssContent, options);
  } catch (error) {
    throw makeDetailedError(context, error);
  }
}
function getTreeFingerprint(entryPath: string): string {
  const hash = new Bun.CryptoHasher("sha256");
  const visited = new Set<string>();
  function walk(filePath: string): void {
    const resolved = normalizeBuildKey(filePath);
    if (visited.has(resolved)) return;
    visited.add(resolved);
    const source = readFileSync(resolved);
    hash.update(resolved).update(source);
    const ext = path.extname(resolved);
    if (![".ts", ".tsx", ".js", ".jsx"].includes(ext)) return;
    const scanner = new Bun.Transpiler({ loader: getLoaderForExt(ext) });
    for (const imp of scanner.scanImports(source.toString("utf8"))) {
      try {
        const dependency = realpathSync(
          Bun.resolveSync(imp.path, path.dirname(resolved)),
        );
        if (!dependency.includes(`${path.sep}node_modules${path.sep}`))
          walk(dependency);
      } catch {
        hash.update(`unresolved:${imp.path}`);
      }
    }
  }
  walk(entryPath);
  for (const name of ["package.json", "tsconfig.json", "bun.lock"]) {
    const file = path.resolve(process.cwd(), name);
    if (existsSync(file)) hash.update(name).update(readFileSync(file));
  }
  return hash.digest("hex");
}
function getLoaderForExt(ext: string): "ts" | "tsx" | "js" | "jsx" {
  switch (ext) {
    case ".tsx":
      return "tsx";
    case ".jsx":
      return "jsx";
    case ".js":
      return "js";
    default:
      return "ts";
  }
}
const buildInFlight = new Map<string, Promise<string>>();
let buildQueue: Promise<void> = Promise.resolve();
async function serializedBuild<T>(fn: () => Promise<T>): Promise<T> {
  const prev = buildQueue;
  let resolve!: () => void;
  buildQueue = new Promise<void>((r) => {
    resolve = r;
  });
  await prev;
  try {
    return await fn();
  } finally {
    resolve();
  }
}
export const clientScriptsUsingReact = new Set<string>();
export function getContentType(ext: string): string {
  switch (ext.toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    case ".ico":
      return "image/x-icon";
    case ".ttf":
      return "font/ttf";
    case ".otf":
      return "font/otf";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    case ".eot":
      return "application/vnd.ms-fontobject";
    case ".css":
      return "text/css";
    case ".js":
      return "text/javascript";
    case ".json":
      return "application/json";
    case ".pdf":
      return "application/pdf";
    case ".mp3":
      return "audio/mpeg";
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    default:
      return "application/octet-stream";
  }
}
let _detectedServerPackages: string[] | null = null;
function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function detectServerOnlyPackages(): string[] {
  if (_detectedServerPackages) return _detectedServerPackages;
  const detected = new Set<string>();
  try {
    const pkgPath = path.resolve(process.cwd(), "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      const configList = pkg?.tradjs?.serverOnly;
      if (Array.isArray(configList)) {
        for (const name of configList) {
          if (typeof name === "string") detected.add(name);
        }
      }
      const deps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
      };
      const nodeModules = path.resolve(process.cwd(), "node_modules");
      for (const depName of Object.keys(deps)) {
        if (depName.startsWith("@types/")) continue;
        try {
          const depPkgPath = path.join(nodeModules, depName, "package.json");
          if (!existsSync(depPkgPath)) continue;
          const depPkg = JSON.parse(readFileSync(depPkgPath, "utf-8"));
          const entry =
            depPkg.main ||
            depPkg.module ||
            depPkg.exports?.["."]?.import ||
            depPkg.exports?.["."]?.default ||
            "index.js";
          const entryPath = path.join(
            nodeModules,
            depName,
            typeof entry === "string" ? entry : "index.js",
          );
          if (existsSync(entryPath)) {
            const content = readFileSync(entryPath, "utf-8");
            if (/\bbun:[a-z]+\b/.test(content)) {
              detected.add(depName);
            }
          }
        } catch {}
      }
    }
  } catch (error) {
    console.warn(
      `[tradjs] Failed to auto-detect server packages:\n${formatUnknownError(error)}`,
    );
  }
  _detectedServerPackages = [...detected];
  return _detectedServerPackages;
}
export async function buildClientScript(clientPath: string): Promise<string> {
  const absolute = normalizeBuildKey(clientPath);
  const cacheKey = `client:${absolute}`;
  const existing = buildInFlight.get(cacheKey);
  if (existing) return existing;
  const promise = runBuildOperation(
    {
      label: "Build client script",
      file: path.basename(absolute),
      result: (outputPath: string) => ({ outputPath }),
    },
    () => _buildClientScriptImpl(absolute, cacheKey),
  );
  buildInFlight.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    if (buildInFlight.get(cacheKey) === promise) buildInFlight.delete(cacheKey);
  }
}
async function _buildClientScriptImpl(
  clientPath: string,
  cacheKey: string,
): Promise<string> {
  if (!isDev && buildCache[cacheKey]) return buildCache[cacheKey].outputPath;
  const fingerprint = isDev ? getTreeFingerprint(clientPath) : "";
  const cached = devMtimeCache.get(cacheKey);
  if (
    isDev &&
    cached?.fingerprint === fingerprint &&
    builtAssets[cached.outputPath]
  )
    return cached.outputPath;
  const source = readFileSync(clientPath, "utf-8");
  const usesReact =
    /\bfrom\s+['"]react(?:-dom)?(?:\/[^'"]*)?['"]/.test(source) ||
    /\brequire\s*\(\s*['"]react/.test(source);
  const clientIndexPath = path.resolve(__dirname, "../client/index.ts");
  const jsxDevRuntimePath = path.resolve(
    __dirname,
    "../client/jsx-dev-runtime.ts",
  );
  const jsxRuntimePath = path.resolve(__dirname, "../client/jsx-runtime.ts");
  const plugins: any[] = [];
  let hasCssDependency = false;
  plugins.push({
    name: "tradjs-css-dependencies",
    setup(builder: any) {
      builder.onLoad({ filter: /\.css$/ }, () => {
        hasCssDependency = true;
      });
    },
  });
  const external: string[] = [];
  const serverOnlyPackages = detectServerOnlyPackages();
  const builtins = new Set(
    builtinModules.map((name) => name.replace(/^node:/, "")),
  );
  plugins.push({
    name: "tradjs-server-boundary",
    setup(builder: any) {
      builder.onResolve({ filter: /.*/ }, (args: any) => {
        const serverOnly =
          args.path === "bun" ||
          /^(node:|bun:)/.test(args.path) ||
          // Bun supplies a browser implementation for bare buffer (used by
          // browser SDKs such as web3.js). Keep this exception narrow: explicit
          // node: imports and all other builtins still cross the server boundary.
          (builtins.has(args.path) && args.path !== "buffer") ||
          serverOnlyPackages.some(
            (pkg) => args.path === pkg || args.path.startsWith(`${pkg}/`),
          );
        if (serverOnly)
          throw new Error(
            `Server-only import "${args.path}" in browser bundle (${args.importer || clientPath}). Move this operation to an API route.`,
          );
      });
    },
  });
  clientScriptsUsingReact.delete(clientPath);
  if (usesReact) {
    external.push(
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "react-dom/client",
    );
    clientScriptsUsingReact.add(clientPath);
  } else {
    plugins.push({
      name: "tradjs-client-jsx-runtime",
      setup(build: any) {
        build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => {
          return { path: jsxRuntimePath };
        });
        build.onResolve({ filter: /^react\/jsx-dev-runtime$/ }, () => {
          return { path: jsxDevRuntimePath };
        });
        build.onResolve({ filter: /^tradjs\/client\/jsx-dev-runtime$/ }, () => {
          return { path: jsxDevRuntimePath };
        });
        build.onResolve({ filter: /^tradjs\/client\/jsx-runtime$/ }, () => {
          return { path: jsxRuntimePath };
        });
        build.onResolve({ filter: /^tradjs\/client$/ }, () => {
          return { path: clientIndexPath };
        });
      },
    });
  }
  plugins.push({
    name: "tradjs-css-modules",
    setup(build: any) {
      build.onResolve({ filter: /\.module\.css$/ }, (args: any) => {
        hasCssDependency = true;
        const resolved = args.importer
          ? path.resolve(path.dirname(args.importer), args.path)
          : path.resolve(args.path);
        return { path: resolved, namespace: "css-module" };
      });
      build.onLoad(
        { filter: /.*/, namespace: "css-module" },
        async (args: any) => {
          try {
            const moduleResult = await buildCSSModule(args.path);
            const mapEntries = Object.entries(moduleResult.classMap)
              .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
              .join(",\n");
            const id =
              "tradjs-cssmod-" +
              new Bun.CryptoHasher("sha256")
                .update(args.path)
                .update(moduleResult.css)
                .digest("hex")
                .slice(0, 16);
            return {
              contents: `
const id = ${JSON.stringify(id)};
if (typeof document !== 'undefined' && !document.getElementById(id)) {
  const style = document.createElement('style');
  style.id = id;
  style.textContent = ${JSON.stringify(moduleResult.css)};
  document.head.appendChild(style);
}
export default { ${mapEntries} };
`,
              loader: "js",
            };
          } catch (error) {
            throw makeDetailedError(`CSS module ${args.path}`, error);
          }
        },
      );
    },
  });
  const result = await runBunBuild(
    {
      entrypoints: [clientPath],
      outdir: undefined,
      target: "browser",
      minify: !isDev,
      sourcemap: isDev ? "linked" : "none",
      external,
      plugins,
      define: {
        "process.env.NODE_ENV": JSON.stringify(
          isDev ? "development" : "production",
        ),
      },
      naming: {
        entry: "[name]-[hash].[ext]",
        chunk: "[name]-[hash].[ext]",
        asset: "[name]-[hash].[ext]",
      },
    },
    `Client bundle ${clientPath}`,
  );
  const mainOutput = result.outputs.find((o) => o.kind === "entry-point");
  if (!mainOutput) {
    throw new Error(
      `[tradjs] Client bundle ${clientPath} failed: no entry-point output found`,
    );
  }
  for (const output of result.outputs) {
    const content = await output.arrayBuffer();
    const outputPath = `/${path.basename(output.path)}`;
    const contentType =
      output.type || getContentType(path.extname(output.path));
    publishAsset(outputPath, { content, contentType });
  }
  const outputPath = `/${path.basename(mainOutput.path)}`;
  cacheOutput(cacheKey, {
    outputPath,
    content: await mainOutput.arrayBuffer(),
  });
  if (canPublish())
    outputAssets.set(
      outputPath,
      result.outputs.map((output) => `/${path.basename(output.path)}`),
    );
  if (isDev && !hasCssDependency && canPublish())
    devMtimeCache.set(cacheKey, { fingerprint, outputPath });
  return outputPath;
}
export async function buildScript(
  filePath: string,
  allExternal = false,
): Promise<string> {
  if (!filePath) {
    throw new Error("File path is required");
  }
  const absolutePath = normalizeBuildKey(filePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Script not found: ${filePath}`);
  }
  const cacheKey = `script:${allExternal}:${absolutePath}`;
  if (!isDev && buildCache[cacheKey]) {
    return buildCache[cacheKey].outputPath;
  }
  const existing = buildInFlight.get(cacheKey);
  if (existing) return existing;
  const promise = runBuildOperation(
    {
      label: "Build script",
      file: path.basename(filePath),
      external: allExternal ? "all" : "dependencies",
      result: (outputPath: string) => ({ outputPath }),
    },
    () => _buildScriptImpl(absolutePath, cacheKey, allExternal),
  );
  buildInFlight.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    if (buildInFlight.get(cacheKey) === promise) buildInFlight.delete(cacheKey);
  }
}
async function _buildScriptImpl(
  absolutePath: string,
  filePath: string,
  allExternal: boolean,
): Promise<string> {
  let packageJson: any;
  try {
    packageJson = (
      await import(path.resolve(process.cwd(), "package.json"), {
        assert: { type: "json" },
      })
    ).default;
  } catch {
    throw new Error("package.json not found");
  }
  const dependencies = { ...(packageJson.dependencies || {}) };
  let external = Object.keys(dependencies);
  if (allExternal) {
    external = ["*"];
  }
  const buildConfig: BuildConfig = {
    entrypoints: [absolutePath],
    outdir: undefined,
    minify: !isDev,
    target: "browser",
    sourcemap: isDev ? "linked" : "none",
    external,
    define: {
      "process.env.NODE_ENV": JSON.stringify(
        isDev ? "development" : "production",
      ),
    },
    naming: {
      entry: "[name]-[hash].[ext]",
      chunk: "[name]-[hash].[ext]",
      asset: "[name]-[hash].[ext]",
    },
  };
  const result = await runBunBuild(buildConfig, `Script bundle ${filePath}`);
  const mainOutput = result.outputs.find((o) => o.kind === "entry-point");
  if (!mainOutput) {
    throw new Error(
      `[tradjs] Script bundle ${filePath} failed: no entry-point output found`,
    );
  }
  for (const output of result.outputs) {
    const content = await output.arrayBuffer();
    const outputPath = `/${path.basename(output.path)}`;
    const contentType =
      output.type || getContentType(path.extname(output.path));
    publishAsset(outputPath, { content, contentType });
  }
  const outputPath = `/${path.basename(mainOutput.path)}`;
  cacheOutput(filePath, {
    outputPath,
    content: await mainOutput.arrayBuffer(),
  });
  if (canPublish())
    outputAssets.set(
      outputPath,
      result.outputs.map((output) => `/${path.basename(output.path)}`),
    );
  return outputPath;
}
export async function buildStyle(filePath: string): Promise<string> {
  if (!filePath) throw new Error("File path is required");
  const absolute = normalizeBuildKey(filePath);
  if (!existsSync(absolute)) throw new Error(`Style not found: ${filePath}`);
  if (!isDev && buildCache[absolute]) return buildCache[absolute].outputPath;
  const existing = buildInFlight.get(absolute);
  if (existing) return existing;
  const promise = runBuildOperation(
    {
      label: "Build style",
      file: path.basename(absolute),
      result: (outputPath: string) => ({ outputPath }),
    },
    () => _buildStyleImpl(absolute, absolute),
  );
  buildInFlight.set(absolute, promise);
  try {
    return await promise;
  } finally {
    if (buildInFlight.get(absolute) === promise) buildInFlight.delete(absolute);
  }
}
async function _buildStyleImpl(
  absolutePath: string,
  filePath: string,
): Promise<string> {
  const ext = path.extname(absolutePath).toLowerCase();
  const baseName = path.basename(absolutePath, ext);
  const cssContent = await Bun.file(absolutePath).text();
  const result = await runPostCSS(`Style ${absolutePath}`, cssContent, {
    from: absolutePath,
    to: "style.css",
    map: isDev ? { inline: false, annotation: false } : false,
  });
  let finalCss = result.css;
  const hash = new Bun.CryptoHasher("sha256")
    .update(finalCss)
    .digest("hex")
    .slice(0, 8);
  const outputPath = `/${baseName}-${hash}.css`;
  const contentType = "text/css";
  if (isDev && result.map) {
    const sourceMapPath = `${outputPath}.map`;
    const sourceMapContent = result.map.toString();
    publishAsset(sourceMapPath, {
      content: new TextEncoder().encode(sourceMapContent).buffer as ArrayBuffer,
      contentType: "application/json",
    });
    finalCss += `\n/*# sourceMappingURL=${path.basename(sourceMapPath)} */`;
  }
  const content = new TextEncoder().encode(finalCss).buffer as ArrayBuffer;
  if (canPublish())
    outputAssets.set(
      outputPath,
      isDev && result.map ? [outputPath, `${outputPath}.map`] : [outputPath],
    );
  cacheOutput(filePath, { outputPath, content });
  publishAsset(outputPath, { content, contentType });
  return outputPath;
}
function isInsideKeyframes(rule: any): boolean {
  let parent = rule?.parent;
  while (parent) {
    if (
      parent.type === "atrule" &&
      typeof parent.name === "string" &&
      /(?:^|-)keyframes$/i.test(parent.name)
    ) {
      return true;
    }
    parent = parent.parent;
  }
  return false;
}
export async function buildScopedStyle(
  filePath: string,
  routePattern: string,
): Promise<string> {
  const absolutePath = normalizeBuildKey(filePath);
  const cacheKey = `scoped:${JSON.stringify([absolutePath, routePattern])}`;
  if (!isDev && buildCache[cacheKey]) {
    return buildCache[cacheKey].outputPath;
  }
  const existing = buildInFlight.get(cacheKey);
  if (existing) return existing;
  const promise = runBuildOperation(
    {
      label: "Build scoped style",
      route: routePattern,
      file: path.basename(filePath),
      result: (outputPath: string) => ({ outputPath }),
    },
    () => _buildScopedStyleImpl(absolutePath, routePattern, cacheKey),
  );
  buildInFlight.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    if (buildInFlight.get(cacheKey) === promise) buildInFlight.delete(cacheKey);
  }
}
async function _buildScopedStyleImpl(
  filePath: string,
  routePattern: string,
  cacheKey: string,
): Promise<string> {
  const absolutePath = path.resolve(process.cwd(), filePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Scoped CSS not found: ${filePath}`);
  }
  const ext = path.extname(absolutePath).toLowerCase();
  const baseName = path.basename(absolutePath, ext);
  const scopeSlug =
    routePattern
      .replace(/^\//, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "root";
  const cssContent = await Bun.file(absolutePath).text();
  const result = await runPostCSS(
    `Scoped CSS ${absolutePath} for ${routePattern}`,
    cssContent,
    {
      from: absolutePath,
      to: "style.css",
      map: false,
    },
  );
  const scopedRoot = postcss.parse(result.css || "", { from: absolutePath });
  scopedRoot.walkRules((rule) => {
    if (isInsideKeyframes(rule)) return;
    rule.selector = scopeSelectorList(rule.selector, routePattern);
  });
  const finalCss = scopedRoot.toString();
  const hash = new Bun.CryptoHasher("sha256")
    .update(finalCss)
    .digest("hex")
    .slice(0, 8);
  const outputPath = `/${baseName}-${scopeSlug}-${hash}.css`;
  const content = new TextEncoder().encode(finalCss).buffer as ArrayBuffer;
  cacheOutput(cacheKey, { outputPath, content });
  publishAsset(outputPath, { content, contentType: "text/css" });
  return outputPath;
}
export interface CSSModuleResult {
  css: string;
  classMap: Record<string, string>;
  cssUrl: string;
}
const cssModuleCache = new Map<string, CSSModuleResult>();
export async function buildCSSModule(
  filePath: string,
): Promise<CSSModuleResult> {
  return runBuildOperation(
    {
      label: "Build CSS module",
      file: path.basename(filePath),
      result: (value: CSSModuleResult) => ({ cssUrl: value.cssUrl }),
    },
    () => buildCSSModuleImpl(filePath),
  );
}
async function buildCSSModuleImpl(filePath: string): Promise<CSSModuleResult> {
  const absolutePath = path.resolve(process.cwd(), filePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`CSS module not found: ${filePath}`);
  }
  if (!isDev) {
    const cached = cssModuleCache.get(absolutePath);
    if (cached) return cached;
  }
  const rawCss = await Bun.file(absolutePath).text();
  const fileHash = new Bun.CryptoHasher("sha256")
    .update(absolutePath)
    .digest("hex")
    .slice(0, 8);
  const classMap: Record<string, string> = Object.create(null);
  const moduleRoot = postcss.parse(rawCss, { from: absolutePath });
  moduleRoot.walkRules((rule) => {
    if (isInsideKeyframes(rule)) return;
    const rewritten = rewriteClassSelectors(rule.selector, (original) => {
      const scoped = classMap[original] ?? `${original}_${fileHash}`;
      classMap[original] = scoped;
      return scoped;
    });
    rule.selector = rewritten.selector;
  });
  const processed = await runPostCSS(
    `CSS module ${absolutePath}`,
    moduleRoot.toString(),
    {
      from: absolutePath,
      to: "style.css",
      map: false,
    },
  );
  const css = processed.css || "";
  const cssHash = new Bun.CryptoHasher("sha256")
    .update(css)
    .digest("hex")
    .slice(0, 8);
  const baseName = path.basename(absolutePath, ".module.css");
  const cssUrl = `/${baseName}-module-${cssHash}.css`;
  const content = new TextEncoder().encode(css).buffer as ArrayBuffer;
  publishAsset(cssUrl, { content, contentType: "text/css" });
  const result: CSSModuleResult = {
    css,
    classMap,
    cssUrl,
  };
  if (canPublish()) cssModuleCache.set(absolutePath, result);
  return result;
}
export async function buildAsset(file?: BunFile): Promise<string> {
  if (!file) return "";
  const name = (file as any).name || "";
  const filePath = name ? normalizeBuildKey(name) : "";
  if (!filePath) {
    throw new Error("BunFile object must have a name property");
  }
  if (!existsSync(filePath)) {
    throw new Error(`Asset not found: ${filePath}`);
  }
  const cacheKey = `asset:${filePath}`;
  if (!isDev && buildCache[cacheKey]) {
    return buildCache[cacheKey].outputPath;
  }
  const existing = buildInFlight.get(cacheKey);
  if (existing) return existing;
  const promise = runBuildOperation(
    {
      label: "Build asset",
      file: path.basename(filePath),
      result: (outputPath: string) => ({ outputPath }),
    },
    () => _buildAssetImpl(file, filePath, cacheKey),
  );
  buildInFlight.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    if (buildInFlight.get(cacheKey) === promise) buildInFlight.delete(cacheKey);
  }
}
async function _buildAssetImpl(
  file: BunFile,
  filePath: string,
  cacheKey: string,
): Promise<string> {
  const bytes = await file.arrayBuffer();
  const hash = new Bun.CryptoHasher("sha256")
    .update(bytes)
    .digest("hex")
    .slice(0, 8);
  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext);
  const outputPath = `/${baseName}-${hash}${ext}`;
  const contentType = file.type || getContentType(ext);
  const content = bytes;
  cacheOutput(cacheKey, { outputPath, content });
  publishAsset(outputPath, { content, contentType });
  return outputPath;
}
export async function asset(fileOrPath: BunFile | string): Promise<string> {
  console.warn(
    "asset() is deprecated. Use buildScript(), buildStyle(), or buildAsset() instead.",
  );
  if (typeof fileOrPath === "string") {
    const ext = path.extname(fileOrPath).toLowerCase();
    if (ext === ".css") {
      return buildStyle(fileOrPath);
    }
    if (ext === ".js" || ext === ".ts" || ext === ".jsx" || ext === ".tsx") {
      return buildScript(fileOrPath);
    }
    const file = Bun.file(fileOrPath);
    return buildAsset(file);
  }
  return buildAsset(fileOrPath);
}
export function clearCaches() {
  cacheGeneration++;
  cssModuleCache.clear();
  outputAssets.clear();
  Object.keys(buildCache).forEach((key) => delete buildCache[key]);
  Object.keys(builtAssets).forEach((key) => delete builtAssets[key]);
  devMtimeCache.clear();
  buildInFlight.clear();
  clientScriptsUsingReact.clear();
  _detectedServerPackages = null;
}
