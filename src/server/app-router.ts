import path from "path";
import { existsSync } from "fs";
import { dedent } from "ts-dedent";
import { discoverRoutes, matchRoute } from "./router";
import { createElement } from "../client/render";
import { renderToString, renderToStringAsync } from "./ssr";
import { resetHead, getHeadElements } from "./head";
import { imports } from "./imports";
import {
  buildScript,
  buildStyle,
  buildClientScript,
  clientScriptsUsingReact,
  buildScopedStyle,
  buildAsset,
} from "./build";
import { getPrerendered, prerender as ssgPrerender } from "./ssg";
import { serve as serveHttp } from "./serve";
import { httpMeasure } from "./measure";
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

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (ch) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[ch]!,
  );
}

function safeJson(value: unknown): string {
  const json = JSON.stringify(value) ?? "null";
  return json.replace(/</g, "\\u003c");
}

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
    return html.replace(/data-page="[^"]*"/, `data-page="${routePattern}"`);
  }
  return html.replace("<body", `<body data-page="${routePattern}"`);
}

function isDeclaredAsyncComponent(component: unknown): boolean {
  return (
    typeof component === "function" &&
    Object.prototype.toString.call(component) === "[object AsyncFunction]"
  );
}

function renderServerTree(
  tree: any,
  asyncMode: boolean,
  owner: string,
): string | Promise<string> {
  if (asyncMode) return renderToStringAsync(tree);

  try {
    return renderToString(tree);
  } catch (error: any) {
    if (error?.code === "TRADJS_ASYNC_COMPONENT_IN_SYNC_RENDER") {
      const nested = error.componentName ? ` "${error.componentName}"` : "";
      const wrapped = new Error(
        `[tradjs] ${owner} uses synchronous SSR but rendered async component${nested}. Declare the page or participating layout async to opt this route into async SSR.`,
      );
      (wrapped as any).cause = error;
      throw wrapped;
    }
    throw error;
  }
}

async function wrapWithLayouts(tree: any, layoutPaths: string[]) {
  let wrappedTree = tree;
  let hasAsyncLayout = false;
  for (let i = layoutPaths.length - 1; i >= 0; i--) {
    const layoutModule = await import(layoutPaths[i]);
    const LayoutComponent = layoutModule.default;
    if (LayoutComponent) {
      hasAsyncLayout ||= isDeclaredAsyncComponent(LayoutComponent);
      wrappedTree = createElement(LayoutComponent, { children: wrappedTree });
    }
  }
  return { tree: wrappedTree, hasAsyncLayout };
}

function createClientBootstrap(
  scripts: { url: string; type: "layout" | "page" }[],
  params: Record<string, any>,
): string {
  if (scripts.length === 0) return "";
  const scriptEntries = safeJson(scripts);
  const paramsJson = safeJson(params);
  const devJson = JSON.stringify(isDev);
  return `<script type="module">
const __tradjsDev=${devJson};
const __tradjsParams=${paramsJson};
const __tradjsScripts=${scriptEntries};
const __tradjsDescribeError=(error)=>{
  if(error instanceof Error)return error.stack||error.message;
  if(typeof error==='string')return error;
  try{return JSON.stringify(error,null,2)}catch{return String(error)}
};
const __tradjsShowClientError=(error,label='Client error')=>{
  console.error('[tradjs] '+label,error);
  let overlay=document.getElementById('__tradjs-error-overlay');
  if(!overlay){
    overlay=document.createElement('div');
    overlay.id='__tradjs-error-overlay';
    overlay.style.cssText='position:fixed;inset:0;z-index:2147483647;background:#120f12;color:#fff;font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;padding:24px;overflow:auto;white-space:normal';
    const title=document.createElement('h1');
    title.style.cssText='margin:0 0 16px;font:700 20px/1.3 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#ff6b6b';
    title.dataset.tradjsErrorTitle='1';
    overlay.appendChild(title);
    const detail=document.createElement('pre');
    detail.style.cssText='margin:0;white-space:pre-wrap;word-break:break-word;background:#1d171d;border:1px solid #3a2c3a;border-radius:8px;padding:16px';
    detail.dataset.tradjsErrorDetail='1';
    overlay.appendChild(detail);
    document.body.appendChild(overlay);
  }
  const title=overlay.querySelector('[data-tradjs-error-title]');
  const detail=overlay.querySelector('[data-tradjs-error-detail]');
  if(title)title.textContent='TradJS: '+label;
  if(detail)detail.textContent=__tradjsDev?__tradjsDescribeError(error):'The client failed to start. Check the server and browser logs.';
};
window.addEventListener('error',(event)=>__tradjsShowClientError(event.error||event.message,'Unhandled client error'));
window.addEventListener('unhandledrejection',(event)=>__tradjsShowClientError(event.reason,'Unhandled promise rejection'));
for(const entry of __tradjsScripts){
  import(entry.url)
    .then(async(m)=>{if(typeof m.default==='function')await m.default({params:__tradjsParams})})
    .catch((error)=>__tradjsShowClientError(error,'Failed to mount '+entry.type+' script'));
}
</script>`;
}

