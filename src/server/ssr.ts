import {
  Fragment,
  type VNode,
  type Child,
  type Component,
  type AsyncComponent,
} from "../client/types";
import { Head } from "./head";

const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const ESCAPE_RE = /[&<>"']/g;

function escapeHtml(str: string): string {
  return str.replace(ESCAPE_RE, (ch) => ESCAPE_MAP[ch]);
}

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

function isPromiseLike<T = unknown>(value: unknown): value is PromiseLike<T> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as any).then === "function"
  );
}

function renderAttributes(propsObj: Record<string, any>): string {
  let html = "";
  for (const [key, value] of Object.entries(propsObj)) {
    if (
      key === "children" ||
      key === "key" ||
      key === "ref" ||
      key.startsWith("on")
    ) {
      continue;
    }
    if (value === undefined || value === null || value === false) continue;
    if (key === "className" || key === "class") {
      html += ` class="${escapeHtml(String(value))}"`;
      continue;
    }
    if (key === "style" && typeof value === "object") {
      const styleStr = Object.entries(value)
        .map(([k, v]) => `${k.replace(/([A-Z])/g, "-$1").toLowerCase()}:${v}`)
        .join(";");
      html += ` style="${escapeHtml(styleStr)}"`;
      continue;
    }
    if (key === "dangerouslySetInnerHTML") continue;
    if (value === true) {
      html += ` ${key}`;
    } else {
      html += ` ${key}="${escapeHtml(String(value))}"`;
    }
  }
  return html;
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
  if (typeof vnode === "string") return escapeHtml(vnode);
  if (typeof vnode === "number") return String(vnode);
  if (Array.isArray(vnode)) {
    return vnode.map((child) => renderToString(child)).join("");
  }

  const { type, props } = vnode as VNode;
  if (type === Fragment) return renderChildrenToString(props?.children);

  if (typeof type === "function") {
    if (type === Head) {
      (type as any)(props || {});
      return "";
    }
    const result = (type as Component)(props || {});
    if (isPromiseLike(result)) {
      const componentName = (type as Function).name || "AnonymousComponent";
      const error = new Error(
        `renderToString() encountered async component "${componentName}". Use renderToStringAsync() or opt the route into async SSR.`,
      ) as Error & { code?: string; componentName?: string };
      error.code = "TRADJS_ASYNC_COMPONENT_IN_SYNC_RENDER";
      error.componentName = componentName;
      throw error;
    }
    return renderToString(result);
  }

  const tagName = type as string;
  const propsObj = props || {};
  let html = `<${tagName}${renderAttributes(propsObj)}>`;

  if (VOID_ELEMENTS.has(tagName)) return html;

  if (propsObj.dangerouslySetInnerHTML) {
    html += propsObj.dangerouslySetInnerHTML.__html;
  } else {
    html += renderChildrenToString(propsObj.children);
  }

  html += `</${tagName}>`;
  return html;
}

export async function renderToStringAsync(
  vnode: VNode | Child | PromiseLike<VNode | Child>,
): Promise<string> {
  if (isPromiseLike<VNode | Child>(vnode)) {
    return renderToStringAsync(await vnode);
  }
  if (
    vnode === null ||
    vnode === undefined ||
    vnode === true ||
    vnode === false
  ) {
    return "";
  }
  if (typeof vnode === "string") return escapeHtml(vnode);
  if (typeof vnode === "number") return String(vnode);
  if (Array.isArray(vnode)) {
    let html = "";
    for (const child of vnode) {
      html += await renderToStringAsync(child);
    }
    return html;
  }

  const { type, props } = vnode as VNode;
  if (type === Fragment) return renderChildrenAsync(props?.children);

  if (typeof type === "function") {
    if (type === Head) {
      (type as any)(props || {});
      return "";
    }
    const result = (type as Component<any> | AsyncComponent<any>)(props || {});
    return renderToStringAsync(result);
  }

  const tagName = type as string;
  const propsObj = props || {};
  let html = `<${tagName}${renderAttributes(propsObj)}>`;

  if (VOID_ELEMENTS.has(tagName)) return html;

  if (propsObj.dangerouslySetInnerHTML) {
    html += propsObj.dangerouslySetInnerHTML.__html;
  } else {
    html += await renderChildrenAsync(propsObj.children);
  }

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
    for (const child of children) {
      html += await renderToStringAsync(child);
    }
    return html;
  }
  return renderToStringAsync(children);
}
