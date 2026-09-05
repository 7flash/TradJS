/**
 * <Head> Component — request-scoped declarative head management.
 *
 * Head elements are collected in AsyncLocalStorage so concurrent SSR requests
 * cannot reset or consume each other's metadata. A small fallback collector is
 * retained for direct/manual renderToString() usage outside a managed context.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { Fragment, type VNode, type Child } from "../client/types";
import { escapeHtml, htmlAttributeName, isSafeHtmlName } from "./html";

const headStorage = new AsyncLocalStorage<string[]>();
let fallbackHeadElements: string[] = [];

function currentHeadElements(): string[] {
  return headStorage.getStore() ?? fallbackHeadElements;
}

/** Reset the active collector, or the manual fallback collector when unscoped. */
export function resetHead(): void {
  const elements = headStorage.getStore();
  if (elements) {
    elements.length = 0;
  } else {
    fallbackHeadElements = [];
  }
}

/** Return a snapshot so callers cannot mutate the active collector. */
export function getHeadElements(): string[] {
  return [...currentHeadElements()];
}

export interface HeadCollection<T> {
  value: T;
  head: string[];
}

/** Run synchronous SSR with an isolated head collector. */
export function collectHead<T>(fn: () => T): HeadCollection<T> {
  const elements: string[] = [];
  const value = headStorage.run(elements, fn);
  return { value, head: [...elements] };
}

/** Run async SSR with an isolated head collector that survives awaits. */
export async function collectHeadAsync<T>(
  fn: () => Promise<T>,
): Promise<HeadCollection<T>> {
  const elements: string[] = [];
  const value = await headStorage.run(elements, fn);
  return { value, head: [...elements] };
}

const VOID_ELEMENTS = new Set(["meta", "link", "base", "col"]);

type HeadChild = Child | HeadChild[];

function renderHeadChild(child: HeadChild): string {
  if (
    child === null ||
    child === undefined ||
    child === true ||
    child === false
  ) {
    return "";
  }
  if (typeof child === "string" || typeof child === "number") {
    return escapeHtml(child);
  }
  if (Array.isArray(child)) return child.map(renderHeadChild).join("");

  const vnode = child as VNode;
  if (!vnode.type || typeof vnode.type === "function") return "";

  const props = vnode.props ?? {};
  if (vnode.type === Fragment) {
    return renderHeadChild((props.children ?? null) as HeadChild);
  }

  const tag = vnode.type as string;
  if (!isSafeHtmlName(tag)) return "";
  let html = `<${tag}`;

  for (const [key, value] of Object.entries(props)) {
    if (
      key === "children" ||
      key === "key" ||
      key === "ref" ||
      key === "dangerouslySetInnerHTML" ||
      key.startsWith("on") ||
      !isSafeHtmlName(key)
    ) {
      continue;
    }
    if (value === undefined || value === null || value === false) continue;

    const attribute = htmlAttributeName(key);
    if (value === true) {
      html += ` ${attribute}`;
    } else {
      html += ` ${attribute}="${escapeHtml(value)}"`;
    }
  }

  html += ">";
  if (VOID_ELEMENTS.has(tag)) return html;

  const rawHtml = props.dangerouslySetInnerHTML;
  if (rawHtml && typeof rawHtml === "object" && "__html" in rawHtml) {
    html += String((rawHtml as { __html?: unknown }).__html ?? "");
  } else if (props.children !== undefined && props.children !== null) {
    html += renderHeadChild(props.children as HeadChild);
  }

  html += `</${tag}>`;
  return html;
}

/** Collect head children and render nothing into the body. */
export function Head(props: { children?: Child | Child[] }): null {
  const { children } = props;
  if (children === undefined || children === null) return null;

  const childArray = Array.isArray(children) ? children : [children];
  const elements = currentHeadElements();

  for (const child of childArray) {
    if (child && typeof child === "object" && "type" in child) {
      const html = renderHeadChild(child);
      if (html) elements.push(html);
    }
  }

  return null;
}