function renderGenericErrorPage(
  error: unknown,
  viewTransitions: boolean,
): string {
  const value = error as any;
  const message = value?.message || String(error);
  const stack = value?.stack || message;
  const detail = isDev ? stack : "Internal Server Error";
  return injectViewTransitions(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>500 - Internal Server Error</title></head><body style="margin:0;background:#120f12;color:#fff;font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"><main style="padding:24px;max-width:1200px;margin:0 auto"><h1 style="color:#ff6b6b">500 - Internal Server Error</h1><p>${escapeHtml(isDev ? message : "The request could not be rendered.")}</p><pre style="white-space:pre-wrap;word-break:break-word;background:#1d171d;border:1px solid #3a2c3a;border-radius:8px;padding:16px;overflow:auto">${escapeHtml(detail)}</pre></main></body></html>`,
    viewTransitions,
  );
}

export async function spa(options: FrontendAppOptions): Promise<string> {
  return frontendApp(options);
}

export async function frontendApp(
  options: FrontendAppOptions,
): Promise<string> {
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
      console.warn(`Style not found: ${stylePath}`);
    }
  }

  const assetPaths: string[] = [];
  for (const asset of additionalAssets) {
    const virtualPath = await buildAsset(Bun.file(asset.path));
    if (virtualPath) assetPaths.push(virtualPath);
  }

  const scriptPath = entrypoint.startsWith("/")
    ? entrypoint
    : path.join(process.cwd(), entrypoint);
  const packagePath = path.resolve(process.cwd(), "package.json");
  const packageJson = (await import(packagePath, { assert: { type: "json" } }))
    .default;
  const importMaps = `<script type="importmap">${JSON.stringify(
    await imports(
      [
        "react-dom/client",
        "react/jsx-dev-runtime",
        "wouter/use-browser-location",
      ],
      packageJson,
    ),
  )}</script>`;
  const scriptVirtualPath = (await buildScript(scriptPath)) ?? "";
  if (!scriptVirtualPath)
    throw new Error(`Failed to build script: ${scriptPath}`);

  const metaTags = meta
    .map((item) => `<meta name="${item.name}" content="${item.content}">`)
    .join("\n");
  const additionalHead = additionalAssets
    .map((asset) =>
      asset.type === "icon"
        ? `<link rel="icon" type="image/png" href="${assetPaths[0] || ""}">`
        : "",
    )
    .join("\n");
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
          <meta name="viewport" content="${viewport}">
          ${metaTags}
          <title>${title}</title>
          ${additionalHead}
          ${headerScriptsHtml}
          ${head}
          ${stylesVirtualPath ? `<link rel="stylesheet" href="${stylesVirtualPath}">` : ""}
        </head>
        <body>
          <div id="root"></div>
          <script>window.SERVER_DATA = ${safeJson(serverData)};</script>
          <script src="${scriptVirtualPath}" type="module"></script>
        </body>
      </html>
    `,
    viewTransitions,
  );
}

