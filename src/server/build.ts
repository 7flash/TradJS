/**
 * Asset Build Pipeline
 *
 * Handles building JavaScript, TypeScript, CSS, and static assets
 * with caching, deduplication, and content-type detection.
 */

import { build as bunBuild, type BuildConfig, type BunFile } from "bun";
import path from "path";
import { existsSync, readFileSync } from "fs";
import autoprefixer from "autoprefixer";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { buildMeasure } from './measure';

const isDev = process.env.NODE_ENV !== "production";
const { measure } = buildMeasure;

// ─── In-Memory Caches ──────────────────────────────────────────────────────────

export const buildCache: Record<string, { outputPath: string; content: ArrayBuffer }> = {};
export const builtAssets: Record<string, { content: ArrayBuffer; contentType: string }> = {};

// Dev-mode mtime cache — only rebuild when source files actually change.
//
// IMPORTANT: For bundled scripts/client scripts, we track the MAX mtime
// across the entire dependency tree, not just the entry file.
const devMtimeCache = new Map<string, { mtime: number; outputPath: string }>();

function normalizeBuildKey(filePath: string): string {
    return path.resolve(process.cwd(), filePath);
}

// ─── Error Formatting / measure-fn Safe Wrapper ────────────────────────────────

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

                if (typeof note.position.column === "number" && note.position.column > 0) {
                    parts.push(`${" ".repeat(Math.max(0, note.position.column - 1))}^`);
                }
            }
        }
    }

    return parts.join("\n");
}

function formatBuildLogs(logs: any[] | undefined | null): string {
    if (!logs || logs.length === 0) return "";

    const formatted = logs
        .map(formatBuildLog)
        .filter(Boolean)
        .join("\n\n");

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
    if (error instanceof Error && error.message.startsWith(`[tradjs] ${context}`)) {
        return error;
    }

    const details = formatUnknownError(error);
    return new Error(`[tradjs] ${context} failed\n\n${details}`);
}

/**
 * Build steps should fail fast. The new measure-fn throws by default,
 * so measurement no longer changes build error semantics.
 */
async function measured<T>(label: string, fn: () => Promise<T>): Promise<T> {
    try {
        return await measure(label, fn);
    } catch (error) {
        throw makeDetailedError(label, error);
    }
}

function printBuildLogs(context: string, logs: any[] | undefined | null) {
    if (!logs || logs.length === 0) return;

    for (const log of logs) {
        const formatted = formatBuildLog(log);
        if (!formatted) continue;

        if (log.level === "error") {
            console.error(`[tradjs Build Error] ${context}\n${formatted}`);
        } else if (log.level === "warning") {
            console.warn(`[tradjs Build Warning] ${context}\n${formatted}`);
        }
    }
}

