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
/**
 * HTML parser foreign-content adjustment tables:
 * https://html.spec.whatwg.org/multipage/parsing.html#adjust-svg-attributes
 * https://html.spec.whatwg.org/multipage/parsing.html#adjust-mathml-attributes
 * https://html.spec.whatwg.org/multipage/parsing.html#adjust-foreign-attributes
 *
 * React SVG JSX aliases:
 * https://github.com/facebook/react/blob/main/packages/react-dom-bindings/src/shared/possibleStandardNames.js
 * https://github.com/facebook/react/blob/main/packages/react-dom-bindings/src/shared/getAttributeAlias.js
 *
 * Input names are first ASCII-lowercased, as in HTML tokenization. Thus
 * viewBox, VIEWBOX and viewbox all resolve identically. Unknown camelCase
 * names become lowercase (not an invented kebab-case attribute); explicit
 * kebab-case names pass through. HTML-only names such as tabIndex/readOnly
 * become tabindex/readonly in foreign content. XML prefixes use namespaces
 * ONLY when listed in WHATWG's foreign-attributes table: xml:base is not
 * adjusted by the HTML parser and therefore deliberately has no namespace.
 */
export const SVG_HTML_PARSER_ATTRIBUTES: Readonly<Record<string, string>> = {
  attributename: "attributeName",
  attributetype: "attributeType",
  basefrequency: "baseFrequency",
  baseprofile: "baseProfile",
  calcmode: "calcMode",
  clippathunits: "clipPathUnits",
  diffuseconstant: "diffuseConstant",
  edgemode: "edgeMode",
  filterunits: "filterUnits",
  glyphref: "glyphRef",
  gradienttransform: "gradientTransform",
  gradientunits: "gradientUnits",
  kernelmatrix: "kernelMatrix",
  kernelunitlength: "kernelUnitLength",
  keypoints: "keyPoints",
  keysplines: "keySplines",
  keytimes: "keyTimes",
  lengthadjust: "lengthAdjust",
  limitingconeangle: "limitingConeAngle",
  markerheight: "markerHeight",
  markerunits: "markerUnits",
  markerwidth: "markerWidth",
  maskcontentunits: "maskContentUnits",
  maskunits: "maskUnits",
  numoctaves: "numOctaves",
  pathlength: "pathLength",
  patterncontentunits: "patternContentUnits",
  patterntransform: "patternTransform",
  patternunits: "patternUnits",
  pointsatx: "pointsAtX",
  pointsaty: "pointsAtY",
  pointsatz: "pointsAtZ",
  preservealpha: "preserveAlpha",
  preserveaspectratio: "preserveAspectRatio",
  primitiveunits: "primitiveUnits",
  refx: "refX",
  refy: "refY",
  repeatcount: "repeatCount",
  repeatdur: "repeatDur",
  requiredextensions: "requiredExtensions",
  requiredfeatures: "requiredFeatures",
  specularconstant: "specularConstant",
  specularexponent: "specularExponent",
  spreadmethod: "spreadMethod",
  startoffset: "startOffset",
  stddeviation: "stdDeviation",
  stitchtiles: "stitchTiles",
  surfacescale: "surfaceScale",
  systemlanguage: "systemLanguage",
  tablevalues: "tableValues",
  targetx: "targetX",
  targety: "targetY",
  textlength: "textLength",
  viewbox: "viewBox",
  viewtarget: "viewTarget",
  xchannelselector: "xChannelSelector",
  ychannelselector: "yChannelSelector",
  zoomandpan: "zoomAndPan",
};

export const MATH_HTML_PARSER_ATTRIBUTES: Readonly<Record<string, string>> = {
  definitionurl: "definitionURL",
};

export const XLINK_NS = "http://www.w3.org/1999/xlink";
export const XML_NS = "http://www.w3.org/XML/1998/namespace";
export const XMLNS_NS = "http://www.w3.org/2000/xmlns/";

export interface ForeignAttribute {
  /** Qualified DOM name, e.g. xlink:href. */
  name: string;
  /** Namespace for setAttributeNS/removeAttributeNS, null for ordinary attributes. */
  namespace: string | null;
  /** DOM local name for removeAttributeNS. */
  localName: string;
}

function foreignDescriptor(name: string, namespace: string | null = null): ForeignAttribute {
  return { name, namespace, localName: namespace ? name.slice(name.indexOf(":") + 1) : name };
}

