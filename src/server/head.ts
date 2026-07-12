/**
 * <Head> Component — Declarative head management
 *
 * Collects <title>, <meta>, <link> etc. during SSR via a side-channel.
 * The app-router reads collected elements after renderToString() and
 * injects them into the <head> section of the final HTML.
 *
 * Usage in page components:
 * ```tsx
 * import { Head } from 'tradjs/web';
 *
 * export default function AboutPage() {
 *   return (
 *     <>
 *       <Head>
 *         <title>About Us</title>
 *         <meta name="description" content="Learn about our team" />
 *       </Head>
 *       <main>...</main>
 *     </>
 *   );
 * }
 * ```
 */

import {
  Fragment,
  type VNode,
  type Child,
  type Component,
} from "../client/types";

// ─── Side-Channel: Collected head elements ──────────────────────────────────────

let _headElements: string[] = [];

/** Reset head elements before each SSR pass. */
export function resetHead(): void {
  _headElements = [];
}

/** Get collected head elements after SSR. Returns raw HTML strings. */
export function getHeadElements(): string[] {
  return _headElements;
}

// ─── Head Element Rendering ─────────────────────────────────────────────────────

const VOID_ELEMENTS = new Set(["meta", "link", "base", "col"]);

function renderHeadChild(child: VNode | Child): string {
  if (
    child === null ||
    child === undefined ||
    child === true ||
    child === false
  )
    return "";
  if (typeof child === "string") return child;
  if (typeof child === "number") return String(child);
  if (Array.isArray(child)) return child.map(renderHeadChild).join("");

  const vnode = child as VNode;
  if (!vnode.type || typeof vnode.type === "function") return "";

  const tag = vnode.type as string;
  let html = `<${tag}`;

  for (const [key, value] of Object.entries(vnode.props || {})) {
    if (key === "children" || key === "key" || key === "ref") continue;
    if (value === undefined || value === null || value === false) continue;

    if (key === "className" || key === "class") {
      html += ` class="${String(value)}"`;
    } else if (value === true) {
      html += ` ${key}`;
    } else {
      html += ` ${key}="${String(value)}"`;
    }
  }

  html += ">";

  if (VOID_ELEMENTS.has(tag)) return html;

  // Render children (e.g. <title>Page Title</title>)
  const { children } = vnode.props;
  if (children !== undefined && children !== null) {
    if (Array.isArray(children)) {
      html += children.map(renderHeadChild).join("");
    } else {
      html += renderHeadChild(children);
    }
  }

  html += `</${tag}>`;
  return html;
}

// ─── Head Component ─────────────────────────────────────────────────────────────

/**
 * The Head component. During SSR, its children are collected into
 * the side-channel instead of being rendered into the body.
 * Returns null (renders nothing in the body).
 */
export function Head(props: { children?: Child | Child[] }): null {
  const { children } = props;
  if (!children) return null;

  const childArray = Array.isArray(children) ? children : [children];
  for (const child of childArray) {
    if (child && typeof child === "object" && "type" in child) {
      const html = renderHeadChild(child);
      if (html) _headElements.push(html);
    }
  }

  return null;
}