export async function renderPage(options: RenderPageOptions): Promise<string> {
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
      console.warn(`Style not found: ${stylePath}`);
    }
  }

  let importMaps = "";
  try {
    const packagePath = path.resolve(process.cwd(), "package.json");
    const packageJson = (
      await import(packagePath, { assert: { type: "json" } })
    ).default;
    importMaps = `<script type="importmap">${JSON.stringify(
      await imports(["react-dom/client", "react/jsx-dev-runtime"], packageJson),
    )}</script>`;
  } catch (error) {
    console.warn("Could not generate import map:", error);
  }

  const serverHtml = await renderServerTree(
    createElement(Component, { ...props, params }),
    isDeclaredAsyncComponent(Component),
    "renderPage() component",
  );

  let scriptVirtualPath = "";
  if (clientComponent) {
    scriptVirtualPath = (await buildScript(clientComponent)) ?? "";
    if (!scriptVirtualPath) {
      throw new Error(`Client component build failed: ${clientComponent}`);
    }
  }

  const metaTags = meta
    .map((item) => `<meta name="${item.name}" content="${item.content}">`)
    .join("\n");

  return injectViewTransitions(
    dedent`
      <!DOCTYPE html>
      <html>
        <head>
          ${importMaps}
          <meta charset="utf-8">
          <meta name="viewport" content="${viewport}">
          ${metaTags}
          <title>${title}</title>
          ${stylesVirtualPath ? `<link rel="stylesheet" href="${stylesVirtualPath}">` : ""}
        </head>
        <body>
          <div id="root">${serverHtml}</div>
          <script>window.__TRADJS_DATA__ = ${safeJson({ params, props })};</script>
          ${scriptVirtualPath ? `<script src="${scriptVirtualPath}" type="module"></script>` : ""}
        </body>
      </html>
    `,
    viewTransitions,
  );
}

