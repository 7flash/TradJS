/**
 * Server-side type definitions for TradJS
 */

export type HandlerResponse =
  Response | AsyncIterable<string> | string | object;

export type Handler = (
  req: Request,
) => HandlerResponse | Promise<HandlerResponse>;

/**
 * Per-request values shared from middleware to layouts, pages, error pages
 * and API handlers. Declare your own shape with the generic parameters:
 * `RouteContext<{ user: User }>`.
 */
export type Locals = Record<string, unknown>;

/** What middleware and API handlers receive as their second argument. */
export interface RouteContext<L extends object = Locals> {
  params: Record<string, string>;
  route: { pattern: string; filePath: string };
  locals: L;
}

/** Props of a page or layout component. `children` is set for layouts. */
export interface PageProps<L extends object = Locals> {
  params: Record<string, string>;
  /** Empty for prerendered (SSG) pages: they are shared by every visitor. */
  locals: Partial<L>;
  pathname?: string;
  children?: unknown;
}

export interface ImportConfig {
  name: string;
  version?: string;
  deps?: string[];
  external?: boolean | string[];
  markAllExternal?: boolean;
  baseName?: string;
  subpath?: string;
}

export type ImportMap = { imports: Record<string, string> };

export interface FrontendAppOptions {
  entrypoint: string;
  stylePath?: string;
  title?: string;
  viewport?: string;
  /** Enable same-origin cross-document View Transitions (default: true). */
  viewTransitions?: boolean;
  /** @deprecated Build invalidation is automatic; retained for API compatibility. */
  rebuild?: boolean;
  serverData?: any;
  additionalAssets?: Array<{ path: string; type: string }>;
  meta?: Array<{ name: string; content: string }>;
  head?: string;
  headerScripts?: string[];
}

export interface RenderPageOptions {
  /** The page component to render (server-side) */
  component: any;
  /** Path to client-side component for hydration */
  clientComponent?: string;
  /** Path to CSS file */
  stylePath?: string;
  /** Page title */
  title?: string;
  /** Route parameters from URL */
  params?: Record<string, any>;
  /** Additional props to pass to component */
  props?: Record<string, any>;
  /** Viewport meta tag */
  viewport?: string;
  /** Enable same-origin cross-document View Transitions (default: true). */
  viewTransitions?: boolean;
  /** Additional meta tags */
  meta?: Array<{ name: string; content: string }>;
}

export interface AppRouterOptions {
  /** 'production' enables SSG, caching and hidden error details. Default: from NODE_ENV when createAppRouter() runs. */
  mode?: "development" | "production";
  /** Path to app directory (default: ./app) */
  appDir?: string;
  /** Default title for pages */
  defaultTitle?: string;
  /** Path to global CSS file */
  globalCss?: string;
  /** Enable same-origin cross-document View Transitions (default: true). */
  viewTransitions?: boolean;
  /**
   * Cross-site request forgery protection (default: on). Cookie-bearing
   * POST/PUT/PATCH/DELETE from another site get 403. Pass
   * `{ allowedOrigins: ["https://admin.example"] }` to allow more origins,
   * or `false` to turn the check off (e.g. when a proxy rewrites Host and
   * you check origins yourself).
   */
  csrf?: boolean | { allowedOrigins?: string[] };
  /**
   * Folder of static files served as-is (default: `public` next to the app
   * folder; `false` turns it off). App routes win over a file with the same
   * path. Dotfiles and anything outside the folder are never served.
   */
  publicDir?: string | false;
  /** Cache-Control for public files (default: `public, max-age=0, must-revalidate`). */
  publicCacheControl?: string;
}
