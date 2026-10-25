import path from "path";
import { existsSync, mkdirSync, writeFileSync, lstatSync } from "node:fs";
import {
  builtAssets,
  buildClientScript,
  buildStyle,
  buildScopedStyle,
  getBuiltAssetPaths,
} from "./build";
import { resolveAppDir } from "./app-router";
import { discoverRoutes } from "./router";
import { clientCompanionPath, styleCompanionPath } from "./conventions";
import { cliBuildMeasure } from "./measure";
export interface BuildOptions {
  outDir?: string;
  appDir?: string;
  globalCss?: string;
  entries?: string[];
}
type BuildInput = {
  kind: "client" | "style";
  filePath: string;
  role:
    "entry" | "global-style" | "page-client" | "layout-client" | "page-style";
  route?: string;
};
interface BuildSummary {
  inputCount: number;
  assetCount: number;
  totalBytes: number;
  outDir: string;
}
function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${bytes}B`;
}
function addBuildInput(
  inputs: Map<string, BuildInput>,
  input: BuildInput,
): void {
  const resolved = path.resolve(input.filePath);
  if (!existsSync(resolved) || inputs.has(resolved)) return;
  inputs.set(resolved, { ...input, filePath: resolved });
}
function collectAppBuildInputs(
  appDir: string,
  globalCss: string | null,
): BuildInput[] {
  const inputs = new Map<string, BuildInput>();
  if (globalCss) {
    addBuildInput(inputs, {
      kind: "style",
      filePath: globalCss,
      role: "global-style",
    });
  }
  const routes = discoverRoutes(appDir);
  console.log(`📁 Discovered ${routes.length} routes`);
  for (const route of routes) {
    if (route.type !== "page") continue;
    const pageClient = clientCompanionPath(route.filePath);
    addBuildInput(inputs, {
      kind: "client",
      filePath: pageClient,
      role: "page-client",
      route: route.pattern,
    });
    const pageCss = styleCompanionPath(route.filePath);
    addBuildInput(inputs, {
      kind: "style",
      filePath: pageCss,
      role: "page-style",
      route: route.pattern,
    });
    for (const layoutPath of route.layouts) {
      const layoutClient = clientCompanionPath(layoutPath);
      addBuildInput(inputs, {
        kind: "client",
        filePath: layoutClient,
        role: "layout-client",
        route: route.pattern,
      });
    }
  }
  return [...inputs.values()];
}
function collectEntryBuildInputs(entries: string[]): BuildInput[] {
  return entries.map((entry) => {
    const filePath = path.resolve(entry);
    if (!existsSync(filePath)) {
      throw new Error(`Entry not found: ${entry}`);
    }
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".css") {
      return { kind: "style", filePath, role: "entry" };
    }
    if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
      return { kind: "client", filePath, role: "entry" };
    }
    throw new Error(`Unsupported entry type: ${entry}`);
  });
}
async function buildInput(input: BuildInput): Promise<string> {
  return cliBuildMeasure.measure(
    {
      start: () => `Build input: ${input.role}`,
      end: (outputPath: string) => ({
        file: path.basename(input.filePath),
        outputPath,
      }),
      catch: (error: unknown) => {
        throw error;
      },
    },
    async () => {
      if (input.kind === "style") {
        return input.role === "page-style" && input.route
          ? buildScopedStyle(input.filePath, input.route)
          : buildStyle(input.filePath);
      }
      return buildClientScript(input.filePath);
    },
  );
}
function writeBuiltAssets(
  outDir: string,
  assetPaths: ReadonlySet<string>,
): {
  assetCount: number;
  totalBytes: number;
} {
  const destinations = [...assetPaths].sort().map((assetPath) => {
    const relativePath = assetPath.replace(/^\/+/, "");
    const parts = relativePath.split("/");
    if (
      !relativePath ||
      relativePath.includes("\\") ||
      parts.some((part) => part === ".." || part === ".")
    )
      throw new Error(`Unsafe asset output path: ${assetPath}`);
    const dest = path.resolve(outDir, relativePath);
    const relative = path.relative(outDir, dest);
    if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
      throw new Error(`Asset escaped output directory: ${assetPath}`);
    let candidate = outDir;
    for (const part of parts) {
      candidate = path.join(candidate, part);
      try {
        if (lstatSync(candidate).isSymbolicLink())
          throw new Error(`Refusing to overwrite symlink: ${candidate}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    const asset = builtAssets[assetPath];
    if (!asset) throw new Error(`Built asset unavailable: ${assetPath}`);
    return { assetPath, dest, content: asset.content };
  });
  mkdirSync(outDir, { recursive: true });
  let assetCount = 0;
  let totalBytes = 0;
  for (const { assetPath, dest, content } of destinations) {
    const dir = path.dirname(dest);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(dest, Buffer.from(content));
    assetCount++;
    totalBytes += content.byteLength;
    const ext = path.extname(assetPath);
    const icon = ext === ".css" ? "🎨" : ext === ".js" ? "⚡" : "📄";
    console.log(`   ${icon} ${assetPath} (${formatBytes(content.byteLength)})`);
  }
  return { assetCount, totalBytes };
}
export async function buildToDisk(options: BuildOptions = {}): Promise<void> {
  const outDir = path.resolve(options.outDir || "./dist");
  const entryMode = Boolean(options.entries?.length);
  const appDir = entryMode
    ? path.resolve(options.appDir || "./app")
    : resolveAppDir(options.appDir);
  const globalCss = options.globalCss
    ? path.resolve(options.globalCss)
    : (["globals.css", "global.css", "app.css"]
        .map((name) => path.join(appDir, name))
        .find(existsSync) ?? null);
  if (options.globalCss && !existsSync(globalCss!))
    throw new Error(`Global CSS not found: ${options.globalCss}`);
  if (!entryMode && !existsSync(appDir)) {
    throw new Error(`App directory not found: ${appDir}`);
  }
  console.log(`\n🦊 tradjs build`);
  if (!entryMode) console.log(`   App dir:  ${appDir}`);
  console.log(`   Out dir:  ${outDir}`);
  if (globalCss && !entryMode) console.log(`   CSS:      ${globalCss}`);
  console.log("");
  const inputs = entryMode
    ? collectEntryBuildInputs(options.entries ?? [])
    : collectAppBuildInputs(appDir, globalCss);
  if (entryMode) {
    console.log(`📦 Building ${inputs.length} entry point(s)...`);
  }
  const selectedAssets = new Set<string>();
  for (const input of inputs) {
    const outputPath = await buildInput(input);
    for (const assetPath of getBuiltAssetPaths(outputPath))
      selectedAssets.add(assetPath);
  }
  const written = writeBuiltAssets(outDir, selectedAssets);
  const summary: BuildSummary = {
    inputCount: inputs.length,
    assetCount: written.assetCount,
    totalBytes: written.totalBytes,
    outDir,
  };
  console.log(
    `\n✅ Built ${summary.inputCount} inputs → ${summary.assetCount} assets (${formatBytes(summary.totalBytes)}) to ${summary.outDir}\n`,
  );
}
export function parseBuildArgs(args: string[]): BuildOptions {
  const options: BuildOptions = {};
  const entries: string[] = [];
  const takeValue = (flag: string, index: number): string => {
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${flag}`);
    }
    return value;
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--outdir":
        options.outDir = takeValue(arg, i++);
        break;
      case "--appdir":
        options.appDir = takeValue(arg, i++);
        break;
      case "--css":
        options.globalCss = takeValue(arg, i++);
        break;
      case "--entry":
        entries.push(takeValue(arg, i++));
        break;
      default:
        if (arg.startsWith("-")) {
          throw new Error(`Unknown build option: ${arg}`);
        }
        if (options.outDir !== undefined) {
          throw new Error(`Unexpected build argument: ${arg}`);
        }
        options.outDir = arg;
    }
  }
  if (entries.length > 0) options.entries = entries;
  return options;
}
