import path from "path";
import { existsSync } from "fs";
import { dedent } from "ts-dedent";
import { canonicalPathname, discoverRoutes, matchRoute } from "./router";
import { createElement } from "../client/render";
import { renderToString, renderToStringAsync } from "./ssr";
import { collectHeadAsync, dedupeHead } from "./head";
import { imports } from "./imports";
import { injectViewTransitions } from "./document";
import {
  buildScript,
  buildStyle,
  collectServerCSSModuleUrls,
  registerServerCSSModules,
  buildClientScript,
  clientScriptsUsingReact,
  buildScopedStyle,
  buildAsset,
} from "./build";
import {
  getOrRenderPrerendered,
  isPrerenderedPath,
  resolveSSGConfig,
  prerender as ssgPrerender,
} from "./ssg";
import { serve as serveHttp } from "./serve";
import { withoutResponseBody } from "./response";
import { isNotFound } from "./not-found";
import { csrfRejection } from "./csrf";
import { httpMeasure } from "./measure";
import type {
  Handler,
  FrontendAppOptions,
  RenderPageOptions,
  AppRouterOptions,
} from "./types";

const isDev = process.env.NODE_ENV !== "production";
const STREAM_SLOT_MARKUP = "<tradjs-stream-slot></tradjs-stream-slot>";

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

async function addRouteCSSModuleLinks(
  html: string,
  entryPaths: readonly string[],
): Promise<string> {
  const urls = await collectServerCSSModuleUrls(entryPaths);
  const existing = new Set(
    [...html.matchAll(/<link\b[^>]*>/gi)]
      .filter(([tag]) => /\brel=["']stylesheet["']/i.test(tag))
      .map(([tag]) => /\bhref=["']([^"']+)["']/i.exec(tag)?.[1]),
  );
  const links = [...new Set(urls)]
    .filter((url) => !existing.has(url))
    .map((url) => `<link rel="stylesheet" href="${escapeHtml(url)}">`)
    .join("\n");
  if (!links) return html;
  if (/<\/head>/i.test(html))
    return html.replace(/<\/head>/i, `${links}</head>`);
  return html.replace(/<html\b[^>]*>/i, (open) => `${open}<head>${links}</head>`);
}

/** Route source extensions; `page.jsx` pairs with `page.client.tsx` like `page.tsx`. */
const ROUTE_EXT = /\.(tsx?|jsx?)$/;

function renderMetaTags(meta: readonly { name: string; content: string }[]): string {
  return meta
    .map(
      (item) =>
        `<meta name="${escapeHtml(item.name)}" content="${escapeHtml(item.content)}">`,
    )
    .join("\n");
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

/** Longest an async page render may take before the request fails (ms). */
export const SSR_TIMEOUT_MS = 30_000;

/**
 * A component that never resolves would otherwise hold the request open
 * forever. After the deadline the request fails like any render error
 * (error page, digest in the log); the component's own work is not stopped.
 */
function withRenderTimeout(render: Promise<string>, owner: string): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`[tradjs] ${owner}: async rendering took longer than ${renderTimeoutMs}ms`)),
      renderTimeoutMs,
    );
  });
  return Promise.race([render, deadline]).finally(() => clearTimeout(timer));
}

/** Test hook: shorten the render deadline. */
let renderTimeoutMs = SSR_TIMEOUT_MS;
export function setRenderTimeoutForTests(ms: number | null): void {
  renderTimeoutMs = ms ?? SSR_TIMEOUT_MS;
}

