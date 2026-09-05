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
import { clientCompanionPath, styleCompanionPath } from "./conventions";
import { createElement } from "../client/render";
import type { Child } from "../client/types";
import { renderToStringAsync } from "./ssr";
import { collectHeadAsync, type HeadCollection } from "./head";
import { imports } from "./imports";
import {
  buildScript,
  buildStyle,
  buildClientScript,
  clientScriptsUsingReact,
  getContentType,
  buildScopedStyle,
  buildAsset,
} from "./build";
import { getPrerendered, prerender as ssgPrerender } from "./ssg";
import { serve as serveHttp, type HttpServeOptions } from "./serve";
import { errorMessage, errorStack } from "./errors";
import { escapeHtml, injectHeadElements, serializeInlineScript } from "./html";
import { measureNote, measureRequired, routeMeasure } from "./measure";
import type {
  Handler,
  FrontendAppOptions,
  RenderPageOptions,
  AppRouterOptions,
} from "./types";

const isDev = process.env.NODE_ENV !== "production";
const STREAM_SLOT_MARKUP = "<tradjs-stream-slot></tradjs-stream-slot>";
const VIEW_TRANSITION_STYLE =
  "<style data-tradjs-view-transitions>@view-transition { navigation: auto; } @media (prefers-reduced-motion: reduce) { @view-transition { navigation: none; } }</style>";

function injectViewTransitions(html: string, enabled: boolean): string {
  if (!enabled || html.includes("data-tradjs-view-transitions")) return html;
  if (html.includes("</head>")) {
    return html.replace("</head>", `${VIEW_TRANSITION_STYLE}</head>`);
  }
  if (html.startsWith("<!DOCTYPE html>")) {
    return html.replace(
      "<!DOCTYPE html>",
      `<!DOCTYPE html>${VIEW_TRANSITION_STYLE}`,
    );
  }
  return `${VIEW_TRANSITION_STYLE}${html}`;
}

function applyRouteBodyAttributes(html: string, routePattern: string): string {
  if (!html.includes("<body")) return html;
  if (/data-page=/.test(html)) {
    return html.replace(
      /data-page="[^"]*"/,
      `data-page="${escapeHtml(routePattern)}"`,
    );
  }
  return html.replace("<body", `<body data-page="${escapeHtml(routePattern)}"`);
}

async function importConventionModule(
  filePath: string,
  convention: "page" | "layout" | "error",
) {
  return measureRequired(
    routeMeasure,
    {
      label: `Import ${convention}`,
      file: path.basename(filePath),
      result: () => ({ loaded: true }),
    },
    () => import(filePath),
  );
}

