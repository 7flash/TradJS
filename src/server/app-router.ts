/**
 * App Router — Next.js-style file-based routing
 * 
 * Discovers routes from the app directory, renders pages with SSR,
 * builds client mount scripts, and handles API routes.
 */

import path from "path";
import { existsSync } from "fs";
import { dedent } from "ts-dedent";
import { discoverRoutes, matchRoute } from "./router";
import { createElement } from "../client/render";
import { renderToString } from "./ssr";
import { resetHead, getHeadElements, Head } from "./head";
import { imports } from "./imports";
import { buildScript, buildStyle, buildClientScript, clientScriptsUsingReact, builtAssets, getContentType, buildScopedStyle, buildAsset } from './build';
import { getPrerendered, prerender as ssgPrerender } from "./ssg";
import { serve as serveHttp } from "./serve";
import type { Handler, FrontendAppOptions, RenderPageOptions, AppRouterOptions } from "./types";

const isDev = process.env.NODE_ENV !== "production";
const STREAM_SLOT_MARKUP = '<tradjs-stream-slot></tradjs-stream-slot>';

async function wrapWithLayouts(tree: any, layoutPaths: string[]) {
    let wrappedTree = tree;

    for (let i = layoutPaths.length - 1; i >= 0; i--) {
        const layoutPath = layoutPaths[i];
        const layoutModule = await import(layoutPath);
        const LayoutComponent = layoutModule.default;

        if (LayoutComponent) {
            wrappedTree = createElement(LayoutComponent, { children: wrappedTree });
        }
    }

    return wrappedTree;
}

// ─── SPA / Legacy Frontend ──────────────────────────────────────────────────────

export async function spa(options: FrontendAppOptions): Promise<string> {
    return frontendApp(options);
}

/** @deprecated Use the createAppRouter() pattern instead. */
export async function frontendApp(options: FrontendAppOptions): Promise<string> {
    const {
        entrypoint,
        stylePath,
        title = "Frontend App",
        viewport = "width=device-width, initial-scale=1",
        rebuild = true,
        serverData = {},
        additionalAssets = [],
        meta = [],
        head = '',
        headerScripts = []
    } = options;

    let stylesVirtualPath = '';
    if (stylePath) {
        try {
            stylesVirtualPath = await buildStyle(stylePath);
        } catch (error) {
            console.warn(`Style not found: ${stylePath}`);
        }
    }

    const assetPaths: string[] = [];
    for (const asset of additionalAssets) {
        const file = Bun.file(asset.path);
        const virtualPath = await buildAsset(file);
        if (virtualPath) {
            assetPaths.push(virtualPath);
        }
    }

    const scriptPath = entrypoint.startsWith('/') ? entrypoint : path.join(process.cwd(), entrypoint);

    const subpathImports = ['react-dom/client', 'react/jsx-dev-runtime', 'wouter/use-browser-location'];

    const packagePath = path.resolve(process.cwd(), 'package.json');
    const packageJson = (await import(packagePath, { assert: { type: 'json' } })).default;

    const importMaps = `
   <script type="importmap">
    ${JSON.stringify(await imports(subpathImports, packageJson))}
    </script>
  `;

    let scriptVirtualPath = await buildScript(scriptPath) ?? '';

    if (!scriptVirtualPath) throw `failed to build script`;

    const metaTags = meta.map(m => `<meta name="${m.name}" content="${m.content}">`).join('\n');

    const additionalHead = additionalAssets.map(asset => {
        if (asset.type === 'icon') {
            return `<link rel="icon" type="image/png" href="${assetPaths[0] || ''}">`;
        }
        return '';
    }).join('\n');

    const headerScriptsHtml = headerScripts.map(script =>
        `<script>${script}</script>`
    ).join('\n');

    return dedent`
    <!DOCTYPE html>
    <html>
      <head>
        ${importMaps}
        <meta charset="utf-8">
        <meta name="viewport" content="${viewport}">
        ${metaTags}
        <title>${title}</title>
        ${additionalHead}
        ${headerScriptsHtml}
        ${head}
        ${stylesVirtualPath ? `<link rel="stylesheet" href="${stylesVirtualPath}" >` : ''}
      </head>
      <body>
        <div id="root"></div>
        <script>
          window.SERVER_DATA = ${JSON.stringify(serverData)};
        </script>
        <script src="${scriptVirtualPath}" type="module"></script>
      </body>
    </html>
  `;
}

// ─── Page Renderer ──────────────────────────────────────────────────────────────

/**
 * Render a page component to HTML with SSR.
 * Used by app router to render route components.
 */
