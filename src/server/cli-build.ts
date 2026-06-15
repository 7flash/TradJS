/**
 * melina build — Build assets to disk
 * 
 * Runs the existing in-memory build pipeline, then writes all built assets
 * to the output directory. Supports both app-router mode (discovers all routes)
 * and standalone entry mode (build specific files).
 * 
 * Usage:
 *   melina build                              Build all routes to ./dist
 *   melina build --outdir ./extension/dist    Build to custom directory
 *   melina build --entry src/app.ts           Build specific entry points
 *   melina build --entry src/a.ts --entry src/b.tsx --outdir ./dist
 */

import path from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { cliBuildMeasure } from './measure';

import { builtAssets, buildClientScript, buildStyle } from './build';
import { discoverRoutes } from './router';

const { measure } = cliBuildMeasure;

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

/**
 * Build all assets to disk.
 * 
 * In app-router mode (default): discovers all routes from appDir, builds
 * every page.client.tsx, layout.client.tsx, globals.css, page.css, etc.
 * 
 * In entry mode (--entry flags): builds only the specified files.
 */
export async function buildToDisk(options: BuildOptions = {}) {
    const outDir = path.resolve(options.outDir || './dist');
    const appDir = path.resolve(options.appDir || './app');
    const globalCss = options.globalCss
        ? path.resolve(options.globalCss)
        : existsSync(path.join(appDir, 'globals.css'))
            ? path.join(appDir, 'globals.css')
            : null;

    console.log(`\n🦊 melina build`);
    console.log(`   App dir:  ${appDir}`);
    console.log(`   Out dir:  ${outDir}`);
    if (globalCss) console.log(`   CSS:      ${globalCss}`);
    console.log('');

    let buildCount = 0;

    if (options.entries && options.entries.length > 0) {
        // ─── Entry Mode ─────────────────────────────────────────────
        console.log(`📦 Building ${options.entries.length} entry point(s)...`);

        for (const entry of options.entries) {
            const absEntry = path.resolve(entry);
            if (!existsSync(absEntry)) {
                console.error(`   ✗ Not found: ${entry}`);
                continue;
            }

            const ext = path.extname(absEntry).toLowerCase();
            await measure(`Entry: ${path.basename(entry)}`, async () => {
                if (ext === '.css') {
                    await buildStyle(absEntry);
                } else if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
                    await buildClientScript(absEntry);
                } else {
                    console.warn(`   ⚠ Skipping unsupported file: ${entry}`);
                }
            });
            buildCount++;
        }
    } else {
        // ─── App Router Mode ────────────────────────────────────────
        if (!existsSync(appDir)) {
            console.error(`✗ App directory not found: ${appDir}`);
            process.exit(1);
        }

        // Build global CSS
        if (globalCss && existsSync(globalCss)) {
            await measure('Global CSS', async () => {
                await buildStyle(globalCss);
            });
            buildCount++;
        }

        // Discover routes and build all client scripts
        const routes = await measure('Discover routes', async () => {
            return discoverRoutes(appDir);
        }) || [];

        console.log(`📁 Discovered ${routes.length} routes`);

        for (const route of routes) {
            const routeDir = path.dirname(route.filePath);

            // Build page.client.tsx if it exists
            const pageClient = path.join(routeDir, 'page.client.tsx');
            if (existsSync(pageClient)) {
                await measure(`Client: ${route.pattern}`, async () => {
                    await buildClientScript(pageClient);
                });
                buildCount++;
            }

            // Build layout.client.tsx if it exists
            const layoutClient = path.join(routeDir, 'layout.client.tsx');
            if (existsSync(layoutClient)) {
                await measure(`Layout Client: ${route.pattern}`, async () => {
                    await buildClientScript(layoutClient);
                });
                buildCount++;
            }

            // Build page.css if it exists
            const pageCss = path.join(routeDir, 'page.css');
            if (existsSync(pageCss)) {
                await measure(`Page CSS: ${route.pattern}`, async () => {
                    await buildStyle(pageCss);
                });
                buildCount++;
            }
        }

        // Also check for layout.client.tsx at appDir root
        const rootLayoutClient = path.join(appDir, 'layout.client.tsx');
        if (existsSync(rootLayoutClient)) {
            await measure('Root Layout Client', async () => {
                await buildClientScript(rootLayoutClient);
            });
            buildCount++;
        }
    }

    // ─── Write to Disk ──────────────────────────────────────────────
    mkdirSync(outDir, { recursive: true });

    let writtenCount = 0;
    let totalBytes = 0;

    for (const [assetPath, { content, contentType }] of Object.entries(builtAssets)) {
        const dest = path.join(outDir, assetPath);
        const dir = path.dirname(dest);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

        writeFileSync(dest, Buffer.from(content));
        writtenCount++;
        totalBytes += content.byteLength;

        const ext = path.extname(assetPath);
        const icon = ext === '.css' ? '🎨' : ext === '.js' ? '⚡' : '📄';
        const size = content.byteLength > 1024
            ? `${(content.byteLength / 1024).toFixed(1)}KB`
            : `${content.byteLength}B`;
        console.log(`   ${icon} ${assetPath} (${size})`);
    }

    const totalSize = totalBytes > 1024 * 1024
        ? `${(totalBytes / 1024 / 1024).toFixed(1)}MB`
        : `${(totalBytes / 1024).toFixed(1)}KB`;

    console.log(`\n✅ Built ${writtenCount} assets (${totalSize}) to ${outDir}\n`);
}

/**
 * Parse CLI arguments for the build command.
 */
export function parseBuildArgs(args: string[]): BuildOptions {
    const options: BuildOptions = {};
    const entries: string[] = [];

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--outdir' && args[i + 1]) {
            options.outDir = args[++i];
        } else if (arg === '--appdir' && args[i + 1]) {
            options.appDir = args[++i];
        } else if (arg === '--css' && args[i + 1]) {
            options.globalCss = args[++i];
        } else if (arg === '--entry' && args[i + 1]) {
            entries.push(args[++i]);
        } else if (!arg.startsWith('-')) {
            // Bare argument = outdir shorthand
            options.outDir = arg;
        }
    }

    if (entries.length > 0) {
        options.entries = entries;
    }

    return options;
}