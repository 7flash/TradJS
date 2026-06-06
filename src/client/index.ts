/**
 * tradjs/client — Public API
 * 
 * This barrel re-exports from separated modules:
 * 
 *   types.ts       — VNode, Props, Child, Component, Fragment, JSX namespace
 *   render.ts      — Client-side VDOM renderer with pluggable reconciler (browser-only)
 *   reconcilers/   — Replaceable diffing strategies (keyed, sequential, custom)
 * 
 * SSR (renderToString) lives at src/ssr.ts — NOT here. The client directory
 * is bundled for the browser, and SSR code must never appear in client bundles.
 * 
 * Server code (src/web.ts) imports renderToString from 'tradjs/ssr' or '../ssr'.
 * Client code (page.client.tsx) imports { render } from 'tradjs/client'.
 */

// Types + Fragment symbol
export { Fragment } from './types';
export type { VNode, Props, Child, Component, JSX } from './types';

// VNode creation (shared by both client and server)
export { createElement, jsx, jsxs, jsxDEV } from './render';
export { createElement as h } from './render';

// Client-side renderer
export { render, navigate, Link, memo, setReconciler, getReconciler } from './render';
export type { Fiber, LinkProps, RenderOptions } from './render';

// Reconciler strategies (for advanced usage)
export { sequentialReconciler } from './reconcilers/sequential';
export { keyedReconciler } from './reconcilers/keyed';
export { replaceReconciler } from './reconcilers/replace';
export type { Reconciler, ReconcilerContext, ReconcilerName } from './reconcilers/types';

export default {};