/**
 * JSX Runtime for tradjs/client
 *
 * Entry point for Bun/TypeScript's automatic JSX transform.
 * When tsconfig has `"jsx": "react-jsx"` and `"jsxImportSource": "tradjs/client"`,
 * Bun auto-imports from `tradjs/client/jsx-runtime`.
 */
export { jsx, jsxs, jsxDEV, createElement } from "./render";
export { Fragment } from "./types";
export type { JSX } from "./types";
