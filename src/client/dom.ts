import { attributeName, cssPropertyName } from "../shared/attributes";
export { SVG_ATTR_MAP } from "../shared/attributes";
export const SVG_NS = "http://www.w3.org/2000/svg";
export const SVG_TAGS = new Set([
  "svg",
  "altGlyph",
  "altGlyphDef",
  "altGlyphItem",
  "animate",
  "animateColor",
  "animateMotion",
  "animateTransform",
  "circle",
  "clipPath",
  "defs",
  "desc",
  "ellipse",
  "feBlend",
  "feColorMatrix",
  "feComponentTransfer",
  "feComposite",
  "feConvolveMatrix",
  "feDiffuseLighting",
  "feDisplacementMap",
  "feDistantLight",
  "feDropShadow",
  "feFlood",
  "feFuncA",
  "feFuncB",
  "feFuncG",
  "feFuncR",
  "feGaussianBlur",
  "feImage",
  "feMerge",
  "feMergeNode",
  "feMorphology",
  "feOffset",
  "fePointLight",
  "feSpecularLighting",
  "feSpotLight",
  "feTile",
  "feTurbulence",
  "filter",
  "foreignObject",
  "g",
  "glyph",
  "glyphRef",
  "image",
  "line",
  "linearGradient",
  "marker",
  "mask",
  "metadata",
  "mpath",
  "path",
  "pattern",
  "polygon",
  "polyline",
  "radialGradient",
  "rect",
  "set",
  "stop",
  "switch",
  "symbol",
  "text",
  "textPath",
  "tspan",
  "use",
  "view",
]);
export function isSvgElement(el: Element): el is SVGElement {
  return el.namespaceURI === SVG_NS;
}
export function createDomElement(tag: string, parentNode?: Node): Element {
  const parentElement =
    parentNode?.nodeType === 1 ? (parentNode as Element) : null;
  const inheritsSvgNamespace =
    !!parentElement &&
    isSvgElement(parentElement) &&
    parentElement.localName !== "foreignObject";
  const svg =
    tag === "svg" || inheritsSvgNamespace || (!parentNode && SVG_TAGS.has(tag));
  const doc = parentNode?.ownerDocument ?? document;
  return svg ? doc.createElementNS(SVG_NS, tag) : doc.createElement(tag);
}
export function domAttributeName(el: Element, key: string): string {
  return attributeName(key);
}
export function setElementClass(el: Element, value: unknown): void {
  if (isSvgElement(el)) {
    if (value == null || value === false || value === "")
      el.removeAttribute("class");
    else el.setAttribute("class", String(value));
    return;
  }
  (el as HTMLElement).className =
    value == null || value === false ? "" : String(value);
}
export function assignElementStyle(
  el: Element,
  value: Record<string, unknown>,
  reset = false,
): void {
  if (reset) el.removeAttribute("style");
  if (!value) return;
  const style = (el as HTMLElement | SVGElement).style;
  for (const [key, item] of Object.entries(value)) {
    if (item != null && item !== false)
      style.setProperty(cssPropertyName(key), String(item));
  }
}