function renderServerTree(
  tree: any,
  asyncMode: boolean,
  owner: string,
): string | Promise<string> {
  if (asyncMode) return withRenderTimeout(renderToStringAsync(tree), owner);

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

async function wrapWithLayouts(
  tree: any,
  layoutPaths: string[],
  pathname: string,
  params: Record<string, string> = {},
  locals: Record<string, unknown> = {},
) {
  let wrappedTree = tree;
  let hasAsyncLayout = false;
  for (let i = layoutPaths.length - 1; i >= 0; i--) {
    const layoutModule = await import(layoutPaths[i]);
    const LayoutComponent = layoutModule.default;
    if (LayoutComponent) {
      hasAsyncLayout ||= isDeclaredAsyncComponent(LayoutComponent);
      // Layouts get the same route params as the page (e.g. a layout for
      // /teams/[team] needs `team`).
      wrappedTree = createElement(LayoutComponent, {
        children: wrappedTree,
        pathname,
        params,
        locals,
      });
    }
  }
  return { tree: wrappedTree, hasAsyncLayout };
}

export function createClientBootstrap(
  scripts: { url: string; type: "layout" | "page" }[],
  params: Record<string, any>,
  dev = isDev,
): string {
  if (scripts.length === 0) return "";
  const scriptEntries = safeJson(scripts);
  const paramsJson = safeJson(params);
  const devJson = JSON.stringify(dev);
  return `<script type="module" blocking="render" data-tradjs-client>
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
// In production only a failed mount covers the page; a later error (a click
// handler, a third-party script) is logged and the working page stays usable.
const __tradjsReportRuntimeError=(error,label)=>{
  if(__tradjsDev)__tradjsShowClientError(error,label);
  else console.error('[tradjs] '+label,error);
};
window.addEventListener('error',(event)=>__tradjsReportRuntimeError(event.error||event.message,'Unhandled client error'));
const __tradjsIsSkippedTransition=(error)=>{
  const name=error?.name;
  const message=typeof error?.message==='string'?error.message:'';
  return (name==='AbortError'&&/transition/i.test(message))||
    (name==='TimeoutError'&&/view[ -]?transition/i.test(message));
};
window.addEventListener('unhandledrejection',(event)=>{
  if(__tradjsIsSkippedTransition(event.reason)){event.preventDefault();return}
  __tradjsReportRuntimeError(event.reason,'Unhandled promise rejection');
});
for(const entry of __tradjsScripts){
  try{
    const m=await import(entry.url);
    if(typeof m.default==='function')await m.default({params:__tradjsParams});
    else if(__tradjsDev)console.warn('[tradjs] '+entry.type+' script '+entry.url+' has no default export to mount');
  }catch(error){
    __tradjsShowClientError(error,'Failed to mount '+entry.type+' script');
    break;
  }
}
</script>`;
}

function renderGenericErrorPage(
  error: unknown,
  viewTransitions: boolean,
  dev = isDev,
): string {
  const value = error as any;
  const message = value?.message || String(error);
  const stack = value?.stack || message;
  const detail = dev ? stack : "Internal Server Error";
  return injectViewTransitions(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>500 - Internal Server Error</title></head><body style="margin:0;background:#120f12;color:#fff;font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"><main style="padding:24px;max-width:1200px;margin:0 auto"><h1 style="color:#ff6b6b">500 - Internal Server Error</h1><p>${escapeHtml(dev ? message : "The request could not be rendered.")}</p><pre style="white-space:pre-wrap;word-break:break-word;background:#1d171d;border:1px solid #3a2c3a;border-radius:8px;padding:16px;overflow:auto">${escapeHtml(detail)}</pre></main></body></html>`,
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

  const metaTags = renderMetaTags(meta);
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
          <meta name="viewport" content="${escapeHtml(viewport)}">
          ${metaTags}
          <title>${escapeHtml(title)}</title>
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

  // Collect <Head> per render; a page <title> replaces the default title.
  const { value: serverHtml, head: headElements } = await collectHeadAsync(async () =>
    renderServerTree(
      createElement(Component, { ...props, params }),
      isDeclaredAsyncComponent(Component),
      "renderPage() component",
    ),
  );
  const headHasTitle = headElements.some((el) => /^<title[\s>]/i.test(el));

  let scriptVirtualPath = "";
  if (clientComponent) {
    scriptVirtualPath = (await buildScript(clientComponent)) ?? "";
    if (!scriptVirtualPath) {
      throw new Error(`Client component build failed: ${clientComponent}`);
    }
  }

  const metaTags = renderMetaTags(meta);

  return injectViewTransitions(
    dedent`
      <!DOCTYPE html>
      <html>
        <head>
          ${importMaps}
          <meta charset="utf-8">
          <meta name="viewport" content="${escapeHtml(viewport)}">
          ${metaTags}
          ${headHasTitle ? "" : `<title>${escapeHtml(title)}</title>`}
          ${headElements.join("\n")}
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

/** Turn what an API handler returned into a Response. */
function apiResultResponse(result: unknown): Response {
  if (result instanceof Response) return result;
  if (result === undefined) return new Response(null, { status: 204 });
  if (
    result !== null &&
    typeof result === "object" &&
    typeof (result as AsyncIterable<unknown>)[Symbol.asyncIterator] === "function"
  ) {
    // Async iterables stream as chunked text; each item is one chunk.
    const iterator = (result as AsyncIterable<unknown>)[Symbol.asyncIterator]();
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const item = await iterator.next();
          if (item.done) controller.close();
          else
            controller.enqueue(
              item.value instanceof Uint8Array ? item.value : encoder.encode(String(item.value)),
            );
        } catch (error) {
          controller.error(error);
        }
      },
      async cancel(reason) {
        await iterator.return?.(reason);
      },
    });
    return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  let json: string | undefined;
  try {
    json = JSON.stringify(result);
  } catch {
    json = undefined;
  }
  if (json === undefined) {
    return new Response(
      "API response is not JSON-serializable (BigInt, circular references and functions are not supported)",
      { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }
  return new Response(json, { headers: { "Content-Type": "application/json; charset=utf-8" } });
}

const BUILT_IN_NOT_FOUND =
  '<!DOCTYPE html><html><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">' +
  "<title>404 - Not Found</title></head><body><h1>404 - Not Found</h1></body></html>";

/** The nearest not-found.(tsx|ts|jsx|js) from the page's folder up to appDir. */
function nearestNotFoundFile(pageFile: string, appDir: string): string | undefined {
  const root = path.resolve(appDir);
  let dir = path.dirname(path.resolve(pageFile));
  while (true) {
    for (const ext of [".tsx", ".ts", ".jsx", ".js"]) {
      const file = path.join(dir, `not-found${ext}`);
      if (existsSync(file)) return file;
    }
    if (dir === root || path.dirname(dir) === dir) return undefined;
    dir = path.dirname(dir);
  }
}

/** Route-scoped stylesheet (`page.css` beside the page), shared by SSR and SSG. */
async function buildRouteScopedStyle(
  routeFilePath: string,
  pattern: string,
): Promise<string> {
  const pageCssPath = routeFilePath.replace(ROUTE_EXT, ".css");
  if (!existsSync(pageCssPath)) return "";
  try {
    return await buildScopedStyle(pageCssPath, pattern);
  } catch (error) {
    console.warn("Failed to build scoped CSS:", error);
    return "";
  }
}

/** Layout and page client bundles, their bootstrap and the React import map,
 *  shared by dynamic rendering and SSG so prerendered pages stay interactive. */
async function collectClientAssets(
  routeFilePath: string,
  layouts: string[],
  params: Record<string, any>,
  dev = isDev,
): Promise<{ clientBootstrap: string; importMapTag: string }> {
  const clientScriptUrls: { url: string; type: "layout" | "page" }[] = [];
  const clientPaths: string[] = [];
  const add = async (clientPath: string, type: "layout" | "page") => {
    if (!existsSync(clientPath)) return;
    const scriptPath = await buildClientScript(clientPath);
    if (!scriptPath) {
      throw new Error(
        `[tradjs] ${type === "layout" ? "Layout" : "Page"} client bundle produced no output: ${clientPath}`,
      );
    }
    clientScriptUrls.push({ url: scriptPath, type });
    clientPaths.push(clientPath);
  };
  for (const layoutPath of layouts) {
    await add(layoutPath.replace(ROUTE_EXT, ".client.tsx"), "layout");
  }
  await add(routeFilePath.replace(ROUTE_EXT, ".client.tsx"), "page");

  let importMapTag = "";
  if (clientPaths.some((clientPath) => clientScriptsUsingReact.has(clientPath))) {
    try {
      const importMapJson = JSON.stringify(
        await imports(["react-dom/client", "react/jsx-dev-runtime"]),
      );
      importMapTag = `<script type="importmap">${importMapJson}</script>`;
    } catch (error) {
      console.warn("Failed to generate React import maps:", error);
    }
  }
  return {
    clientBootstrap: createClientBootstrap(clientScriptUrls, params, dev),
    importMapTag,
  };
}

export function createAppRouter(
  options: AppRouterOptions = {},
): Handler & { ready: Promise<number> } {
  // Decided per router (default: NODE_ENV when the router is created), not at import.
  const isDev =
    (options.mode ?? (process.env.NODE_ENV === "production" ? "production" : "development")) !==
    "production";
  let resolveReady!: (count: number) => void;
  const ready = new Promise<number>((resolve) => (resolveReady = resolve));
  registerServerCSSModules();
  const { appDir = path.join(process.cwd(), "app"), viewTransitions = true } =
    options;
  const csrfOptions =
    options.csrf === false
      ? undefined
      : options.csrf === true || options.csrf === undefined
        ? {}
        : options.csrf;
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

  /**
   * A URL no route matches gets the nearest not-found page: start in the
   * deepest app folder the URL names, walk up to appDir, and wrap it in the
   * layouts from appDir down to that page's folder.
   */
  const renderUnmatchedNotFound = async (pathname: string): Promise<Response | undefined> => {
    const root = path.resolve(appDir);
    let dir = root;
    for (const segment of pathname.split("/").filter(Boolean)) {
      const next = path.join(dir, segment);
      if (!next.startsWith(root + path.sep) || !existsSync(next)) break;
      dir = next;
    }
    const boundary = nearestNotFoundFile(path.join(dir, "page.tsx"), appDir);
    if (!boundary) return undefined;
    try {
      const mod = await import(boundary);
      if (typeof mod.default !== "function") return undefined;
      const layouts: string[] = [];
      let current = root;
      const parts = path.relative(root, path.dirname(boundary)).split(path.sep).filter(Boolean);
      for (let i = 0; i <= parts.length; i++) {
        for (const ext of [".tsx", ".ts", ".jsx", ".js"]) {
          const file = path.join(current, `layout${ext}`);
          if (existsSync(file)) { layouts.push(file); break; }
        }
        if (i < parts.length) current = path.join(current, parts[i]!);
      }
      const wrapped = await wrapWithLayouts(createElement(mod.default, {}), layouts, pathname);
      let html = `<!DOCTYPE html>${await renderServerTree(
        wrapped.tree,
        isDeclaredAsyncComponent(mod.default) || wrapped.hasAsyncLayout,
        "not-found page",
      )}`;
      if (globalCss) {
        try {
          const stylesPath = await buildStyle(globalCss);
          html = html.replace("</head>", `<link rel="stylesheet" href="${stylesPath}"></head>`);
        } catch {}
      }
      return new Response(injectViewTransitions(html, viewTransitions), {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    } catch (error) {
      console.error("not-found page failed:", error);
      return undefined;
    }
  };

  const renderSSGRoute = async (route: any, params: Record<string, string> = {}) => {
    const pageModule = await import(route.filePath);
    const PageComponent = pageModule.default || pageModule.Page;
    if (!PageComponent) {
      throw new Error(`No default export in ${route.filePath}`);
    }

    const pageIsAsync = isDeclaredAsyncComponent(PageComponent);
    const wrapped = await wrapWithLayouts(
      createElement(PageComponent, { params }),
      route.layouts,
      route.pattern,
      params,
    );

    const { value: html, head: headElements } = await collectHeadAsync(async () =>
      renderServerTree(
        wrapped.tree,
        pageIsAsync || wrapped.hasAsyncLayout,
        `SSG route ${route.pattern}`,
      ),
    );
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

    const scopedStylePath = await buildRouteScopedStyle(
      route.filePath,
      route.pattern,
    );
    if (scopedStylePath) {
      fullHtml = fullHtml.replace(
        "</head>",
        `<link rel="stylesheet" href="${scopedStylePath}"></head>`,
      );
    }
    const { clientBootstrap, importMapTag } = await collectClientAssets(
      route.filePath,
      route.layouts,
      {},
      isDev,
    );
    if (importMapTag) {
      fullHtml = fullHtml.replace("</head>", `${importMapTag}</head>`);
    }
    if (clientBootstrap) {
      fullHtml = fullHtml.replace("</head>", `${clientBootstrap}</head>`);
    }

    fullHtml = await addRouteCSSModuleLinks(fullHtml, [
      route.filePath, ...route.layouts,
    ]);
    fullHtml = applyRouteBodyAttributes(fullHtml, route.pattern);
    return injectViewTransitions(fullHtml, viewTransitions);
  };

  if (!isDev) {
    void (async () => {
      try {
        const count = await ssgPrerender(routes, renderSSGRoute);
        if (count > 0) console.log(`⚡ SSG: Pre-rendered ${count} pages`);
        resolveReady(count);
      } catch (error: any) {
        console.warn("SSG prerender failed:", error?.message || error);
        resolveReady(0);
      }
    })();
  } else {
    resolveReady(0);
  }

  const handle = async (req: Request) => {
    const url = new URL(req.url);
    // The decoded, normalized path: what route matching used, so layouts
    // and the SSG cache see one pathname for /a and /a/.
    const pathname = canonicalPathname(url.pathname) ?? url.pathname;
    // Before middleware and routes: a forged cross-site write never runs.
    if (csrfOptions) {
      const rejected = csrfRejection(req, url, csrfOptions);
      if (rejected) return rejected;
    }
    const match = matchRoute(url.pathname, routes);

    if (!match) {
      const custom = await renderUnmatchedNotFound(pathname);
      if (custom) return custom;
      const notFoundHtml = injectViewTransitions(
        BUILT_IN_NOT_FOUND,
        viewTransitions,
      );
      return new Response(notFoundHtml, {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    // One object per request: middleware fills it, layouts, pages, error
    // pages and API handlers read it.
    const locals: Record<string, unknown> = {};

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
                    locals,
                  })
                : undefined;
            },
          );
          if (mwResult instanceof Response) return mwResult;
        }
      }

      // Prerendered pages are served only after middleware has run, so an
      // auth check in middleware also guards SSG pages. Behind middleware the
      // response may depend on the user: keep it out of shared caches.
      if (
        !isDev &&
        match.route.type === "page" &&
        // Routes with params are static only for the paths ssgParams() listed;
        // any other path renders dynamically.
        (match.route.paramNames.length === 0 || isPrerenderedPath(pathname))
      ) {
        const pageModule = await import(match.route.filePath);
        const config = resolveSSGConfig(pageModule.ssg);
        if (config) {
          const html = await getOrRenderPrerendered(
            pathname,
            () => renderSSGRoute(match.route, match.params),
            config.revalidateMs,
          );
          const maxAge =
            config.revalidateMs === undefined
              ? 3600
              : Math.floor(config.revalidateMs / 1000);
          return new Response(html, {
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              // Behind middleware the page may depend on who asks: never cache it.
              "Cache-Control":
                match.route.middlewares.length > 0
                  ? "no-store"
                  : `public, max-age=${maxAge}`,
              "X-TradJS-SSG": "1",
            },
          });
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
            const exportedMethods = Object.keys(apiModule)
              .filter(
                (name) =>
                  name !== "default" && typeof apiModule[name] === "function",
              )
              .map((name) => name.toUpperCase());
            const allowedMethods = new Set(exportedMethods);
            if (allowedMethods.has("GET")) allowedMethods.add("HEAD");
            allowedMethods.add("OPTIONS");
            const allow = [...allowedMethods].join(", ");

            // Answer OPTIONS only when the route does not handle it itself
            // (a CORS preflight handler or a default export).
            if (method === "OPTIONS" && !apiModule.OPTIONS && !apiModule.default) {
              return new Response(null, {
                status: 204,
                headers: { Allow: allow },
              });
            }

            const handler =
              apiModule[method] ||
              (method === "HEAD" ? apiModule.GET : undefined) ||
              apiModule.default;
            if (!handler) {
              return new Response("Method Not Allowed", {
                status: 405,
                headers: { Allow: allow },
              });
            }
            let response: Response;
            try {
              const result = await handler(req, { params: match.params, route: match.route, locals });
              response = apiResultResponse(result);
            } catch (error) {
              if (isNotFound(error)) {
                response = new Response("Not Found", {
                  status: 404,
                  headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
                });
                return method === "HEAD"
                  ? new Response(null, { status: 404, headers: response.headers })
                  : response;
              }
              console.error(`API ${match.route.pattern} failed:`, error);
              // The stack only in development; never internals in production.
              response = new Response(
                isDev
                  ? error instanceof Error
                    ? error.stack || error.message
                    : String(error)
                  : "Internal Server Error",
                { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } },
              );
            }
            return method === "HEAD"
              ? new Response(null, {
                  status: response.status,
                  statusText: response.statusText,
                  headers: response.headers,
                })
              : response;
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
      const pageTree = createElement(PageComponent, { params: match.params, locals });

      let stylesVirtualPath = "";
      if (globalCss) {
        try {
          stylesVirtualPath = await buildStyle(globalCss);
        } catch (error) {
          console.warn("Failed to build global CSS:", error);
        }
      }

      const scopedStylePath = await buildRouteScopedStyle(
        match.route.filePath,
        match.route.pattern,
      );
      const { clientBootstrap, importMapTag } = await collectClientAssets(
        match.route.filePath,
        match.route.layouts,
        match.params,
        isDev,
      );

      const responseHeaders = {
        "Content-Type": "text/html; charset=utf-8",
        // Server-rendered pages may depend on the request (cookies, auth):
        // only prerendered public pages are cacheable.
        "Cache-Control": "no-store",
      };

      const pageIsAsync = isDeclaredAsyncComponent(PageComponent);

      const pageRender = await collectHeadAsync(() => httpMeasure.measure(
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
      ));
      const pageHtml = pageRender.value;
      const pageHeadElements = pageRender.head;

      const wrappedShell = await wrapWithLayouts(
        createElement("tradjs-stream-slot", {}),
        match.route.layouts,
        pathname,
        match.params,
        locals,
      );
      const shellRender = await collectHeadAsync(() => httpMeasure.measure(
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
      ));
      const shellHtmlOnly = shellRender.value;
      const layoutHeadElements = shellRender.head;
      // The page is collected after its layouts, so its <title>/<meta> win.
      const headElements = dedupeHead([...layoutHeadElements, ...pageHeadElements]);

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
      if (clientBootstrap) {
        shellHtml = shellHtml.replace("</head>", `${clientBootstrap}</head>`);
      }
      shellHtml = await addRouteCSSModuleLinks(shellHtml, [
        match.route.filePath, ...match.route.layouts,
      ]);
      shellHtml = injectViewTransitions(shellHtml, viewTransitions);

      const slotIndex = shellHtml.indexOf(STREAM_SLOT_MARKUP);
      if (slotIndex === -1) {
        return new Response(shellHtml + pageHtml, { headers: responseHeaders });
      }

      const prefix = shellHtml.slice(0, slotIndex);
      const suffix = shellHtml.slice(slotIndex + STREAM_SLOT_MARKUP.length);

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
      // notFound() is not an error: answer 404 with the nearest not-found page.
      if (isNotFound(error)) {
        const notFoundHeaders = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };
        const boundary = nearestNotFoundFile(match.route.filePath, appDir);
        if (boundary) {
          try {
            const mod = await import(boundary);
            if (typeof mod.default === "function") {
              const boundaryDir = path.dirname(boundary);
              // Layouts from the root down to the boundary's folder.
              const layouts = match.route.layouts.filter((layout: string) => {
                const rel = path.relative(path.dirname(layout), boundaryDir);
                return !rel.startsWith("..") && !path.isAbsolute(rel);
              });
              const wrapped = await wrapWithLayouts(createElement(mod.default, {}), layouts, pathname);
              let html = `<!DOCTYPE html>${await renderServerTree(
                wrapped.tree,
                isDeclaredAsyncComponent(mod.default) || wrapped.hasAsyncLayout,
                `not-found page for ${match.route.pattern}`,
              )}`;
              if (globalCss) {
                try {
                  const stylesPath = await buildStyle(globalCss);
                  html = html.replace("</head>", `<link rel="stylesheet" href="${stylesPath}"></head>`);
                } catch {}
              }
              return new Response(injectViewTransitions(html, viewTransitions), {
                status: 404,
                headers: notFoundHeaders,
              });
            }
          } catch (boundaryError) {
            // A broken not-found page must not turn a deliberate 404 into a 500.
            console.error("not-found page failed:", boundaryError);
          }
        }
        return new Response(injectViewTransitions(BUILT_IN_NOT_FOUND, viewTransitions), {
          status: 404,
          headers: notFoundHeaders,
        });
      }
      // A short id ties what the visitor sees to the full error in the server log.
      const digest = crypto.randomUUID().slice(0, 8);
      console.error(`Error rendering page [${digest}]:`, error);
      // In production error.tsx never sees the raw message: it can carry SQL,
      // file paths or other internals.
      const errorMessage = isDev
        ? error?.message || String(error)
        : "An unexpected error occurred.";
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
                digest,
              },
              pathname: url.pathname,
            };
            const errorIsAsync = isDeclaredAsyncComponent(ErrorComponent);
            const wrappedError = await wrapWithLayouts(
              createElement(ErrorComponent, { ...errorProps, locals }),
              match.route.layouts,
              pathname,
              match.params,
              locals,
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
            fullErrorHtml = await addRouteCSSModuleLinks(fullErrorHtml, [
              match.route.errorPath!,
              ...match.route.layouts,
            ]);
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

      return new Response(renderGenericErrorPage(error, viewTransitions, isDev), {
        status: 500,
        headers: {
          "Content-Type": "text/html",
          "Cache-Control": "no-store",
        },
      });
    }
  };
  /** Resolves with the number of prerendered SSG pages (0 in development). */
  // HEAD gets the same status and headers as GET, never a body.
  const handler = async (req: Request) => {
    const response = await handle(req);
    return req.method === "HEAD" && response instanceof Response
      ? withoutResponseBody(response)
      : response;
  };
  return Object.assign(handler, { ready });
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
  hostname?: string;
  handleSignals?: boolean;
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
  const { port, unix, hostname, handleSignals, ...routerOptions } = options;
  const appDir = resolveAppDir(routerOptions.appDir);
  const router = createAppRouter({ ...routerOptions, appDir });
  return serveHttp(router, { port, unix, hostname, handleSignals });
}

export async function start(options: ServeAppOptions = {}) {
  return serve(options);
}