export function createAppRouter(options: AppRouterOptions = {}): Handler {
  const { appDir = path.join(process.cwd(), "app"), viewTransitions = true } =
    options;
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
    for (const cssPath of [
      path.join(appDir, "globals.css"),
      path.join(appDir, "global.css"),
      path.join(appDir, "app.css"),
    ]) {
      if (existsSync(cssPath)) {
        globalCss = cssPath;
        console.log(
          `📄 Found global CSS: ${path.relative(process.cwd(), cssPath)}`,
        );
        break;
      }
    }
  }

  if (!isDev) {
    void (async () => {
      try {
        const count = await ssgPrerender(routes, async (route: any) => {
          const pageModule = await import(route.filePath);
          const PageComponent = pageModule.default || pageModule.Page;
          if (!PageComponent) {
            throw new Error(`No default export in ${route.filePath}`);
          }

          const pageIsAsync = isDeclaredAsyncComponent(PageComponent);
          const wrapped = await wrapWithLayouts(
            createElement(PageComponent, { params: {} }),
            route.layouts,
          );

          resetHead();
          const html = await renderServerTree(
            wrapped.tree,
            pageIsAsync || wrapped.hasAsyncLayout,
            `SSG route ${route.pattern}`,
          );
          const headElements = getHeadElements();
          let fullHtml = `<!DOCTYPE html>${html}`;

          if (globalCss) {
            try {
              const stylesPath = await buildStyle(globalCss);
              fullHtml = fullHtml.replace(
                "</head>",
                `<link rel="stylesheet" href="${stylesPath}"></head>`,
              );
            } catch {}
          }

          if (headElements.length > 0) {
            fullHtml = fullHtml.replace(
              "</head>",
              `${headElements.join("\n")}</head>`,
            );
          }

          fullHtml = applyRouteBodyAttributes(fullHtml, route.pattern);
          return injectViewTransitions(fullHtml, viewTransitions);
        });
        if (count > 0) console.log(`⚡ SSG: Pre-rendered ${count} pages`);
      } catch (error: any) {
        console.warn("SSG prerender failed:", error?.message || error);
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
      if (match.route.middlewares.length > 0) {
        for (const mwPath of match.route.middlewares) {
          const mwResult = await httpMeasure.measure(
            {
              start: () => `Middleware: ${path.basename(path.dirname(mwPath))}`,
              end: (result: unknown) =>
                result instanceof Response
                  ? { status: result.status }
                  : { result: result === undefined ? "continue" : "value" },
              catch: (error: unknown) => {
                throw error;
              },
            },
            async () => {
              const mwModule = await import(mwPath);
              const mwFn = mwModule.default || mwModule.middleware;
              return typeof mwFn === "function"
                ? mwFn(req, {
                    params: match.params,
                    route: match.route,
                  })
                : undefined;
            },
          );
          if (mwResult instanceof Response) return mwResult;
        }
      }

      if (match.route.type === "api") {
        return httpMeasure.measure(
          {
            start: () => `API: ${match.route.pattern}`,
            end: (response: Response) => ({ status: response.status }),
            catch: (error: unknown) => {
              throw error;
            },
          },
          async () => {
            const apiModule = await import(match.route.filePath);
            const method = req.method.toUpperCase();
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

      const pageModule = await httpMeasure.measure(
        {
          start: () => "Import page",
          end: () => ({ file: path.basename(match.route.filePath) }),
          catch: (error: unknown) => {
            throw error;
          },
        },
        () => import(match.route.filePath),
      );
      const PageComponent = pageModule.default || pageModule.Page;
      if (!PageComponent) {
        throw new Error(`No default export found in ${match.route.filePath}`);
      }
      const pageTree = createElement(PageComponent, { params: match.params });

      let stylesVirtualPath = "";
      if (globalCss) {
        try {
          stylesVirtualPath = await buildStyle(globalCss);
        } catch (error) {
          console.warn("Failed to build global CSS:", error);
        }
      }

      let scopedStylePath = "";
      const pageCssPath = match.route.filePath.replace(
        /\.(tsx?|jsx?)$/,
        ".css",
      );
      if (existsSync(pageCssPath)) {
        try {
          scopedStylePath = await buildScopedStyle(
            pageCssPath,
            match.route.pattern,
          );
        } catch (error) {
          console.warn("Failed to build scoped CSS:", error);
        }
      }

      const clientScriptUrls: { url: string; type: "layout" | "page" }[] = [];
      for (const layoutPath of match.route.layouts) {
        const layoutClientPath = layoutPath.replace(/\.tsx?$/, ".client.tsx");
        if (existsSync(layoutClientPath)) {
          const scriptPath = await buildClientScript(layoutClientPath);
          if (!scriptPath) {
            throw new Error(
              `[tradjs] Layout client bundle produced no output: ${layoutClientPath}`,
            );
          }
          clientScriptUrls.push({ url: scriptPath, type: "layout" });
        }
      }

      const pageClientPath = match.route.filePath.replace(
        /\.tsx?$/,
        ".client.tsx",
      );
      if (existsSync(pageClientPath)) {
        const scriptPath = await buildClientScript(pageClientPath);
        if (!scriptPath) {
          throw new Error(
            `[tradjs] Page client bundle produced no output: ${pageClientPath}`,
          );
        }
        clientScriptUrls.push({ url: scriptPath, type: "page" });
      }

      const clientBootstrap = createClientBootstrap(
        clientScriptUrls,
        match.params,
      );
      const allClientPaths = [
        ...match.route.layouts
          .map((layoutPath: string) =>
            layoutPath.replace(/\.tsx?$/, ".client.tsx"),
          )
          .filter(existsSync),
        ...(existsSync(pageClientPath) ? [pageClientPath] : []),
      ];
      const needsReactImportMap = allClientPaths.some((clientPath) =>
        clientScriptsUsingReact.has(clientPath),
      );

      let importMapTag = "";
      if (needsReactImportMap) {
        try {
          const importMapJson = JSON.stringify(
            await imports(["react-dom/client", "react/jsx-dev-runtime"]),
          );
          importMapTag = `<script type="importmap">${importMapJson}</script>`;
        } catch (error) {
          console.warn("Failed to generate React import maps:", error);
        }
      }

      const responseHeaders = {
        "Content-Type": "text/html",
        "Cache-Control": isDev ? "no-cache" : "public, max-age=3600",
      };

      const pageIsAsync = isDeclaredAsyncComponent(PageComponent);

      resetHead();
      const pageHtml = await httpMeasure.measure(
        {
          start: () => "SSR renderPage",
          end: (html: string) => ({ bytes: html.length }),
          catch: (error: unknown) => {
            throw error;
          },
        },
        () =>
          renderServerTree(
            pageTree,
            pageIsAsync,
            `page ${match.route.pattern}`,
          ),
      );
      const pageHeadElements = [...getHeadElements()];

      const wrappedShell = await wrapWithLayouts(
        createElement("tradjs-stream-slot", {}),
        match.route.layouts,
      );
      resetHead();
      const shellHtmlOnly = await httpMeasure.measure(
        {
          start: () => "SSR renderShell",
          end: (html: string) => ({ bytes: html.length }),
          catch: (error: unknown) => {
            throw error;
          },
        },
        () =>
          renderServerTree(
            wrappedShell.tree,
            wrappedShell.hasAsyncLayout,
            `layout shell for ${match.route.pattern}`,
          ),
      );
      const layoutHeadElements = [...getHeadElements()];
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
      if (headElements.length > 0) {
        shellHtml = shellHtml.replace(
          "</head>",
          `${headElements.join("\n")}</head>`,
        );
      }
      if (importMapTag) {
        shellHtml = shellHtml.replace("</head>", `${importMapTag}</head>`);
      }
      shellHtml = injectViewTransitions(shellHtml, viewTransitions);

      const slotIndex = shellHtml.indexOf(STREAM_SLOT_MARKUP);
      if (slotIndex === -1) {
        let fullHtml = shellHtml + pageHtml;
        if (clientBootstrap) {
          fullHtml = fullHtml.replace("</body>", `${clientBootstrap}</body>`);
        }
        return new Response(fullHtml, { headers: responseHeaders });
      }

      const prefix = shellHtml.slice(0, slotIndex);
      let suffix = shellHtml.slice(slotIndex + STREAM_SLOT_MARKUP.length);
      if (clientBootstrap) {
        suffix = suffix.replace("</body>", `${clientBootstrap}</body>`);
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
      console.error("Error rendering page:", error);
      const errorMessage = error?.message || String(error);
      const errorStack = error?.stack || "No stack trace available";

      if (match.route.errorPath) {
        try {
          const errorModule = await import(match.route.errorPath);
          const ErrorComponent = errorModule.default;
          if (ErrorComponent) {
            const errorProps = {
              error: {
                message: errorMessage,
                stack: isDev ? errorStack : undefined,
              },
              pathname: url.pathname,
            };
            const errorIsAsync = isDeclaredAsyncComponent(ErrorComponent);
            const wrappedError = await wrapWithLayouts(
              createElement(ErrorComponent, errorProps),
              match.route.layouts,
            );

            const errorHtml = await renderServerTree(
              wrappedError.tree,
              errorIsAsync || wrappedError.hasAsyncLayout,
              `error boundary for ${match.route.pattern}`,
            );
            let fullErrorHtml = `<!DOCTYPE html>${errorHtml}`;
            if (globalCss) {
              try {
                const stylesPath = await buildStyle(globalCss);
                fullErrorHtml = fullErrorHtml.replace(
                  "</head>",
                  `<link rel="stylesheet" href="${stylesPath}"></head>`,
                );
              } catch {}
            }
            fullErrorHtml = injectViewTransitions(
              fullErrorHtml,
              viewTransitions,
            );
            return new Response(fullErrorHtml, {
              status: 500,
              headers: {
                "Content-Type": "text/html",
                "Cache-Control": "no-store",
              },
            });
          }
        } catch (errorBoundaryError) {
          console.error("Error boundary itself failed:", errorBoundaryError);
        }
      }

      return new Response(renderGenericErrorPage(error, viewTransitions), {
        status: 500,
        headers: {
          "Content-Type": "text/html",
          "Cache-Control": "no-store",
        },
      });
    }
  };
}

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
  if (existsSync(path.join(dir, "api"))) return true;
  return routeSignals.some((file) => existsSync(path.join(dir, file)));
}

export function resolveAppDir(appDir?: string): string {
  if (appDir) {
    return path.isAbsolute(appDir)
      ? appDir
      : path.resolve(process.cwd(), appDir);
  }

  const defaultAppDir = path.resolve(process.cwd(), DEFAULT_APP_DIR_NAME);
  if (existsSync(defaultAppDir)) return defaultAppDir;

  const cwd = process.cwd();
  if (hasConventionRoutes(cwd)) return cwd;

  throw new Error(
    `Could not find a TradJS app. Looked for ./${DEFAULT_APP_DIR_NAME}/ first, then route files in ${cwd}.`,
  );
}

export interface ServeAppOptions extends AppRouterOptions {
  port?: number;
  unix?: string;
}

export async function serve(options?: ServeAppOptions): Promise<any>;
export async function serve(
  handler: Handler,
  options?: { port?: number; unix?: string; websocket?: any },
): Promise<any>;
export async function serve(
  handlerOrOptions?: Handler | ServeAppOptions,
  serverOptions?: { port?: number; unix?: string; websocket?: any },
) {
  if (typeof handlerOrOptions === "function") {
    return serveHttp(handlerOrOptions, serverOptions);
  }
  const options = handlerOrOptions ?? {};
  const { port, unix, ...routerOptions } = options;
  const appDir = resolveAppDir(routerOptions.appDir);
  const router = createAppRouter({ ...routerOptions, appDir });
  return serveHttp(router, { port, unix });
}

export async function start(options: ServeAppOptions = {}) {
  return serve(options);
}
