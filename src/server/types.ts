/**
 * Server-side type definitions for Melina.js
 */

import type { MeasureFn } from 'measure-fn';

export type HandlerResponse = Response | AsyncGenerator<string, void, unknown> | string | object;

export type Handler = (req: Request, measure: MeasureFn) => HandlerResponse | Promise<HandlerResponse>;

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
}
