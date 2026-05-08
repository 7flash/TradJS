/**
 * Server module barrel export.
 * 
 * Re-exports everything from the server sub-modules so that
 * `src/web.ts` remains a thin compatibility shim.
 */

// Types
export type {
    Handler,
    HandlerResponse,
    ImportConfig,
    ImportMap,
    FrontendAppOptions,
    RenderPageOptions,
    AppRouterOptions,
} from "./types";

// Import maps
export { imports } from "./imports";

// Build pipeline
export {
    buildScript,
    buildStyle,
    buildAsset,
    buildClientScript,
    buildCSSModule,
    asset,
    clearCaches,
    getContentType,
    builtAssets,
    buildCache,
} from "./build";

export type { CSSModuleResult } from "./build";

// HTTP server
export { serve as serveHttp, findAvailablePort } from "./serve";

// App router & page rendering
export {
    createAppRouter,
    resolveAppDir,
    renderPage,
    frontendApp,
    spa,
    serve,
    start,
} from "./app-router";

// Router (file-based route discovery)
export { discoverRoutes, matchRoute } from "./router";
export {
    discoverContractRoutes,
    assertRouteExpectation,
    catchAllRoutingContract,
} from "./router-contract";
export type { RouteExpectation } from "./router-contract";

// SSR
export { renderToString, renderToStringAsync } from "./ssr";

// Head component (declarative <head> management)
export { Head } from "./head";

// SSG (Static Site Generation)
export { prerender, getPrerendered, setPrerendered, clearSSGCache } from "./ssg";

// CLI Build (build-to-disk)
export { buildToDisk, parseBuildArgs } from "./cli-build";

// Hot Reload (dev only)
export { startHotReload, getHotReloadScript, handleHotReloadSSE, addClientScript } from "./hot-reload";
