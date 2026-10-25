import { assignElementStyle, domAttributeName, setElementClass } from "./dom";
import { attributeValue, isSafeHtmlName } from "../shared/attributes";
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
export function setDomProp(el: Element, key: string, value: unknown): void {
  if (!isSafeHtmlName(key)) return;
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
  const name = domAttributeName(el, key);
  const serialized = attributeValue(name, value);
  if (serialized === null) el.removeAttribute(name);
  else el.setAttribute(name, serialized);
}