export async function renderPage(options: RenderPageOptions): Promise<string> {
    const {
        component: Component,
        clientComponent,
        stylePath,
        title = "Melina App",
        params = {},
        props = {},
        viewport = "width=device-width, initial-scale=1",
        meta = [],
    } = options;

    let stylesVirtualPath = '';
    if (stylePath) {
        try {
            stylesVirtualPath = await buildStyle(stylePath);
        } catch (error) {
            console.warn(`Style not found: ${stylePath}`);
        }
    }

    const subpathImports = ['react-dom/client', 'react/jsx-dev-runtime'];
    let importMaps = '';
    try {
        const packagePath = path.resolve(process.cwd(), 'package.json');
        const packageJson = (await import(packagePath, { assert: { type: 'json' } })).default;
        importMaps = `
      <script type="importmap">
        ${JSON.stringify(await imports(subpathImports, packageJson))}
      </script>
    `;
    } catch (e) {
        console.warn('Could not generate import map:', e);
    }

    let serverHtml = '';
    try {
        serverHtml = renderToString(
            createElement(Component, { ...props, params })
        );
    } catch (error) {
        console.warn('SSR failed, will use client-side rendering only:', error);
    }

    let scriptVirtualPath = '';
    if (clientComponent) {
        try {
            scriptVirtualPath = await buildScript(clientComponent);
        } catch (error) {
            console.warn(`Client component build failed: ${clientComponent}`, error);
        }
    }

    const metaTags = meta.map(m => `<meta name="${m.name}" content="${m.content}">`).join('\n');

    return dedent`
    <!DOCTYPE html>
    <html>
      <head>
        ${importMaps}
        <meta charset="utf-8">
        <meta name="viewport" content="${viewport}">
        ${metaTags}
        <title>${title}</title>
        ${stylesVirtualPath ? `<link rel="stylesheet" href="${stylesVirtualPath}" >` : ''}
      </head>
      <body>
        <div id="root">${serverHtml}</div>
        <script>
          window.__MELINA_DATA__ = ${JSON.stringify({ params, props })};
        </script>
        ${scriptVirtualPath ? `<script src="${scriptVirtualPath}" type="module"></script>` : ''}
      </body>
    </html>
  `;
}

// ─── App Router ─────────────────────────────────────────────────────────────────

/**
 * Create a request handler with file-based routing.
 * Automatically discovers routes from app directory.
 *
 * @example
 * ```ts
 * import { serve, createAppRouter } from 'tradjs/web';
 * 
 * serve(createAppRouter({
 *   appDir: './app',
 *   globalCss: './app/globals.css',
 * }));
 * ```
 */