async function runBunBuild(config: BuildConfig, context: string) {
    let result: Awaited<ReturnType<typeof bunBuild>>;

    try {
        result = await serializedBuild(() => bunBuild(config));
    } catch (error) {
        throw makeDetailedError(context, error);
    }

    printBuildLogs(context, (result as any).logs);

    if ((result as any).success === false) {
        const logs = formatBuildLogs((result as any).logs);
        throw new Error(
            `[tradjs] ${context} failed\n\n${logs || "Bun build returned success=false without logs"}`
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
        return await serializedBuild(() =>
            postcss([autoprefixer, tailwind]).process(cssContent, options)
        );
    } catch (error) {
        throw makeDetailedError(context, error);
    }
}

// ─── Import Tree Mtime Scanner ─────────────────────────────────────────────────

/**
 * Recursively scan all local imports from an entry file and return
 * the maximum mtime across the entire dependency tree.
 */
function getTreeMtime(entryPath: string): number {
    const visited = new Set<string>();
    let maxMtime = 0;

    function walk(filePath: string) {
        const resolved = path.resolve(filePath);
        if (visited.has(resolved)) return;
        visited.add(resolved);

        try {
            const stat = Bun.file(resolved);
            const mtime = stat.lastModified || 0;
            if (mtime > maxMtime) maxMtime = mtime;

            const ext = path.extname(resolved);
            if (![".ts", ".tsx", ".js", ".jsx"].includes(ext)) return;

            const source = readFileSync(resolved, "utf-8");
            const transpiler = new Bun.Transpiler({ loader: getLoaderForExt(ext) });
            const imports = transpiler.scanImports(source);

            for (const imp of imports) {
                const importPath = imp.path;

                if (!importPath.startsWith(".") && !importPath.startsWith("/")) continue;

                const baseDir = path.dirname(resolved);
                const candidates = [
                    path.resolve(baseDir, importPath),
                    path.resolve(baseDir, importPath + ".ts"),
                    path.resolve(baseDir, importPath + ".tsx"),
                    path.resolve(baseDir, importPath + ".js"),
                    path.resolve(baseDir, importPath + ".jsx"),
                    path.resolve(baseDir, importPath, "index.ts"),
                    path.resolve(baseDir, importPath, "index.tsx"),
                    path.resolve(baseDir, importPath, "index.js"),
                    path.resolve(baseDir, importPath, "index.jsx"),
                ];

                for (const candidate of candidates) {
                    if (existsSync(candidate)) {
                        walk(candidate);
                        break;
                    }
                }
            }
        } catch {
            // Ignore unreadable/missing files.
        }
    }

    walk(entryPath);
    return maxMtime;
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

// Build deduplication — prevent concurrent builds of the same file.
const buildInFlight = new Map<string, Promise<string>>();

// Global build serializer — prevents concurrent Bun builds + PostCSS from
// overwhelming the process on rapid navigation.
let buildQueue: Promise<any> = Promise.resolve();

async function serializedBuild<T>(fn: () => Promise<T>): Promise<T> {
    const prev = buildQueue;

    let resolve!: () => void;
    buildQueue = new Promise<void>(r => {
        resolve = r;
    });

    await prev;

    try {
        return await fn();
    } finally {
        resolve();
    }
}

// Track which client scripts need React import maps.
export const clientScriptsUsingReact = new Set<string>();

// ─── Content Type Detection ────────────────────────────────────────────────────

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

// ─── Server-Only Package Detection ─────────────────────────────────────────────

let _detectedServerPackages: string[] | null = null;

function escapeRegExp(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Auto-detect server-only packages from the current app only.
 * Reads explicit `tradjs.serverOnly` config and scans installed deps for `bun:*` imports.
 */
function detectServerOnlyPackages(): string[] {
    if (_detectedServerPackages) return _detectedServerPackages;

    const detected = new Set<string>();

    try {
        const pkgPath = path.resolve(process.cwd(), "package.json");

        if (existsSync(pkgPath)) {
            const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
            const configList = pkg?.tradjs?.serverOnly ?? pkg?.fastjs?.serverOnly ?? pkg?.lastjs?.serverOnly ?? pkg?.melina?.serverOnly;

            if (Array.isArray(configList)) {
                for (const name of configList) {
                    if (typeof name === "string") detected.add(name);
                }
            }

            const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
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
                } catch {
                    // Skip packages that cannot be scanned.
                }
            }
        }
    } catch (error) {
        console.warn(
            `[tradjs] Failed to auto-detect server packages:\n${formatUnknownError(error)}`
        );
    }

    _detectedServerPackages = [...detected];

    return _detectedServerPackages;
}

// ─── Client Script Builder ─────────────────────────────────────────────────────

/**
 * Build a client mount script (.client.tsx).
 *
 * If the client script imports from React, React is externalized and resolved
 * through import maps.
 */
export async function buildClientScript(clientPath: string): Promise<string> {
    const cacheKey = normalizeBuildKey(clientPath);

    const existing = buildInFlight.get(cacheKey);
    if (existing) return existing;

    const promise = (async () => {
        try {
            return await measured(
                `Client: ${path.basename(clientPath)}`,
                () => _buildClientScriptImpl(cacheKey),
            );
        } catch (error) {
            const cached = buildCache[cacheKey];

            if (cached) {
                console.error(
                    `[tradjs] Client build failed for ${clientPath}; using cached version.\n\n${formatUnknownError(error)}`
                );

                return cached.outputPath;
            }

            throw error;
        }
    })();

    buildInFlight.set(cacheKey, promise);

    try {
        return await promise;
    } finally {
        buildInFlight.delete(cacheKey);
    }
}

async function _buildClientScriptImpl(clientPath: string): Promise<string> {
    if (!isDev && buildCache[clientPath]) {
        return buildCache[clientPath].outputPath;
    }

    if (isDev) {
        try {
            const treeMtime = getTreeMtime(clientPath);
            const cached = devMtimeCache.get(clientPath);

            if (cached && cached.mtime === treeMtime) {
                return cached.outputPath;
            }
        } catch {
            // stat failed, rebuild.
        }
    }

    const source = readFileSync(clientPath, "utf-8");

    const usesReact =
        /\bfrom\s+['"]react(?:-dom)?(?:\/[^'"]*)?['"]/.test(source) ||
        /\brequire\s*\(\s*['"]react/.test(source);

    const clientIndexPath = path.resolve(__dirname, "../client/index.ts");
    const jsxDevRuntimePath = path.resolve(__dirname, "../client/jsx-dev-runtime.ts");
    const jsxRuntimePath = path.resolve(__dirname, "../client/jsx-runtime.ts");

    const plugins: any[] = [];

    const external: string[] = [
        "bun",
        "bun:sqlite",
        "bun:ffi",
        "bun:test",
        "bun:jsc",

        "node:fs",
        "node:path",
        "node:crypto",
        "node:os",
        "node:child_process",
        "node:net",
        "node:http",
        "node:https",
        "node:stream",
        "node:url",
        "node:util",
        "node:events",
        "node:buffer",
        "node:assert",

        "fs",
        "path",
        "crypto",
        "os",
        "child_process",
        "net",
        "http",
        "https",
    ];

    const serverOnlyPackages = detectServerOnlyPackages();
    const matchedServerPackages = new Set<string>();

    if (serverOnlyPackages.length > 0) {
        plugins.push({
            name: "tradjs-server-stub",

            setup(build: any) {
                const filter = new RegExp(
                    `^(${serverOnlyPackages.map(escapeRegExp).join("|")})(/.*)?$`
                );

                build.onResolve({ filter }, (args: any) => {
                    const matchedPackage = serverOnlyPackages.find(
                        pkg => args.path === pkg || args.path.startsWith(`${pkg}/`)
                    );

                    if (matchedPackage) {
                        matchedServerPackages.add(matchedPackage);
                    }

                    return { path: args.path, namespace: "server-stub" };
                });

                build.onLoad({ filter: /.*/, namespace: "server-stub" }, () => {
                    return {
                        contents: `
const handler = {
    get: (_, p) => (
        p === Symbol.toPrimitive
            ? () => ''
            : typeof p === 'string'
                ? new Proxy(() => {}, handler)
                : undefined
    ),
};

const stub = new Proxy(() => {}, handler);

export default stub;
export const Database = stub;
export const z = stub;
export const TelegramClient = stub;
export const StringSession = stub;
export { stub as Api, stub as sessions };
`,
                        loader: "js",
                    };
                });
            },
        });
    }

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

                build.onResolve({ filter: /^(tradjs|fastjs|lastjs|melina)\/client\/jsx-dev-runtime$/ }, () => {
                    return { path: jsxDevRuntimePath };
                });

                build.onResolve({ filter: /^(tradjs|fastjs|lastjs|melina)\/client\/jsx-runtime$/ }, () => {
                    return { path: jsxRuntimePath };
                });

                build.onResolve({ filter: /^(tradjs|fastjs|lastjs|melina)\/client$/ }, () => {
                    return { path: clientIndexPath };
                });
            },
        });
    }

    plugins.push({
        name: "tradjs-css-modules",

        setup(build: any) {
            build.onResolve({ filter: /\.module\.css$/ }, (args: any) => {
                const resolved = args.importer
                    ? path.resolve(path.dirname(args.importer), args.path)
                    : path.resolve(args.path);

                return { path: resolved, namespace: "css-module" };
            });

            build.onLoad({ filter: /.*/, namespace: "css-module" }, async (args: any) => {
                try {
                    const moduleResult = await buildCSSModule(args.path);

                    const mapEntries = Object.entries(moduleResult.classMap)
                        .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
                        .join(",\n");

                    const escapedCss = moduleResult.css
                        .replace(/\\/g, "\\\\")
                        .replace(/`/g, "\\`")
                        .replace(/\$/g, "\\$");

                    return {
                        contents: `
// CSS Module: ${path.basename(args.path)}
const id = ${JSON.stringify("cssmod-" + path.basename(args.path, ".module.css"))};

if (typeof document !== 'undefined' && !document.querySelector(\`style[data-cssmod="\${id}"]\`)) {
    const style = document.createElement('style');
    style.setAttribute('data-cssmod', id);
    style.textContent = \`${escapedCss}\`;
    document.head.appendChild(style);
}

export default {
${mapEntries}
};
`,
                        loader: "js",
                    };
                } catch (error) {
                    throw makeDetailedError(`CSS module ${args.path}`, error);
                }
            });
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
                "process.env.NODE_ENV": JSON.stringify(isDev ? "development" : "production"),
            },
            naming: {
                entry: "[name]-[hash].[ext]",
                chunk: "[name]-[hash].[ext]",
                asset: "[name]-[hash].[ext]",
            },
        },
        `Client bundle ${clientPath}`,
    );

    const mainOutput = result.outputs.find(o => o.kind === "entry-point");

    if (!mainOutput) {
        throw new Error(`[tradjs] Client bundle ${clientPath} failed: no entry-point output found`);
    }

    for (const output of result.outputs) {
        const content = await output.arrayBuffer();
        const outputPath = `/${path.basename(output.path)}`;
        const contentType = output.type || getContentType(path.extname(output.path));

        builtAssets[outputPath] = { content, contentType };
    }

    const outputPath = `/${path.basename(mainOutput.path)}`;

    buildCache[clientPath] = {
        outputPath,
        content: await mainOutput.arrayBuffer(),
    };

    if (isDev) {
        try {
            const treeMtime = getTreeMtime(clientPath);
            devMtimeCache.set(clientPath, { mtime: treeMtime, outputPath });
        } catch {
            // ok
        }

        if (matchedServerPackages.size > 0) {
            console.warn(
                `[tradjs] Server-only packages stubbed for browser: ${[...matchedServerPackages].sort().join(", ")}`
            );
        }
    }

    return outputPath;
}

