const SAFE_NAME = /^[A-Za-z][A-Za-z0-9:._-]*$/;
const URL_ATTRIBUTES = new Set([
  "href", "src", "action", "formaction", "xlink:href",
  "poster", "data", "cite", "background", "srcset",
]);
const IMAGE_ATTRIBUTES = new Set(["src", "srcset", "poster"]);
const SAFE_IMAGE_DATA = /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon)[;,]/i;

function hasUnsafeCssUrl(value: unknown): boolean {
  const css = String(value)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\\([0-9a-f]{1,6})\s?/gi, (_match, hex) => {
      const cp = parseInt(hex, 16);
      return String.fromCodePoint(
        cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)
          ? 0xfffd
          : cp,
      );
    })
    .replace(/\\([^\r\n])/g, "$1")
    .replace(/[\u0000-\u0020\u007f]/g, "")
    .toLowerCase();

  // javascript:/vbscript: never; data: only for raster images (inline
  // backgrounds are common; data:image/svg+xml and data:text/html are not safe).
  return [...css.matchAll(/url\(["']?([a-z]+):([^)"']*)/g)].some(([, scheme, rest]) => {
    if (scheme === "javascript" || scheme === "vbscript") return true;
    if (scheme !== "data") return false;
    return !SAFE_IMAGE_DATA.test(`data:${rest}`);
  });
}

/** URL attributes that would run code: javascript:/vbscript: anywhere, and
 *  data: except raster images in src, srcset and poster (data:image/svg+xml
 *  and data:text/html can run script). */
export function isUnsafeUrlAttribute(name: string, value: unknown): boolean {
  const lower = name.toLowerCase();
  if (lower === "style") return hasUnsafeCssUrl(value);
  if (!URL_ATTRIBUTES.has(lower)) return false;
  const urls = lower === "srcset" ? String(value).split(",") : [String(value)];
  return urls.some((raw) => {
    const url = raw.replace(/[\u0000-\u0020\u007f]/g, "");
    if (/^(?:javascript|vbscript):/i.test(url)) return true;
    if (!/^data:/i.test(url)) return false;
    return !(IMAGE_ATTRIBUTES.has(lower) && SAFE_IMAGE_DATA.test(url));
  });
}
const ALIASES: Readonly<Record<string, string>> = {
  className: "class",
  htmlFor: "for",
  httpEquiv: "http-equiv",
  acceptCharset: "accept-charset",
  charSet: "charset",
};
const BOOLEAN_ATTRIBUTES = new Set([
  "allowfullscreen",
  "async",
  "autofocus",
  "autoplay",
  "checked",
  "controls",
  "default",
  "defer",
  "disabled",
  "formnovalidate",
  "hidden",
  "inert",
  "ismap",
  "itemscope",
  "loop",
  "multiple",
  "muted",
  "nomodule",
  "novalidate",
  "open",
  "playsinline",
  "readonly",
  "required",
  "reversed",
  "selected",
]);
export const SVG_ATTR_MAP: Record<string, string> = {
  accentHeight: "accent-height",
  alignmentBaseline: "alignment-baseline",
  baselineShift: "baseline-shift",
  clipPath: "clip-path",
  clipRule: "clip-rule",
  colorInterpolation: "color-interpolation",
  colorInterpolationFilters: "color-interpolation-filters",
  colorProfile: "color-profile",
  colorRendering: "color-rendering",
  dominantBaseline: "dominant-baseline",
  enableBackground: "enable-background",
  fillOpacity: "fill-opacity",
  fillRule: "fill-rule",
  floodColor: "flood-color",
  floodOpacity: "flood-opacity",
  fontFamily: "font-family",
  fontSize: "font-size",
  fontSizeAdjust: "font-size-adjust",
  fontStretch: "font-stretch",
  fontStyle: "font-style",
  fontVariant: "font-variant",
  fontWeight: "font-weight",
  glyphName: "glyph-name",
  glyphOrientationHorizontal: "glyph-orientation-horizontal",
  glyphOrientationVertical: "glyph-orientation-vertical",
  horizAdvX: "horiz-adv-x",
  horizOriginX: "horiz-origin-x",
  imageRendering: "image-rendering",
  letterSpacing: "letter-spacing",
  lightingColor: "lighting-color",
  markerEnd: "marker-end",
  markerMid: "marker-mid",
  markerStart: "marker-start",
  overlinePosition: "overline-position",
  overlineThickness: "overline-thickness",
  paintOrder: "paint-order",
  panose1: "panose-1",
  pointerEvents: "pointer-events",
  renderingIntent: "rendering-intent",
  shapeRendering: "shape-rendering",
  stopColor: "stop-color",
  stopOpacity: "stop-opacity",
  strikethroughPosition: "strikethrough-position",
  strikethroughThickness: "strikethrough-thickness",
  strokeDasharray: "stroke-dasharray",
  strokeDashoffset: "stroke-dashoffset",
  strokeLinecap: "stroke-linecap",
  strokeLinejoin: "stroke-linejoin",
  strokeMiterlimit: "stroke-miterlimit",
  strokeOpacity: "stroke-opacity",
  strokeWidth: "stroke-width",
  textAnchor: "text-anchor",
  textDecoration: "text-decoration",
  textRendering: "text-rendering",
  underlinePosition: "underline-position",
  underlineThickness: "underline-thickness",
  unicodeBidi: "unicode-bidi",
  unicodeRange: "unicode-range",
  unitsPerEm: "units-per-em",
  vAlphabetic: "v-alphabetic",
  vHanging: "v-hanging",
  vIdeographic: "v-ideographic",
  vMathematical: "v-mathematical",
  vectorEffect: "vector-effect",
  vertAdvY: "vert-adv-y",
  vertOriginX: "vert-origin-x",
  vertOriginY: "vert-origin-y",
  wordSpacing: "word-spacing",
  writingMode: "writing-mode",
  xHeight: "x-height",
  xlinkActuate: "xlink:actuate",
  xlinkArcrole: "xlink:arcrole",
  xlinkHref: "xlink:href",
  xlinkRole: "xlink:role",
  xlinkShow: "xlink:show",
  xlinkTitle: "xlink:title",
  xlinkType: "xlink:type",
  xmlBase: "xml:base",
  xmlLang: "xml:lang",
  xmlSpace: "xml:space",
};
export function isSafeHtmlName(value: unknown): value is string {
  return typeof value === "string" && SAFE_NAME.test(value);
}
export function isEventProp(key: string): boolean {
  return /^on/i.test(key);
}
export function attributeName(key: string): string {
  if (Object.hasOwn(ALIASES, key)) return ALIASES[key];
  if (Object.hasOwn(SVG_ATTR_MAP, key)) return SVG_ATTR_MAP[key];
  return key;
}
export function attributeValue(name: string, value: unknown): string | null {
  if (value == null || typeof value === "function" || typeof value === "symbol")
    return null;
  if (BOOLEAN_ATTRIBUTES.has(name.toLowerCase()))
    return value === false ? null : "";
  return String(value);
}
export function cssPropertyName(name: string): string {
  if (name.startsWith("--")) return name;
  return name
    .replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
    .replace(/^ms-/, "-ms-");
}
export function styleObjectToString(style: Record<string, unknown>): string {
  return Object.entries(style)
    .filter(([, value]) => value != null && value !== false)
    .map(([key, value]) => `${cssPropertyName(key)}:${String(value)}`)
    .join(";");
}
