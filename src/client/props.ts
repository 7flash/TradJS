import { assignElementStyle, domAttributeName, setElementClass, SVG_NS, MATH_NS } from "./dom";
import {
  attributeValue,
  foreignAttribute,
  isEventProp,
  isSafeHtmlName,
  isUnsafeUrlAttribute,
  styleObjectToString,
} from "../shared/attributes";
export function eventDescriptor(key: string): {
  type: string;
  capture: boolean;
} {
  const capture = /Capture$/.test(key);
  let type = key.slice(2, capture ? -7 : undefined).toLowerCase();
  if (type === "doubleclick") type = "dblclick";
  return { type, capture };
}
export function setRef(ref: unknown, element: Element | null): void {
  if (typeof ref === "function") ref(element);
  else if (ref && typeof ref === "object" && "current" in ref)
    ref.current = element;
}
export function rawHtml(props: Record<string, unknown>): string | null {
  const raw = props.dangerouslySetInnerHTML;
  return raw && typeof raw === "object" && "__html" in raw
    ? String(raw.__html ?? "")
    : null;
}
export function isFormStateProp(el: Element, key: string): boolean {
  return (
    (key === "value" && ["input", "textarea", "select"].includes(el.localName)) ||
    (key === "checked" && el.localName === "input") ||
    (key === "selected" && el.localName === "option")
  );
}
export function setDomProp(el: Element, key: string, value: unknown): void {
  if (!isSafeHtmlName(key) || isEventProp(key)) return;
  const foreign = el.namespaceURI === SVG_NS || el.namespaceURI === MATH_NS
    ? foreignAttribute(key, el.namespaceURI)
    : null;
  const name = foreign?.name ?? domAttributeName(el, key);
  const remove = () => {
    if (foreign?.namespace) el.removeAttributeNS(foreign.namespace, foreign.localName);
    else el.removeAttribute(name);
  };
  if (!isSafeHtmlName(name) || isEventProp(name)) return;
  const checkedValue =
    name.toLowerCase() === "style" && value && typeof value === "object"
      ? styleObjectToString(value as Record<string, unknown>)
      : value;
  if (name.toLowerCase() === "srcdoc" || isUnsafeUrlAttribute(name, checkedValue)) {
    // Same rule as server rendering; also drop a value set by an earlier render.
    remove();
    return;
  }
  if (key === "className" || key === "class") {
    setElementClass(el, value);
    return;
  }
  if (key === "style" && value && typeof value === "object") {
    assignElementStyle(el, value as Record<string, unknown>, true);
    return;
  }
  if (
    key === "value" &&
    ["input", "textarea", "select"].includes(el.localName)
  ) {
    const field = el as
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (
      el.localName === "select" &&
      (field as HTMLSelectElement).multiple &&
      Array.isArray(value)
    ) {
      const values = new Set(value.map(String));
      for (const option of (field as HTMLSelectElement).options)
        option.selected = values.has(option.value);
    } else if (field.value !== String(value ?? "")) {
      field.value = String(value ?? "");
    }
    return;
  }
  if (
    (key === "checked" && el.localName === "input") ||
    (key === "selected" && el.localName === "option")
  ) {
    (el as unknown as Record<string, unknown>)[key] = Boolean(value);
  }
  const serialized = attributeValue(name, value, foreign !== null);
  if (serialized === null) remove();
  else if (foreign?.namespace) el.setAttributeNS(foreign.namespace, name, serialized);
  else el.setAttribute(name, serialized);
}