// ─── Script Builder ────────────────────────────────────────────────────────────

/**
 * Build JavaScript/TypeScript files using Bun's bundler.
 */
export async function buildScript(filePath: string, allExternal = false): Promise<string> {
    if (!filePath) {
        throw new Error("File path is required");
    }

    const absolutePath = normalizeBuildKey(filePath);

    if (!existsSync(absolutePath)) {
        throw new Error(`Script not found: ${filePath}`);
    }

    if (!isDev && buildCache[absolutePath]) {
        return buildCache[absolutePath].outputPath;
    }

    const existing = buildInFlight.get(absolutePath);
    if (existing) return existing;

    const promise = measured(
        `Script: ${path.basename(filePath)}`,
        () => _buildScriptImpl(absolutePath, absolutePath, allExternal),
    );

    buildInFlight.set(absolutePath, promise);

    try {
        return await promise;
    } finally {
        buildInFlight.delete(absolutePath);
    }
}

async function _buildScriptImpl(
    absolutePath: string,
    filePath: string,
    allExternal: boolean,
): Promise<string> {
    let packageJson: any;

    try {
        packageJson = (await import(path.resolve(process.cwd(), "package.json"), {
            assert: { type: "json" },
        })).default;
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
            "process.env.NODE_ENV": JSON.stringify(isDev ? "development" : "production"),
        },
        naming: {
            entry: "[name]-[hash].[ext]",
            chunk: "[name]-[hash].[ext]",
            asset: "[name]-[hash].[ext]",
        },
    };

    const result = await runBunBuild(buildConfig, `Script bundle ${filePath}`);

    const mainOutput = result.outputs.find(o => o.kind === "entry-point");

    if (!mainOutput) {
        throw new Error(`[tradjs] Script bundle ${filePath} failed: no entry-point output found`);
    }

    for (const output of result.outputs) {
        const content = await output.arrayBuffer();
        const outputPath = `/${path.basename(output.path)}`;
        const contentType = output.type || getContentType(path.extname(output.path));

        builtAssets[outputPath] = { content, contentType };
    }

    const outputPath = `/${path.basename(mainOutput.path)}`;

    buildCache[filePath] = {
        outputPath,
        content: await mainOutput.arrayBuffer(),
    };

    return outputPath;
}