export function createAppRouter(options: AppRouterOptions = {}): Handler {
    const {
        appDir = path.join(process.cwd(), 'app'),
        defaultTitle = 'Melina App',
    } = options;

    const routes = discoverRoutes(appDir);
    console.log(`📁 Discovered ${routes.length} routes:`);
    routes.forEach(route => {
        const typeIcon = route.type === 'api' ? '⚡' : '📄';
        const layoutInfo = route.layouts.length > 0 ? ` (${route.layouts.length} layouts)` : '';
        const mwInfo = route.middlewares.length > 0 ? ` [${route.middlewares.length} middleware]` : '';
        const errorInfo = route.errorPath ? ' 🛡' : '';
        const loadingInfo = route.loadingPath ? ' ⏳' : '';
        console.log(`   ${typeIcon} ${route.pattern} -> ${path.relative(process.cwd(), route.filePath)}${layoutInfo}${mwInfo}${errorInfo}${loadingInfo}`);
    });

    let globalCss = options.globalCss;
    if (!globalCss) {
        const possiblePaths = [
            path.join(appDir, 'globals.css'),
            path.join(appDir, 'global.css'),
            path.join(appDir, 'app.css'),
        ];
        for (const cssPath of possiblePaths) {
            if (existsSync(cssPath)) {
                globalCss = cssPath;
                console.log(`📄 Found global CSS: ${path.relative(process.cwd(), cssPath)}`);
                break;
            }
        }
    }
    // ── SSG: Pre-render eligible pages at startup ──────────────────────────
    if (!isDev) {
        (async () => {
            try {
                const count = await ssgPrerender(routes, async (route) => {
                    const pageModule = await import(route.filePath);
                    const PageComponent = pageModule.default || pageModule.Page;
                    if (!PageComponent) throw new Error(`No default export in ${route.filePath}`);

                    let tree = createElement(PageComponent, { params: {} });
                    for (let i = route.layouts.length - 1; i >= 0; i--) {
                        const layoutModule = await import(route.layouts[i]);
                        const LayoutComponent = layoutModule.default;
                        if (LayoutComponent) tree = createElement(LayoutComponent, { children: tree });
                    }

                    resetHead();
                    const html = renderToString(tree);
                    const headElements = getHeadElements();

                    let fullHtml = `<!DOCTYPE html>${html}`;

                    if (globalCss) {
                        try {
                            const stylesPath = await buildStyle(globalCss);
                            fullHtml = fullHtml.replace('</head>', `<link rel="stylesheet" href="${stylesPath}"></head>`);
                        } catch (_) { /* ignore */ }
                    }

                    if (headElements.length > 0) {
                        fullHtml = fullHtml.replace('</head>', `${headElements.join('\n')}</head>`);
                    }

                    fullHtml = fullHtml.replace(
                        'id="melina-page-content"',
                        `id="melina-page-content" data-page="${route.pattern}"`
                    );

                    return fullHtml;
                });
                if (count > 0) console.log(`⚡ SSG: Pre-rendered ${count} pages`);
            } catch (e: any) {
                console.warn('SSG prerender failed:', e.message);
            }
        })();
    }

    return async (req: Request, m: any) => {
        const url = new URL(req.url);
        const pathname = url.pathname;

        const match = matchRoute(pathname, routes);

        if (!match) {
            return new Response('404 - Not Found', {
                status: 404,
                headers: { 'Content-Type': 'text/html' }
            });
        }

        // ── SSG: serve pre-rendered page from memory ──────────────────
        if (!isDev && match.route.type === 'page') {
            const cached = getPrerendered(pathname);
            if (cached) {
                return new Response(cached, {
                    headers: {
                        'Content-Type': 'text/html',
                        'Cache-Control': 'public, max-age=3600',
                        'X-Melina-SSG': '1',
                    },
                });
            }
        }

        try {
            // ── Middleware Chain ─────────────────────────────────────────────
            // Execute middleware.ts files from root→page (outermost first).
            // Each middleware can short-circuit by returning a Response.
            if (match.route.middlewares.length > 0) {
                for (const mwPath of match.route.middlewares) {
                    const mwResult = await m(`Middleware: ${path.basename(path.dirname(mwPath))}`, async () => {
                        const mwModule = await import(mwPath);
                        const mwFn = mwModule.default || mwModule.middleware;
                        if (typeof mwFn === 'function') {
                            return await mwFn(req, { params: match.params, route: match.route });
                        }
                    });
                    // If middleware returns a Response, short-circuit
                    if (mwResult instanceof Response) return mwResult;
                }
            }

            // Handle API routes
            if (match.route.type === 'api') {
                return await m(`API: ${match.route.pattern}`, async () => {
                    const apiModule = await import(match.route.filePath);
                    const method = req.method.toUpperCase();
                    const handler = apiModule[method] || apiModule.default;

                    if (!handler) {
                        return new Response('Method Not Allowed', { status: 405 });
                    }

                    const response = await handler(req, { params: match.params });
                    return response instanceof Response
                        ? response
                        : new Response(JSON.stringify(response), {
                            headers: { 'Content-Type': 'application/json' }
                        });
                });
            }

            // Handle Page routes
            const pageModule = await m('Import page', () => import(match.route.filePath), (e: any) => { throw e; });
            const PageComponent = pageModule.default || pageModule.Page;

            if (!PageComponent) {
                throw new Error(`No default export found in ${match.route.filePath}`);
            }

            const pageTree = createElement(PageComponent, { params: match.params });

            let stylesVirtualPath = '';
            if (globalCss) {
                try {
                    stylesVirtualPath = await buildStyle(globalCss);
                } catch (e) {
                    console.warn('Failed to build global CSS:', e);
                }
            }

            // Build page-scoped CSS if page.css exists alongside page.tsx
            let scopedStylePath = '';
            const pageCssPath = match.route.filePath.replace(/\.(tsx?|jsx?)$/, '.css');
            if (existsSync(pageCssPath)) {
                try {
                    scopedStylePath = await buildScopedStyle(pageCssPath, match.route.pattern);
                } catch (e) {
                    console.warn('Failed to build scoped CSS:', e);
                }
            }

            const clientScriptUrls: { url: string; type: 'layout' | 'page' }[] = [];

            for (const layoutPath of match.route.layouts) {
                const layoutClientPath = layoutPath.replace(/\.tsx?$/, '.client.tsx');
                if (existsSync(layoutClientPath)) {
                    const scriptPath = await buildClientScript(layoutClientPath);
                    clientScriptUrls.push({ url: scriptPath, type: 'layout' });
                }
            }

            const pageClientPath = match.route.filePath.replace(/\.tsx?$/, '.client.tsx');
            if (existsSync(pageClientPath)) {
                try {
                    const scriptPath = await buildClientScript(pageClientPath);
                    if (scriptPath) {
                        clientScriptUrls.push({ url: scriptPath, type: 'page' });
                    }
                } catch (e: any) {
                    console.error(`[Melina] Failed to build page client script: ${e.message}`);
                }
            }

            const clientScriptTags: string[] = [];
            if (clientScriptUrls.length > 0) {
                const paramsJson = JSON.stringify(match.params);
                const bootstrapLines = clientScriptUrls.map(({ url, type }) => {
                    return `  import('${url}').then(m => { if (typeof m.default === 'function') { const cleanup = m.default({ params: window.__MELINA_PARAMS__ }); if (typeof cleanup === 'function') { window.__melinaCleanups__ = window.__melinaCleanups__ || []; window.__melinaCleanups__.push({ type: '${type}', cleanup }); } } }).catch(e => console.error('[Melina] Failed to mount ${type} script:', e));`;
                });
                clientScriptTags.push(
                    `<script>window.__MELINA_PARAMS__ = ${paramsJson};</script>`,
                    `<script type="module">\n${bootstrapLines.join('\n')}\n</script>`
                );
            }

            const allClientPaths = [
                ...match.route.layouts.map(l => l.replace(/\.tsx?$/, '.client.tsx')).filter(existsSync),
                ...(existsSync(pageClientPath) ? [pageClientPath] : []),
            ];
            const needsReactImportMap = allClientPaths.some(p => clientScriptsUsingReact.has(p));

            let importMapTag = '';
            if (needsReactImportMap) {
                try {
                    const importMapJson = JSON.stringify(await imports(['react-dom/client', 'react/jsx-dev-runtime']));
                    importMapTag = `<script type="importmap">${importMapJson}</script>`;
                } catch (e) {
                    console.warn('Failed to generate React import maps:', e);
                }
            }
            const responseHeaders = {
                'Content-Type': 'text/html',
                'Cache-Control': isDev ? 'no-cache' : 'public, max-age=3600',
            };

            resetHead();
            const pageHtml = await m('SSR renderPage', () => renderToString(pageTree), (e: any) => { throw e; });
            const pageHeadElements = [...getHeadElements()];

            const slotTree = await wrapWithLayouts(createElement('tradjs-stream-slot', {}), match.route.layouts);

            resetHead();
            const shellHtmlOnly = await m('SSR renderShell', () => renderToString(slotTree), (e: any) => { throw e; });
            const layoutHeadElements = [...getHeadElements()];
            const headElements = [...layoutHeadElements, ...pageHeadElements];

            let shellHtml = `<!DOCTYPE html>${shellHtmlOnly}`;

            if (stylesVirtualPath) {
                shellHtml = shellHtml.replace('</head>', `<link rel="stylesheet" href="${stylesVirtualPath}"></head>`);
            }

            if (scopedStylePath) {
                shellHtml = shellHtml.replace('</head>', `<link rel="stylesheet" href="${scopedStylePath}"></head>`);
            }

            shellHtml = shellHtml.replace(
                'id="melina-page-content"',
                `id="melina-page-content" data-page="${match.route.pattern}"`
            );

            if (headElements.length > 0) {
                shellHtml = shellHtml.replace('</head>', `${headElements.join('\n')}</head>`);
            }

            if (importMapTag) {
                shellHtml = shellHtml.replace('</head>', `${importMapTag}</head>`);
            }

            const slotIndex = shellHtml.indexOf(STREAM_SLOT_MARKUP);

            if (slotIndex === -1) {
                let fullHtml = shellHtml + pageHtml;

                if (clientScriptTags.length > 0) {
                    fullHtml = fullHtml.replace('</body>', `${clientScriptTags.join('\n')}</body>`);
                }

                return new Response(fullHtml, { headers: responseHeaders });
            }

            const prefix = shellHtml.slice(0, slotIndex);
            let suffix = shellHtml.slice(slotIndex + STREAM_SLOT_MARKUP.length);

            if (clientScriptTags.length > 0) {
                suffix = suffix.replace('</body>', `${clientScriptTags.join('\n')}</body>`);
            }

            const encoder = new TextEncoder();
            const stream = new ReadableStream({
                start(controller) {
                    controller.enqueue(encoder.encode(prefix));
                    controller.enqueue(encoder.encode(pageHtml));
                    controller.enqueue(encoder.encode(suffix));
                    controller.close();
                },
            });

            return new Response(stream, { headers: responseHeaders });
        } catch (error: any) {
            console.error('Error rendering page:', error);
            const errorMessage = error?.message || String(error);
            const errorStack = error?.stack || 'No stack trace available';

            // ── Error Boundary: render error.tsx if available ────────────
            if (match.route.errorPath) {
                try {
                    const errorModule = await import(match.route.errorPath);
                    const ErrorComponent = errorModule.default;
                    if (ErrorComponent) {
                        const errorProps = {
                            error: { message: errorMessage, stack: isDev ? errorStack : undefined },
                            pathname: url.pathname,
                        };
                        let errorTree = createElement(ErrorComponent, errorProps);

                        // Wrap in layouts (error page should still have app chrome)
                        for (let i = match.route.layouts.length - 1; i >= 0; i--) {
                            const layoutPath = match.route.layouts[i];
                            const layoutModule = await import(layoutPath);
                            const LayoutComponent = layoutModule.default;
                            if (LayoutComponent) {
                                errorTree = createElement(LayoutComponent, { children: errorTree });
                            }
                        }

                        const errorHtml = renderToString(errorTree);
                        let fullErrorHtml = `<!DOCTYPE html>${errorHtml}`;

                        if (globalCss) {
                            try {
                                const stylesPath = await buildStyle(globalCss);
                                fullErrorHtml = fullErrorHtml.replace('</head>', `<link rel="stylesheet" href="${stylesPath}"></head>`);
                            } catch (_) { /* ignore CSS errors during error rendering */ }
                        }

                        return new Response(fullErrorHtml, {
                            status: 500,
                            headers: { 'Content-Type': 'text/html' },
                        });
                    }
                } catch (errorBoundaryError: any) {
                    console.error('Error boundary itself failed:', errorBoundaryError);
                    // Fall through to generic error page
                }
            }

            // Generic fallback error page
            return new Response(`
        <!DOCTYPE html>
        <html>
          <body>
            <h1>500 - Internal Server Error</h1>
            <pre>${isDev ? errorStack : 'An error occurred'}</pre>
            <p>Error: ${errorMessage}</p>
          </body>
        </html>
      `, {
                status: 500,
                headers: { 'Content-Type': 'text/html' },
            });
        }
    };
}

