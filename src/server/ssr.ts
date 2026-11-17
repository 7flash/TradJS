import {
  Fragment,
  type VNode,
  type Child,
  type Component,
  type AsyncComponent,
} from "../client/types";
import { Head } from "./head";
import { isRawTextElement, neutralizeRawTextEndTag, rawTextOf } from "./html";
import {
  attributeName,
  attributeValue,
  isEventProp,
  isSafeHtmlName,
  isUnsafeUrlAttribute,
  styleObjectToString,
} from "../shared/attributes";

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
  const entries = Object.entries(propsObj);
  for (const [index, [key, value]] of entries.entries()) {
    // HTML parsers keep the first duplicate attribute, but the DOM renderer
    // applies the last JSX prop. Resolve aliases before emitting markup.
    const mapped = attributeName(key).toLowerCase();
    if (entries.slice(index + 1).some(([later]) =>
      !isEventProp(later) && attributeName(later).toLowerCase() === mapped
    )) continue;
    if (
      key === "children" ||
      key === "key" ||
      key === "ref" ||
      key === "dangerouslySetInnerHTML" ||
      isEventProp(key) ||
      !isSafeHtmlName(key)
    ) {
      continue;
    }
    // false drops real HTML boolean attributes (attributeValue returns null);
    // aria-*, data-* and enumerated ones like draggable render "false".
    if (value === undefined || value === null) continue;
    // The browser renderer removes a falsy class instead of serializing "false".
    if ((key === "class" || key === "className") && value === false) continue;
    const name = attributeName(key);
    // Check a style object as the CSS text it becomes (url(javascript:...)).
    const checkedValue =
      name.toLowerCase() === "style" && typeof value === "object"
        ? styleObjectToString(value)
        : value;
    // srcdoc is a whole HTML document; javascript:/vbscript:/data: URLs run code.
    if (
      !isSafeHtmlName(name) ||
      name.toLowerCase() === "srcdoc" ||
      isUnsafeUrlAttribute(name, checkedValue)
    ) {
      continue;
    }
    if (key === "style" && typeof value === "object") {
      const styleText = styleObjectToString(value);
      if (styleText) html += ` style="${escapeHtml(styleText)}"`;
      continue;
    }
    // true on a non-boolean attribute (aria-hidden, draggable, data-*) is the
    // string "true": a bare name would mean "" ("auto" or invalid), not true.
    const serialized = attributeValue(name, value);
    if (serialized === null) continue;
    html += serialized === "" ? ` ${name}` : ` ${name}="${escapeHtml(serialized)}"`;
  }
  return html;
}

// A <select> uses option selectedness rather than a value attribute in HTML.
// The client applies its controlled value after mounting options; SSR must
// express the same initial selection in the markup.
function selectChildren(children: any, value: unknown): any {
  const selectedValues = new Set(
    Array.isArray(value) ? value.map(String) : [String(value)],
  );
  const visit = (child: any): any => {
    if (Array.isArray(child)) return child.map(visit);
    if (!child || typeof child !== "object") return child;
    if (child.type === Fragment || child.type === "optgroup")
      return { ...child, props: { ...child.props, children: visit(child.props?.children) } };
    if (child.type !== "option") return child;
    const props = child.props || {};
    const optionValue = props.value == null
      ? rawTextOf(props.children, Fragment)
      : String(props.value);
    return {
      ...child,
      props: { ...props, selected: selectedValues.has(optionValue) },
    };
  };
  return visit(children);
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
  if (!isSafeHtmlName(tagName)) throw new TypeError(`Invalid HTML tag name: ${tagName}`);
  const propsObj = props || {};
  const lowerTag = tagName.toLowerCase();
  const attrs = lowerTag === "select" || lowerTag === "textarea"
    ? { ...propsObj, value: undefined } : propsObj;
  let html = `<${tagName}${renderAttributes(attrs)}>`;

  if (VOID_ELEMENTS.has(tagName)) return html;

  if (propsObj.dangerouslySetInnerHTML) {
    html += propsObj.dangerouslySetInnerHTML.__html;
  } else if (isRawTextElement(tagName)) {
    html += neutralizeRawTextEndTag(rawTextOf(propsObj.children, Fragment), tagName);
  } else {
    const children = lowerTag === "select" && propsObj.value != null
      ? selectChildren(propsObj.children, propsObj.value) : propsObj.children;
    const body = lowerTag === "textarea" && propsObj.value != null
      ? escapeHtml(String(propsObj.value))
      : renderChildrenToString(children);
    // HTML parsing strips the first LF after a pre/textarea start tag.
    html += /^(?:pre|textarea)$/i.test(tagName) && body.startsWith("\n") ? "\n" + body : body;
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
  if (!isSafeHtmlName(tagName)) throw new TypeError(`Invalid HTML tag name: ${tagName}`);
  const propsObj = props || {};
  const lowerTag = tagName.toLowerCase();
  const attrs = lowerTag === "select" || lowerTag === "textarea"
    ? { ...propsObj, value: undefined } : propsObj;
  let html = `<${tagName}${renderAttributes(attrs)}>`;

  if (VOID_ELEMENTS.has(tagName)) return html;

  if (propsObj.dangerouslySetInnerHTML) {
    html += propsObj.dangerouslySetInnerHTML.__html;
  } else if (isRawTextElement(tagName)) {
    html += neutralizeRawTextEndTag(rawTextOf(propsObj.children, Fragment), tagName);
  } else {
    const children = lowerTag === "select" && propsObj.value != null
      ? selectChildren(propsObj.children, propsObj.value) : propsObj.children;
    const body = lowerTag === "textarea" && propsObj.value != null
      ? escapeHtml(String(propsObj.value))
      : await renderChildrenAsync(children);
    html += /^(?:pre|textarea)$/i.test(tagName) && body.startsWith("\n") ? "\n" + body : body;
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