// ─── Style Builder ─────────────────────────────────────────────────────────────

/**
 * Build CSS files with PostCSS processing.
 */
export async function buildStyle(filePath: string): Promise<string> {
    if (!filePath) {
        throw new Error("File path is required");
    }

    const absolutePath = normalizeBuildKey(filePath);

    if (!existsSync(absolutePath)) {
        throw new Error(`Style not found: ${filePath}`);
    }

    if (!isDev && buildCache[absolutePath]) {
        return buildCache[absolutePath].outputPath;
    }

    const existing = buildInFlight.get(absolutePath);
    if (existing) return existing;

    const promise = (async () => {
        try {
            return await measured(
                `Style: ${path.basename(filePath)}`,
                () => _buildStyleImpl(absolutePath, absolutePath),
            );
        } catch (error) {
            const cached = buildCache[absolutePath];

            if (cached) {
                console.error(
                    `[tradjs] Style build failed for ${filePath}; using cached version.\n\n${formatUnknownError(error)}`
                );

                return cached.outputPath;
            }

            throw error;
        }
    })();

    buildInFlight.set(absolutePath, promise);

    try {
        return await promise;
    } finally {
        buildInFlight.delete(absolutePath);
    }
}

async function _buildStyleImpl(absolutePath: string, filePath: string): Promise<string> {
    if (isDev) {
        try {
            const stat = Bun.file(absolutePath);
            const mtime = (await stat.stat?.())?.mtimeMs ?? stat.lastModified;
            const cached = devMtimeCache.get(absolutePath);

            if (cached && cached.mtime === mtime) {
                return cached.outputPath;
            }
        } catch {
            // stat failed, rebuild.
        }
    }

    const ext = path.extname(absolutePath).toLowerCase();
    const baseName = path.basename(absolutePath, ext);

    const cssContent = await Bun.file(absolutePath).text();

    const result = await runPostCSS(
        `Style ${absolutePath}`,
        cssContent,
        {
            from: absolutePath,
            to: "style.css",
            map: isDev ? { inline: false } : false,
        },
    );

    if (!result.css) {
        throw new Error(`PostCSS processing returned empty CSS for ${absolutePath}`);
    }

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

        builtAssets[sourceMapPath] = {
            content: new TextEncoder().encode(sourceMapContent).buffer as ArrayBuffer,
            contentType: "application/json",
        };

        finalCss += `\n/*# sourceMappingURL=${path.basename(sourceMapPath)} */`;
    }

    const content = new TextEncoder().encode(finalCss).buffer as ArrayBuffer;

    buildCache[filePath] = { outputPath, content };
    builtAssets[outputPath] = { content, contentType };

    if (isDev) {
        try {
            const stat = Bun.file(absolutePath);
            const mtime = (await stat.stat?.())?.mtimeMs ?? stat.lastModified;

            devMtimeCache.set(absolutePath, { mtime, outputPath });
        } catch {
            // ok
        }
    }

    return outputPath;
}

