import { createDomElement } from "./dom";
import { eventDescriptor, rawHtml, setDomProp, setRef } from "./props";
import { isEventProp } from "../shared/attributes";
type Child = Node | string | number | boolean | null | undefined | Child[];
type Tag = string | ((props: any) => Node);
export function createElement(
  tag: Tag,
  props: Record<string, any> | null,
  ...children: Child[]
): Node {
  const finalProps = { ...(props ?? {}) };
  if (children.length)
    finalProps.children = children.length === 1 ? children[0] : children;
  if (typeof tag === "function") return tag(finalProps);
  const el = createDomElement(tag);
  for (const [key, value] of Object.entries(finalProps)) {
    if (
      ["key", "children", "ref", "dangerouslySetInnerHTML", "value"].includes(
        key,
      )
    )
      continue;
    if (isEventProp(key)) {
      if (typeof value === "function") {
        const { type, capture } = eventDescriptor(key);
        el.addEventListener(type, value, capture);
      }
    } else setDomProp(el, key, value);
  }
  const raw = rawHtml(finalProps);
  if (raw !== null) el.innerHTML = raw;
  else appendChildren(el, [finalProps.children]);
  if (Object.hasOwn(finalProps, "value"))
    setDomProp(el, "value", finalProps.value);
  setRef(finalProps.ref, el);
  return el;
}
export function jsx(
  tag: Tag,
  props: Record<string, any> | null,
  _key?: string | number,
): Node {
  return createElement(tag, props);
}
export const jsxs = jsx;
export const jsxDEV = jsx;
function appendChildren(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child == null || typeof child === "boolean") continue;
    if (Array.isArray(child)) appendChildren(parent, child);
    else if (typeof child === "object" && typeof child.nodeType === "number")
      parent.appendChild(child);
    else
      parent.appendChild(
        (parent.ownerDocument ?? document).createTextNode(String(child)),
      );
  }
}
export function Fragment({ children }: { children?: Child }): DocumentFragment {
  const fragment = document.createDocumentFragment();
  appendChildren(fragment, [children]);
  return fragment;
}
export default { jsx, jsxs, jsxDEV, Fragment, createElement };
