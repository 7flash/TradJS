/**
 * Server-side type definitions for TradJS
 */

export type HandlerResponse =
  Response | AsyncIterable<string> | string | object;

export type Handler = (
  req: Request,
) => HandlerResponse | Promise<HandlerResponse>;

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
  /** Path to app directory (default: ./app) */
  appDir?: string;
  /** Default title for pages */
  defaultTitle?: string;
  /** Path to global CSS file */
  globalCss?: string;
  /** Enable same-origin cross-document View Transitions (default: true). */
  viewTransitions?: boolean;
}