// ─── Scoped CSS Builder ────────────────────────────────────────────────────────

/**
 * Build route-scoped CSS.
 */
export async function buildScopedStyle(filePath: string, routePattern: string): Promise<string> {
    const cacheKey = `scoped:${filePath}:${routePattern}`;

    if (!isDev && buildCache[cacheKey]) {
        return buildCache[cacheKey].outputPath;
    }

    const existing = buildInFlight.get(cacheKey);
    if (existing) return existing;

    const promise = measured(
        `Scoped CSS: ${routePattern}`,
        () => _buildScopedStyleImpl(filePath, routePattern, cacheKey),
    );

    buildInFlight.set(cacheKey, promise);

    try {
        return await promise;
    } finally {
        buildInFlight.delete(cacheKey);
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

    if (isDev) {
        try {
            const stat = Bun.file(absolutePath);
            const mtime = (await stat.stat?.())?.mtimeMs ?? stat.lastModified;
            const cached = devMtimeCache.get(cacheKey);

            if (cached && cached.mtime === mtime) {
                return cached.outputPath;
            }
        } catch {
            // rebuild
        }
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

    const finalCss = result.css || "";

    const hash = new Bun.CryptoHasher("sha256")
        .update(finalCss)
        .digest("hex")
        .slice(0, 8);

    const outputPath = `/${baseName}-${scopeSlug}-${hash}.css`;
    const content = new TextEncoder().encode(finalCss).buffer as ArrayBuffer;

    buildCache[cacheKey] = { outputPath, content };
    builtAssets[outputPath] = { content, contentType: "text/css" };

    if (isDev) {
        try {
            const stat = Bun.file(absolutePath);
            const mtime = (await stat.stat?.())?.mtimeMs ?? stat.lastModified;

            devMtimeCache.set(cacheKey, { mtime, outputPath });
        } catch {
            // ok
        }
    }

    return outputPath;
}

// ─── CSS Modules Builder ───────────────────────────────────────────────────────

export interface CSSModuleResult {
    css: string;
    classMap: Record<string, string>;
    cssUrl: string;
}

const cssModuleCache = new Map<string, CSSModuleResult>();

/**
 * Build a .module.css file:
 * 1. Processes CSS through PostCSS/Tailwind
 * 2. Hashes class selectors
 * 3. Returns processed CSS + class name mapping + built asset URL
 */
export async function buildCSSModule(filePath: string): Promise<CSSModuleResult> {
    const absolutePath = path.resolve(process.cwd(), filePath);

    if (!existsSync(absolutePath)) {
        throw new Error(`CSS module not found: ${filePath}`);
    }

    if (isDev) {
        try {
            const stat = Bun.file(absolutePath);
            const mtime = (await stat.stat?.())?.mtimeMs ?? stat.lastModified;
            const cached = cssModuleCache.get(absolutePath);

            if (cached) {
                const devCached = devMtimeCache.get(`cssmod:${absolutePath}`);

                if (devCached && devCached.mtime === mtime) {
                    return cached;
                }
            }
        } catch {
            // rebuild
        }
    } else {
        const cached = cssModuleCache.get(absolutePath);
        if (cached) return cached;
    }

    const rawCss = await Bun.file(absolutePath).text();

    const processed = await runPostCSS(
        `CSS module ${absolutePath}`,
        rawCss,
        {
            from: absolutePath,
            to: "style.css",
            map: false,
        },
    );

    let css = processed.css || "";

    const classRegex = /\.([A-Za-z_][A-Za-z0-9_-]*)/g;
    const classNames = new Set<string>();

    let match: RegExpExecArray | null;

    while ((match = classRegex.exec(css)) !== null) {
        const name = match[1];

        if (name === "css") continue;

        classNames.add(name);
    }

    const fileHash = new Bun.CryptoHasher("sha256")
        .update(absolutePath)
        .digest("hex")
        .slice(0, 8);

    const classMap: Record<string, string> = {};

    for (const original of classNames) {
        classMap[original] = `${original}_${fileHash}`;
    }

    for (const [original, scoped] of Object.entries(classMap)) {
        const selectorRegex = new RegExp(`\\.${original}(?![A-Za-z0-9_-])`, "g");
        css = css.replace(selectorRegex, `.${scoped}`);
    }

    const cssHash = new Bun.CryptoHasher("sha256")
        .update(css)
        .digest("hex")
        .slice(0, 8);

    const baseName = path.basename(absolutePath, ".module.css");
    const cssUrl = `/${baseName}-module-${cssHash}.css`;
    const content = new TextEncoder().encode(css).buffer as ArrayBuffer;

    builtAssets[cssUrl] = {
        content,
        contentType: "text/css",
    };

    const result: CSSModuleResult = {
        css,
        classMap,
        cssUrl,
    };

    cssModuleCache.set(absolutePath, result);

    if (isDev) {
        try {
            const stat = Bun.file(absolutePath);
            const mtime = (await stat.stat?.())?.mtimeMs ?? stat.lastModified;

            devMtimeCache.set(`cssmod:${absolutePath}`, {
                mtime,
                outputPath: cssUrl,
            });
        } catch {
            // ok
        }
    }

    return result;
}

// ─── Static Asset Builder ──────────────────────────────────────────────────────

/**
 * Build a static asset by storing it in memory with a hashed URL.
 */
export async function buildAsset(file?: BunFile): Promise<string> {
    if (!file) return "";

    const filePath = (file as any).name || "";

    if (!filePath) {
        throw new Error("BunFile object must have a name property");
    }

    if (!existsSync(filePath)) {
        throw new Error(`Asset not found: ${filePath}`);
    }

    if (!isDev && buildCache[filePath]) {
        return buildCache[filePath].outputPath;
    }

    const existing = buildInFlight.get(filePath);
    if (existing) return existing;

    const promise = measured(
        `Asset: ${path.basename(filePath)}`,
        () => _buildAssetImpl(file, filePath),
    );

    buildInFlight.set(filePath, promise);

    try {
        return await promise;
    } finally {
        buildInFlight.delete(filePath);
    }
}

async function _buildAssetImpl(file: BunFile, filePath: string): Promise<string> {
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

    buildCache[filePath] = { outputPath, content };
    builtAssets[outputPath] = { content, contentType };

    return outputPath;
}

/**
 * @deprecated Use buildScript(), buildStyle(), or buildAsset() instead.
 */
export async function asset(fileOrPath: BunFile | string): Promise<string> {
    console.warn("asset() is deprecated. Use buildScript(), buildStyle(), or buildAsset() instead.");

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

// ─── Cache Management ──────────────────────────────────────────────────────────

export function clearCaches() {
    Object.keys(buildCache).forEach(key => delete buildCache[key]);
    Object.keys(builtAssets).forEach(key => delete builtAssets[key]);
    devMtimeCache.clear();
    buildInFlight.clear();
    clientScriptsUsingReact.clear();
    _detectedServerPackages = null;
}