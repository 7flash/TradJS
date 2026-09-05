/**
 * TradJS server-side renderer.
 *
 * Sync and async rendering deliberately share the same element/attribute
 * serialization helpers so escaping and markup semantics cannot drift.
 */

import {
  Fragment,
  type VNode,
  type Child,
  type Component,
  type Props,
} from "../client/types";
import { Head } from "./head";
import { escapeHtml, htmlAttributeName, isSafeHtmlName } from "./html";

const VOID_ELEMENTS = new Set([
  "meta",
  "link",
  "img",
  "br",
  "input",
  "hr",
  "area",
  "base",
  "col",
  "embed",
  "param",
  "source",
  "track",
  "wbr",
]);

function styleObjectToString(style: Record<string, unknown>): string {
  return Object.entries(style)
    .filter(
      ([, value]) => value !== undefined && value !== null && value !== false,
    )
    .map(([key, value]) => {
      const cssName = key.startsWith("--")
        ? key
        : key.replace(/([A-Z])/g, "-$1").toLowerCase();
      return `${cssName}:${String(value)}`;
    })
    .join(";");
}

function renderAttributes(props: Props): string {
  let html = "";

  for (const [key, value] of Object.entries(props)) {
    if (
      key === "children" ||
      key === "key" ||
      key === "ref" ||
      key === "dangerouslySetInnerHTML" ||
      key.startsWith("on") ||
      value === undefined ||
      value === null ||
      value === false ||
      !isSafeHtmlName(key)
    ) {
      continue;
    }

    const attributeName = htmlAttributeName(key);

    if (key === "style" && typeof value === "object") {
      const style = styleObjectToString(value as Record<string, unknown>);
      if (style) html += ` style="${escapeHtml(style)}"`;
      continue;
    }

    if (value === true) {
      html += ` ${attributeName}`;
    } else {
      html += ` ${attributeName}="${escapeHtml(value)}"`;
    }
  }

  return html;
}

function renderOpenTag(tagName: string, props: Props): string {
  return `<${tagName}${renderAttributes(props)}>`;
}

function rawInnerHtml(props: Props): string | null {
  const raw = props.dangerouslySetInnerHTML;
  if (!raw || typeof raw !== "object" || !("__html" in raw)) return null;
  return String((raw as { __html?: unknown }).__html ?? "");
}

export function renderToString(vnode: VNode | Child): string {
  if (
    vnode === null ||
    vnode === undefined ||
    vnode === true ||
    vnode === false
  ) {
    return "";
  }
  if (typeof vnode === "string" || typeof vnode === "number") {
    return escapeHtml(vnode);
  }
  if (Array.isArray(vnode)) {
    return vnode.map((child) => renderToString(child)).join("");
  }

  const { type, props } = vnode as VNode;

  if (type === Fragment) return renderChildrenToString(props?.children);

  if (typeof type === "function") {
    if (type === Head) {
      Head(props || {});
      return "";
    }

    const result = (type as Component)(props || {});
    if (result instanceof Promise) {
      throw new Error(
        "renderToString() does not support async components; use renderToStringAsync() instead.",
      );
    }
    return renderToString(result);
  }

  const tagName = type as string;
  const propsObj = props || {};
  let html = renderOpenTag(tagName, propsObj);
  if (VOID_ELEMENTS.has(tagName)) return html;

  const raw = rawInnerHtml(propsObj);
  html += raw ?? renderChildrenToString(propsObj.children);
  html += `</${tagName}>`;
  return html;
}

export async function renderToStringAsync(
  vnode: VNode | Child | Promise<VNode | Child>,
): Promise<string> {
  if (
    vnode === null ||
    vnode === undefined ||
    vnode === true ||
    vnode === false
  ) {
    return "";
  }
  if (typeof vnode === "string" || typeof vnode === "number") {
    return escapeHtml(vnode);
  }
  if (Array.isArray(vnode)) {
    let html = "";
    for (const child of vnode) html += await renderToStringAsync(child);
    return html;
  }
  if (vnode instanceof Promise) {
    return renderToStringAsync(await vnode);
  }

  const { type, props } = vnode as VNode;

  if (type === Fragment) return renderChildrenAsync(props?.children);

  if (typeof type === "function") {
    if (type === Head) {
      Head(props || {});
      return "";
    }

    const result = (type as Component)(props || {});
    return renderToStringAsync(result);
  }

  const tagName = type as string;
  const propsObj = props || {};
  let html = renderOpenTag(tagName, propsObj);
  if (VOID_ELEMENTS.has(tagName)) return html;

  const raw = rawInnerHtml(propsObj);
  html += raw ?? (await renderChildrenAsync(propsObj.children));
  html += `</${tagName}>`;
  return html;
}

function renderChildrenToString(children: Child | Child[] | undefined): string {
  if (children === undefined || children === null) return "";
  if (Array.isArray(children)) {
    return children.map((child) => renderToString(child)).join("");
  }
  return renderToString(children);
}

async function renderChildrenAsync(
  children: Child | Child[] | undefined,
): Promise<string> {
  if (children === undefined || children === null) return "";
  if (Array.isArray(children)) {
    let html = "";
    for (const child of children) html += await renderToStringAsync(child);
    return html;
  }
  return renderToStringAsync(children);
}