/** All 11 WHATWG foreign-attribute adjustments, including xmlns itself. */
export const FOREIGN_HTML_PARSER_ATTRIBUTES: Readonly<Record<string, ForeignAttribute>> = {
  "xlink:actuate": foreignDescriptor("xlink:actuate", XLINK_NS),
  "xlink:arcrole": foreignDescriptor("xlink:arcrole", XLINK_NS),
  "xlink:href": foreignDescriptor("xlink:href", XLINK_NS),
  "xlink:role": foreignDescriptor("xlink:role", XLINK_NS),
  "xlink:show": foreignDescriptor("xlink:show", XLINK_NS),
  "xlink:title": foreignDescriptor("xlink:title", XLINK_NS),
  "xlink:type": foreignDescriptor("xlink:type", XLINK_NS),
  "xml:lang": foreignDescriptor("xml:lang", XML_NS),
  "xml:space": foreignDescriptor("xml:space", XML_NS),
  xmlns: foreignDescriptor("xmlns", XMLNS_NS),
  "xmlns:xlink": foreignDescriptor("xmlns:xlink", XMLNS_NS),
};

// The SVG aliases list is the React DOM SVG DOMProperty/getAttributeAlias
// spelling table (including historic SVG attributes still supported in JSX).
// Parser case-corrections above take precedence over lowercasing aliases.
const JSX_FOREIGN_ALIASES: Readonly<Record<string, string>> = {
  classname: "class",
  htmlfor: "for",
  httpequiv: "http-equiv",
  acceptcharset: "accept-charset",
  charset: "charset",
  xmlnsxlink: "xmlns:xlink",
  xmlbase: "xml:base",
  ...Object.fromEntries(Object.entries(SVG_ATTR_MAP).map(([key, name]) => [key.toLowerCase(), name])),
  arabicform: "arabic-form",
  capheight: "cap-height",
  masktype: "mask-type",
  transformorigin: "transform-origin",
};

/** Canonical attribute mappings shared by SSR and client, keyed by lowercased JSX spelling. */
export const SVG_FOREIGN_ATTRIBUTES: Readonly<Record<string, ForeignAttribute>> = Object.fromEntries(
  Object.entries({
    ...JSX_FOREIGN_ALIASES,
    ...SVG_HTML_PARSER_ATTRIBUTES,
  }).map(([key, name]) => [key, FOREIGN_HTML_PARSER_ATTRIBUTES[name.toLowerCase()] ?? foreignDescriptor(name)]),
);
export const MATH_FOREIGN_ATTRIBUTES: Readonly<Record<string, ForeignAttribute>> = Object.fromEntries(
  Object.entries({
    classname: "class",
    htmlfor: "for",
    httpequiv: "http-equiv",
    acceptcharset: "accept-charset",
    charset: "charset",
    ...MATH_HTML_PARSER_ATTRIBUTES,
    // These are JSX spellings for the literal qualified foreign names.
    xlinkhref: "xlink:href",
    xlinkactuate: "xlink:actuate",
    xlinkarcrole: "xlink:arcrole",
    xlinkrole: "xlink:role",
    xlinkshow: "xlink:show",
    xlinktitle: "xlink:title",
    xlinktype: "xlink:type",
    xmllang: "xml:lang",
    xmlspace: "xml:space",
    xmlbase: "xml:base",
    xmlnsxlink: "xmlns:xlink",
  }).map(([key, name]) => [key, FOREIGN_HTML_PARSER_ATTRIBUTES[name.toLowerCase()] ?? foreignDescriptor(name)]),
);

/**
 * Resolve an attribute exactly as an HTML tokenizer + foreign-content
 * adjustment would do (and with the React JSX aliases).
 * The namespace parameter is the element namespace, not the attribute's.
 */
export function foreignAttribute(
  key: string,
  elementNamespace: string | null,
): ForeignAttribute {
  const lower = key.toLowerCase();
  const table = elementNamespace === "http://www.w3.org/2000/svg"
    ? SVG_FOREIGN_ATTRIBUTES
    : MATH_FOREIGN_ATTRIBUTES;
  if (Object.hasOwn(table, lower)) return table[lower];
  if (Object.hasOwn(FOREIGN_HTML_PARSER_ATTRIBUTES, lower))
    return FOREIGN_HTML_PARSER_ATTRIBUTES[lower];
  return foreignDescriptor(lower);
}

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
/**
 * The attribute text for a prop value, or null to omit it. HTML boolean
 * attributes (readonly, disabled, ...) exist only on HTML elements; on SVG
 * and MathML (`foreign`) every value is plain text.
 */
export function attributeValue(name: string, value: unknown, foreign = false): string | null {
  if (value == null || typeof value === "function" || typeof value === "symbol")
    return null;
  if (!foreign && BOOLEAN_ATTRIBUTES.has(name.toLowerCase()))
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
