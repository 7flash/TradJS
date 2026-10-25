import { AsyncLocalStorage } from "node:async_hooks";
import { Fragment, type VNode, type Child } from "../client/types";
import { escapeHtml, htmlAttributeName, isSafeHtmlName } from "./html";
import {
  attributeValue,
  isEventProp,
  styleObjectToString,
} from "../shared/attributes";
const headStorage = new AsyncLocalStorage<string[]>();
let fallbackHeadElements: string[] = [];
function currentHeadElements(): string[] {
  return headStorage.getStore() ?? fallbackHeadElements;
}
export function resetHead(): void {
  const elements = headStorage.getStore();
  if (elements) {
    elements.length = 0;
  } else {
    fallbackHeadElements = [];
  }
}
export function getHeadElements(): string[] {
  return [...currentHeadElements()];
}
export interface HeadCollection<T> {
  value: T;
  head: string[];
}
export function collectHead<T>(fn: () => T): HeadCollection<T> {
  const elements: string[] = [];
  const value = headStorage.run(elements, fn);
  return { value, head: [...elements] };
}
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
      isEventProp(key) ||
      !isSafeHtmlName(key)
    ) {
      continue;
    }
    if (value === undefined || value === null) continue;
    const attribute = htmlAttributeName(key);
    const serialized = attributeValue(
      attribute,
      key === "style" && typeof value === "object"
        ? styleObjectToString(value)
        : value,
    );
    if (serialized !== null)
      html += ` ${attribute}="${escapeHtml(serialized)}"`;
  }
  html += ">";
  if (VOID_ELEMENTS.has(tag.toLowerCase())) return html;
  const rawHtml = props.dangerouslySetInnerHTML;
  if (rawHtml && typeof rawHtml === "object" && "__html" in rawHtml) {
    html += String(
      (
        rawHtml as {
          __html?: unknown;
        }
      ).__html ?? "",
    );
  } else if (props.children !== undefined && props.children !== null) {
    html += renderHeadChild(props.children as HeadChild);
  }
  html += `</${tag}>`;
  return html;
}
export function Head(props: { children?: Child | Child[] }): null {
  const { children } = props;
  if (children === undefined || children === null) return null;
  const childArray = Array.isArray(children) ? children : [children];
  const elements = currentHeadElements();
  function collect(child: HeadChild): void {
    if (Array.isArray(child)) {
      child.forEach(collect);
      return;
    }
    if (child && typeof child === "object" && "type" in child) {
      if (child.type === Fragment) {
        collect(child.props.children ?? null);
        return;
      }
      const html = renderHeadChild(child);
      if (html) elements.push(html);
    }
  }
  childArray.forEach(collect);
  return null;
}