// ─── Quick Start ────────────────────────────────────────────────────────────────

const DEFAULT_APP_DIR_NAME = 'app';

function hasConventionRoutes(dir: string): boolean {
    const routeSignals = [
        'page.tsx',
        'page.ts',
        'page.jsx',
        'page.js',
        'layout.tsx',
        'layout.ts',
        'layout.jsx',
        'layout.js',
        'middleware.ts',
        'middleware.tsx',
        'middleware.js',
        'error.tsx',
        'error.ts',
        'loading.tsx',
        'loading.ts',
    ];

    if (existsSync(path.join(dir, 'api'))) {
        return true;
    }

    return routeSignals.some(file => existsSync(path.join(dir, file)));
}

export function resolveAppDir(appDir?: string): string {
    if (appDir) {
        return path.isAbsolute(appDir) ? appDir : path.resolve(process.cwd(), appDir);
    }

    const defaultAppDir = path.resolve(process.cwd(), DEFAULT_APP_DIR_NAME);
    if (existsSync(defaultAppDir)) {
        return defaultAppDir;
    }

    const cwd = process.cwd();
    if (hasConventionRoutes(cwd)) {
        return cwd;
    }

    throw new Error(
        `Could not find a TradJS app. Looked for ./${DEFAULT_APP_DIR_NAME}/ first, then route files in ${cwd}.`
    );
}

export interface ServeAppOptions extends AppRouterOptions {
    port?: number;
    unix?: string;
}

export async function serve(options?: ServeAppOptions): Promise<any>;
export async function serve(handler: Handler, options?: { port?: number; unix?: string; websocket?: any }): Promise<any>;
export async function serve(
    handlerOrOptions?: Handler | ServeAppOptions,
    serverOptions?: { port?: number; unix?: string; websocket?: any }
) {
    if (typeof handlerOrOptions === 'function') {
        return serveHttp(handlerOrOptions, serverOptions);
    }

    const options = handlerOrOptions ?? {};
    const { port, unix, ...routerOptions } = options;
    const appDir = resolveAppDir(routerOptions.appDir);
    const router = createAppRouter({ ...routerOptions, appDir });
    return serveHttp(router, { port, unix });
}

/**
 * Start a TradJS server with file-based routing in one call.
 * Combines createAppRouter() + serve() for convenience.
 *
 * @example
 * ```ts
 * import { start } from 'tradjs';
 * await start({ appDir: './app', port: 3000 });
 * ```
 */
export async function start(options: ServeAppOptions = {}) {
    return serve(options);
}
