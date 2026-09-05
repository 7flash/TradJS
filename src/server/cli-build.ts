/**
 * tradjs build — Build assets to disk
 *
 * Runs the existing in-memory build pipeline, then writes all built assets
 * to the output directory. Supports both app-router mode (discovers all routes)
 * and standalone entry mode (build specific files).
 *
 * Usage:
 *   tradjs build                              Build all routes to ./dist
 *   tradjs build --outdir ./extension/dist    Build to custom directory
 *   tradjs build --entry src/app.ts           Build specific entry points
 *   tradjs build --entry src/a.ts --entry src/b.tsx --outdir ./dist
 */

import path from "path";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { cliBuildMeasure, measureRequired } from "./measure";

import { builtAssets, buildClientScript, buildStyle } from "./build";
import { discoverRoutes } from "./router";
import { clientCompanionPath, styleCompanionPath } from "./conventions";

export interface BuildOptions {
  /** Output directory (default: ./dist) */
  outDir?: string;
  /** App directory for route discovery (default: ./app) */
  appDir?: string;
  /** Global CSS file to build */
  globalCss?: string;
  /** Explicit entry points (bypass route discovery) */
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

  // Route discovery is already measured internally. Because measureRequired()
  // auto-nests, this becomes a direct child of the build trace without an extra
  // duplicate "Discover routes" wrapper here.
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

async function buildInput(input: BuildInput): Promise<void> {
  await measureRequired(
    cliBuildMeasure,
    {
      label: "Build input",
      role: input.role,
      file: path.basename(input.filePath),
      ...(input.route ? { route: input.route } : {}),
    },
    async () => {
      if (input.kind === "style") {
        await buildStyle(input.filePath);
      } else {
        await buildClientScript(input.filePath);
      }
    },
  );
}

function writeBuiltAssets(outDir: string): {
  assetCount: number;
  totalBytes: number;
} {
  mkdirSync(outDir, { recursive: true });

  let assetCount = 0;
  let totalBytes = 0;

  for (const [assetPath, { content }] of Object.entries(builtAssets)) {
    // Asset keys are URL paths and normally begin with '/'. Strip that leading
    // slash before joining so path.join cannot escape the requested output dir.
    const relativeAssetPath = assetPath.replace(/^[/\\]+/, "");
    const dest = path.join(outDir, relativeAssetPath);
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

/**
 * Build all assets to disk.
 *
 * In app-router mode, inputs are collected from discovered page/layout chains
 * and deduplicated by absolute path before building. In entry mode, only the
 * explicitly supplied files are built.
 */
export async function buildToDisk(options: BuildOptions = {}): Promise<void> {
  const outDir = path.resolve(options.outDir || "./dist");
  const appDir = path.resolve(options.appDir || "./app");
  const globalCss = options.globalCss
    ? path.resolve(options.globalCss)
    : existsSync(path.join(appDir, "globals.css"))
      ? path.join(appDir, "globals.css")
      : null;
  const entryMode = Boolean(options.entries?.length);

  if (!entryMode && !existsSync(appDir)) {
    throw new Error(`App directory not found: ${appDir}`);
  }

  const summary = await measureRequired(
    cliBuildMeasure,
    {
      label: "Build project",
      mode: entryMode ? "entries" : "app-router",
      outDir,
      ...(entryMode ? {} : { appDir }),
      result: (value: BuildSummary) => ({
        inputs: value.inputCount,
        assets: value.assetCount,
        bytes: value.totalBytes,
      }),
    },
    async (): Promise<BuildSummary> => {
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

      for (const input of inputs) {
        await buildInput(input);
      }

      const written = await measureRequired(
        cliBuildMeasure,
        {
          label: "Write assets",
          outDir,
          result: (value: { assetCount: number; totalBytes: number }) => value,
        },
        async () => writeBuiltAssets(outDir),
      );

      return {
        inputCount: inputs.length,
        assetCount: written.assetCount,
        totalBytes: written.totalBytes,
        outDir,
      };
    },
  );

  console.log(
    `\n✅ Built ${summary.inputCount} inputs → ${summary.assetCount} assets (${formatBytes(summary.totalBytes)}) to ${summary.outDir}\n`,
  );
}

/**
 * Parse CLI arguments for the build command.
 */
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
        // Bare argument = outdir shorthand.
        options.outDir = arg;
    }
  }

  if (entries.length > 0) options.entries = entries;
  return options;
}