async function wrapWithLayouts(
  tree: Child,
  layoutPaths: string[],
): Promise<Child> {
  let wrappedTree = tree;

  for (let i = layoutPaths.length - 1; i >= 0; i--) {
    const layoutPath = layoutPaths[i];
    const layoutModule = await importConventionModule(layoutPath, "layout");
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
export async function frontendApp(
  options: FrontendAppOptions,
): Promise<string> {
  return measureRequired(
    routeMeasure,
    {
      label: "Render legacy frontend",
      entrypoint: options.entrypoint,
      result: (html: string) => ({ bytes: html.length }),
    },
    async () => {
      const {
        entrypoint,
        stylePath,
        title = "Frontend App",
        viewport = "width=device-width, initial-scale=1",
        viewTransitions = true,
        serverData = {},
        additionalAssets = [],
        meta = [],
        head = "",
        headerScripts = [],
      } = options;

      let stylesVirtualPath = "";
      if (stylePath) {
        try {
          stylesVirtualPath = await buildStyle(stylePath);
        } catch {
          await measureNote(routeMeasure, {
            label: "Legacy style omitted",
            file: path.basename(stylePath),
          });
        }
      }

      const builtAdditionalAssets: Array<{
        type: string;
        virtualPath: string;
      }> = [];
      for (const asset of additionalAssets) {
        const virtualPath = await buildAsset(Bun.file(asset.path));
        if (virtualPath) {
          builtAdditionalAssets.push({ type: asset.type, virtualPath });
        }
      }

      const scriptPath = entrypoint.startsWith("/")
        ? entrypoint
        : path.join(process.cwd(), entrypoint);

      const subpathImports = [
        "react-dom/client",
        "react/jsx-dev-runtime",
        "wouter/use-browser-location",
      ];

      const packagePath = path.resolve(process.cwd(), "package.json");
      const packageJson = (
        await import(packagePath, { assert: { type: "json" } })
      ).default;

      const importMaps = `
   <script type="importmap">
    ${serializeInlineScript(await imports(subpathImports, packageJson))}
    </script>
  `;

      const scriptVirtualPath = (await buildScript(scriptPath)) ?? "";
      if (!scriptVirtualPath) throw new Error("Failed to build script");

      const metaTags = meta
        .map(
          (m) =>
            `<meta name="${escapeHtml(m.name)}" content="${escapeHtml(m.content)}">`,
        )
        .join("\n");

      const additionalHead = builtAdditionalAssets
        .map(({ type, virtualPath }) =>
          type === "icon"
            ? `<link rel="icon" type="image/png" href="${escapeHtml(virtualPath)}">`
            : "",
        )
        .join("\n");

      // These two options are explicit raw HTML/JS escape hatches. Normal
      // document fields (title, viewport, meta, server data) are encoded.
      const headerScriptsHtml = headerScripts
        .map((script) => `<script>${script}</script>`)
        .join("\n");

      return injectViewTransitions(
        dedent`
        <!DOCTYPE html>
        <html>
          <head>
            ${importMaps}
            <meta charset="utf-8">
            <meta name="viewport" content="${escapeHtml(viewport)}">
            ${metaTags}
            <title>${escapeHtml(title)}</title>
            ${additionalHead}
            ${headerScriptsHtml}
            ${head}
            ${stylesVirtualPath ? `<link rel="stylesheet" href="${stylesVirtualPath}" >` : ""}
          </head>
          <body>
            <div id="root"></div>
            <script>
              window.SERVER_DATA = ${serializeInlineScript(serverData)};
            </script>
            <script src="${scriptVirtualPath}" type="module"></script>
          </body>
        </html>
      `,
        viewTransitions,
      );
    },
  );
}

// ─── Page Renderer ──────────────────────────────────────────────────────────────

/**
 * Render a page component to HTML with SSR.
 * Used by app router to render route components.
 */
export async function renderPage(options: RenderPageOptions): Promise<string> {
  return measureRequired(
    routeMeasure,
    {
      label: "Render standalone page",
      title: options.title ?? "TradJS App",
      result: (html: string) => ({ bytes: html.length }),
    },
    async () => {
      const {
        component: Component,
        clientComponent,
        stylePath,
        title = "TradJS App",
        params = {},
        props = {},
        viewport = "width=device-width, initial-scale=1",
        viewTransitions = true,
        meta = [],
      } = options;

      let stylesVirtualPath = "";
      if (stylePath) {
        try {
          stylesVirtualPath = await buildStyle(stylePath);
        } catch {
          await measureNote(routeMeasure, {
            label: "Standalone style omitted",
            file: path.basename(stylePath),
          });
        }
      }

      const subpathImports = ["react-dom/client", "react/jsx-dev-runtime"];
      let importMaps = "";
      try {
        importMaps = await measureRequired(
          routeMeasure,
          {
            label: "Generate standalone import map",
            result: (html: string) => ({ bytes: html.length }),
          },
          async () => {
            const packagePath = path.resolve(process.cwd(), "package.json");
            const packageJson = (
              await import(packagePath, { assert: { type: "json" } })
            ).default;
            return `
              <script type="importmap">
                ${serializeInlineScript(await imports(subpathImports, packageJson))}
              </script>
            `;
          },
        );
      } catch (error) {
        await measureNote(routeMeasure, {
          label: "Standalone import map omitted",
          error: errorMessage(error),
        });
      }

      let serverHtml = "";
      try {
        serverHtml = await measureRequired(
          routeMeasure,
          {
            label: "SSR standalone page",
            result: (html: string) => ({ bytes: html.length }),
          },
          () =>
            renderToStringAsync(createElement(Component, { ...props, params })),
        );
      } catch (error) {
        await measureNote(routeMeasure, {
          label: "Standalone SSR fallback to client",
          error: errorMessage(error),
        });
      }

      let scriptVirtualPath = "";
      if (clientComponent) {
        try {
          scriptVirtualPath = await buildScript(clientComponent);
        } catch {
          await measureNote(routeMeasure, {
            label: "Standalone client script omitted",
            file: path.basename(clientComponent),
          });
        }
      }

      const metaTags = meta
        .map(
          (m) =>
            `<meta name="${escapeHtml(m.name)}" content="${escapeHtml(m.content)}">`,
        )
        .join("\n");

      return injectViewTransitions(
        dedent`
        <!DOCTYPE html>
        <html>
          <head>
            ${importMaps}
            <meta charset="utf-8">
            <meta name="viewport" content="${escapeHtml(viewport)}">
            ${metaTags}
            <title>${escapeHtml(title)}</title>
            ${stylesVirtualPath ? `<link rel="stylesheet" href="${stylesVirtualPath}" >` : ""}
          </head>
          <body>
            <div id="root">${serverHtml}</div>
            <script>
              window.__TRADJS_DATA__ = ${serializeInlineScript({ params, props })};
            </script>
            ${scriptVirtualPath ? `<script src="${scriptVirtualPath}" type="module"></script>` : ""}
          </body>
        </html>
      `,
        viewTransitions,
      );
    },
  );
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
    appDir = path.join(process.cwd(), "app"),
    defaultTitle = "TradJS App",
    viewTransitions = true,
  } = options;

  const routes = discoverRoutes(appDir);
  console.log(`📁 Discovered ${routes.length} routes:`);
  routes.forEach((route) => {
    const typeIcon = route.type === "api" ? "⚡" : "📄";
    const layoutInfo =
      route.layouts.length > 0 ? ` (${route.layouts.length} layouts)` : "";
    const mwInfo =
      route.middlewares.length > 0
        ? ` [${route.middlewares.length} middleware]`
        : "";
    const errorInfo = route.errorPath ? " 🛡" : "";
    const loadingInfo = route.loadingPath ? " ⏳" : "";
    console.log(
      `   ${typeIcon} ${route.pattern} -> ${path.relative(process.cwd(), route.filePath)}${layoutInfo}${mwInfo}${errorInfo}${loadingInfo}`,
    );
  });

  let globalCss = options.globalCss;
  if (!globalCss) {
    const possiblePaths = [
      path.join(appDir, "globals.css"),
      path.join(appDir, "global.css"),
      path.join(appDir, "app.css"),
    ];
    for (const cssPath of possiblePaths) {
      if (existsSync(cssPath)) {
        globalCss = cssPath;
        console.log(
          `📄 Found global CSS: ${path.relative(process.cwd(), cssPath)}`,
        );
        break;
      }
    }
  }
  // ── SSG: Pre-render eligible pages at startup ──────────────────────────
  if (!isDev) {
    (async () => {
      try {
        const count = await ssgPrerender(routes, async (route) => {
          const pageModule = await importConventionModule(
            route.filePath,
            "page",
          );
          const PageComponent = pageModule.default || pageModule.Page;
          if (!PageComponent) {
            throw new Error(`No default export in ${route.filePath}`);
          }

          const tree = await wrapWithLayouts(
            createElement(PageComponent, { params: {} }),
            route.layouts,
          );

          const { value: html, head: headElements } = await collectHeadAsync(
            () => renderToStringAsync(tree),
          );

          let fullHtml = `<!DOCTYPE html>${html}`;

          if (globalCss) {
            try {
              const stylesPath = await buildStyle(globalCss);
              fullHtml = fullHtml.replace(
                "</head>",
                `<link rel="stylesheet" href="${stylesPath}"></head>`,
              );
            } catch {
              await measureNote(routeMeasure, {
                label: "SSG global CSS omitted",
                route: route.pattern,
              });
            }
          }

          fullHtml = injectHeadElements(fullHtml, headElements, defaultTitle);
          fullHtml = applyRouteBodyAttributes(fullHtml, route.pattern);

          return injectViewTransitions(fullHtml, viewTransitions);
        });
        if (count > 0) console.log(`⚡ SSG: Pre-rendered ${count} pages`);
      } catch {
        // The failed SSG measurement already owns the diagnostic. Startup keeps
        // serving dynamically instead of creating a duplicate console warning.
      }
    })();
  }

  return async (req: Request) => {
    const url = new URL(req.url);
    const pathname = url.pathname;

    const match = matchRoute(pathname, routes);

    if (!match) {
      const notFoundHtml = injectViewTransitions(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>404 - Not Found</title></head><body><h1>404 - Not Found</h1></body></html>`,
        viewTransitions,
      );
      return new Response(notFoundHtml, {
        status: 404,
        headers: { "Content-Type": "text/html" },
      });
    }

    // ── SSG: serve pre-rendered page from memory ──────────────────
    if (!isDev && match.route.type === "page") {
      const cached = getPrerendered(pathname);
      if (cached) {
        return new Response(cached, {
          headers: {
            "Content-Type": "text/html",
            "Cache-Control": "public, max-age=3600",
            "X-TradJS-SSG": "1",
          },
        });
      }
    }

    try {
      return await measureRequired(
        routeMeasure,
        {
          label: "Route dispatch",
          route: match.route.pattern,
          routeType: match.route.type,
          method: req.method,
          result: (response: Response) => ({ status: response.status }),
        },
        async () => {
          // ── Middleware Chain ─────────────────────────────────────────────
          // Execute middleware.ts files from root→page (outermost first).
          // Each middleware can short-circuit by returning a Response.
          if (match.route.middlewares.length > 0) {
            for (const mwPath of match.route.middlewares) {
              const mwResult = await measureRequired(
                routeMeasure,
                {
                  label: "Middleware",
                  route: match.route.pattern,
                  middleware: path.basename(path.dirname(mwPath)),
                  result: (result: unknown) =>
                    result instanceof Response
                      ? { status: result.status }
                      : {
                          outcome: result === undefined ? "continue" : "value",
                        },
                },
                async () => {
                  const mwModule = await import(mwPath);
                  const mwFn = mwModule.default || mwModule.middleware;
                  if (typeof mwFn === "function") {
                    return await mwFn(req, {
                      params: match.params,
                      route: match.route,
                    });
                  }
                },
              );
              // If middleware returns a Response, short-circuit
              if (mwResult instanceof Response) return mwResult;
            }
          }

          // Handle API routes
          if (match.route.type === "api") {
            const method = req.method.toUpperCase();
            return measureRequired(
              routeMeasure,
              {
                label: "API route",
                route: match.route.pattern,
                method,
                result: (response: Response) => ({ status: response.status }),
              },
              async () => {
                const apiModule = await import(match.route.filePath);
                const handler = apiModule[method] || apiModule.default;

                if (!handler) {
                  return new Response("Method Not Allowed", { status: 405 });
                }

                const response = await handler(req, { params: match.params });
                return response instanceof Response
                  ? response
                  : new Response(JSON.stringify(response), {
                      headers: { "Content-Type": "application/json" },
                    });
              },
            );
          }

          // Handle Page routes
          const pageModule = await importConventionModule(
            match.route.filePath,
            "page",
          );
          const PageComponent = pageModule.default || pageModule.Page;

          if (!PageComponent) {
            throw new Error(
              `No default export found in ${match.route.filePath}`,
            );
          }

          const pageTree = createElement(PageComponent, {
            params: match.params,
          });

          let stylesVirtualPath = "";
          if (globalCss) {
            try {
              stylesVirtualPath = await buildStyle(globalCss);
            } catch {
              await measureNote(routeMeasure, {
                label: "Global CSS omitted",
                route: match.route.pattern,
              });
            }
          }

          // Build page-scoped CSS if page.css exists alongside page.tsx
          let scopedStylePath = "";
          const pageCssPath = styleCompanionPath(match.route.filePath);
          if (existsSync(pageCssPath)) {
            try {
              scopedStylePath = await buildScopedStyle(
                pageCssPath,
                match.route.pattern,
              );
            } catch {
              await measureNote(routeMeasure, {
                label: "Scoped CSS omitted",
                route: match.route.pattern,
              });
            }
          }

          const clientScriptUrls: { url: string; type: "layout" | "page" }[] =
            [];

          for (const layoutPath of match.route.layouts) {
            const layoutClientPath = clientCompanionPath(layoutPath);
            if (existsSync(layoutClientPath)) {
              const scriptPath = await buildClientScript(layoutClientPath);
              clientScriptUrls.push({ url: scriptPath, type: "layout" });
            }
          }

          const pageClientPath = clientCompanionPath(match.route.filePath);
          if (existsSync(pageClientPath)) {
            try {
              const scriptPath = await buildClientScript(pageClientPath);
              if (scriptPath) {
                clientScriptUrls.push({ url: scriptPath, type: "page" });
              }
            } catch {
              await measureNote(routeMeasure, {
                label: "Page client omitted",
                route: match.route.pattern,
              });
            }
          }

          const clientScriptTags: string[] = [];
          if (clientScriptUrls.length > 0) {
            const paramsJson = serializeInlineScript(match.params);
            const bootstrapLines = clientScriptUrls.map(({ url, type }) => {
              return `import('${url}').then(m => { if (typeof m.default === 'function') m.default({ params }); }).catch(e => console.error('[tradjs] Failed to mount ${type} script:', e));`;
            });
            clientScriptTags.push(
              `<script type="module">\nconst params = ${paramsJson};\n${bootstrapLines.join("\n")}\n</script>`,
            );
          }

          const allClientPaths = [
            ...match.route.layouts.map(clientCompanionPath).filter(existsSync),
            ...(existsSync(pageClientPath) ? [pageClientPath] : []),
          ];
          const needsReactImportMap = allClientPaths.some((p) =>
            clientScriptsUsingReact.has(p),
          );

          let importMapTag = "";
          if (needsReactImportMap) {
            try {
              const importMapJson = serializeInlineScript(
                await imports(["react-dom/client", "react/jsx-dev-runtime"]),
              );
              importMapTag = `<script type="importmap">${importMapJson}</script>`;
            } catch {
              await measureNote(routeMeasure, {
                label: "React import map omitted",
                route: match.route.pattern,
              });
            }
          }
          const responseHeaders = {
            "Content-Type": "text/html",
            "Cache-Control": isDev ? "no-cache" : "public, max-age=3600",
          };

          const pageRender = await measureRequired(
            routeMeasure,
            {
              label: "SSR render page",
              route: match.route.pattern,
              result: (rendered: HeadCollection<string>) => ({
                bytes: rendered.value.length,
                headElements: rendered.head.length,
              }),
            },
            () => collectHeadAsync(() => renderToStringAsync(pageTree)),
          );
          const pageHtml = pageRender.value;
          const pageHeadElements = pageRender.head;

          const slotTree = await wrapWithLayouts(
            createElement("tradjs-stream-slot", {}),
            match.route.layouts,
          );

          const shellRender = await measureRequired(
            routeMeasure,
            {
              label: "SSR render shell",
              route: match.route.pattern,
              result: (rendered: HeadCollection<string>) => ({
                bytes: rendered.value.length,
                headElements: rendered.head.length,
              }),
            },
            () => collectHeadAsync(() => renderToStringAsync(slotTree)),
          );
          const shellHtmlOnly = shellRender.value;
          const layoutHeadElements = shellRender.head;
          const headElements = [...layoutHeadElements, ...pageHeadElements];

          let shellHtml = `<!DOCTYPE html>${shellHtmlOnly}`;

          if (stylesVirtualPath) {
            shellHtml = shellHtml.replace(
              "</head>",
              `<link rel="stylesheet" href="${stylesVirtualPath}"></head>`,
            );
          }

          if (scopedStylePath) {
            shellHtml = shellHtml.replace(
              "</head>",
              `<link rel="stylesheet" href="${scopedStylePath}"></head>`,
            );
          }

          shellHtml = applyRouteBodyAttributes(shellHtml, match.route.pattern);

          shellHtml = injectHeadElements(shellHtml, headElements, defaultTitle);

          if (importMapTag) {
            shellHtml = shellHtml.replace("</head>", `${importMapTag}</head>`);
          }

          shellHtml = injectViewTransitions(shellHtml, viewTransitions);

          const slotIndex = shellHtml.indexOf(STREAM_SLOT_MARKUP);

          if (slotIndex === -1) {
            let fullHtml = shellHtml + pageHtml;

            if (clientScriptTags.length > 0) {
              fullHtml = fullHtml.replace(
                "</body>",
                `${clientScriptTags.join("\n")}</body>`,
              );
            }

            return new Response(fullHtml, { headers: responseHeaders });
          }

          const prefix = shellHtml.slice(0, slotIndex);
          let suffix = shellHtml.slice(slotIndex + STREAM_SLOT_MARKUP.length);

          if (clientScriptTags.length > 0) {
            suffix = suffix.replace(
              "</body>",
              `${clientScriptTags.join("\n")}</body>`,
            );
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
        },
      );
    } catch (error) {
      const message = errorMessage(error);
      const stack = errorStack(error);

      // ── Error Boundary: render error.tsx if available ────────────
      if (match.route.errorPath) {
        try {
          const boundaryResponse = await measureRequired(
            routeMeasure,
            {
              label: "Render error boundary",
              route: match.route.pattern,
              file: path.basename(match.route.errorPath),
              result: (response: Response | null) =>
                response
                  ? { status: response.status }
                  : { outcome: "no component" },
            },
            async (): Promise<Response | null> => {
              const errorModule = await importConventionModule(
                match.route.errorPath!,
                "error",
              );
              const ErrorComponent = errorModule.default;
              if (!ErrorComponent) return null;

              const errorProps = {
                error: {
                  message: isDev ? message : "Internal Server Error",
                  stack: isDev ? stack : undefined,
                },
                pathname: url.pathname,
              };
              const errorTree = await wrapWithLayouts(
                createElement(ErrorComponent, errorProps),
                match.route.layouts,
              );

              const { value: errorHtml, head: errorHeadElements } =
                await collectHeadAsync(() => renderToStringAsync(errorTree));
              let fullErrorHtml = `<!DOCTYPE html>${errorHtml}`;

              fullErrorHtml = injectHeadElements(
                fullErrorHtml,
                errorHeadElements,
              );

              if (globalCss) {
                try {
                  const stylesPath = await buildStyle(globalCss);
                  fullErrorHtml = fullErrorHtml.replace(
                    "</head>",
                    `<link rel="stylesheet" href="${stylesPath}"></head>`,
                  );
                } catch {
                  await measureNote(routeMeasure, {
                    label: "Error-page CSS omitted",
                    route: match.route.pattern,
                  });
                }
              }

              fullErrorHtml = injectViewTransitions(
                fullErrorHtml,
                viewTransitions,
              );

              return new Response(fullErrorHtml, {
                status: 500,
                headers: { "Content-Type": "text/html" },
              });
            },
          );

          if (boundaryResponse) return boundaryResponse;
        } catch {
          await measureNote(routeMeasure, {
            label: "Using generic 500 fallback",
            route: match.route.pattern,
          });
        }
      }

      // Generic fallback error page
      return new Response(
        injectViewTransitions(
          `
        <!DOCTYPE html>
        <html>
          <head><meta charset="utf-8"><title>500 - Internal Server Error</title></head>
          <body>
            <h1>500 - Internal Server Error</h1>
            <pre>${isDev ? escapeHtml(stack) : "An error occurred"}</pre>
            <p>${isDev ? `Error: ${escapeHtml(message)}` : "Please try again later."}</p>
          </body>
        </html>
      `,
          viewTransitions,
        ),
        {
          status: 500,
          headers: { "Content-Type": "text/html" },
        },
      );
    }
  };
}

// ─── Quick Start ────────────────────────────────────────────────────────────────

const DEFAULT_APP_DIR_NAME = "app";

function hasConventionRoutes(dir: string): boolean {
  const routeSignals = [
    "page.tsx",
    "page.ts",
    "page.jsx",
    "page.js",
    "layout.tsx",
    "layout.ts",
    "layout.jsx",
    "layout.js",
    "middleware.ts",
    "middleware.tsx",
    "middleware.js",
    "error.tsx",
    "error.ts",
    "loading.tsx",
    "loading.ts",
  ];

  if (existsSync(path.join(dir, "api"))) {
    return true;
  }

  return routeSignals.some((file) => existsSync(path.join(dir, file)));
}

export function resolveAppDir(appDir?: string): string {
  if (appDir) {
    return path.isAbsolute(appDir)
      ? appDir
      : path.resolve(process.cwd(), appDir);
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
    `Could not find a TradJS app. Looked for ./${DEFAULT_APP_DIR_NAME}/ first, then route files in ${cwd}.`,
  );
}

export interface ServeAppOptions extends AppRouterOptions {
  port?: number;
  unix?: string;
  websocket?: unknown;
  /** Opt in to process-wide SIGINT/SIGTERM ownership (used by the CLI). */
  handleSignals?: boolean;
}

type TradJSServer = Awaited<ReturnType<typeof serveHttp>>;

export async function serve(options?: ServeAppOptions): Promise<TradJSServer>;
export async function serve(
  handler: Handler,
  options?: HttpServeOptions,
): Promise<TradJSServer>;
export async function serve(
  handlerOrOptions?: Handler | ServeAppOptions,
  serverOptions?: HttpServeOptions,
) {
  if (typeof handlerOrOptions === "function") {
    return serveHttp(handlerOrOptions, serverOptions);
  }

  const options = handlerOrOptions ?? {};
  const { port, unix, websocket, handleSignals, ...routerOptions } = options;
  const appDir = resolveAppDir(routerOptions.appDir);
  const router = createAppRouter({ ...routerOptions, appDir });
  return serveHttp(router, { port, unix, websocket, handleSignals });
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
