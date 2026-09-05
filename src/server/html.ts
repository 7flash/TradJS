/** HTML/inline-script encoding helpers for server-rendered documents. */

const SAFE_HTML_NAME = /^[A-Za-z][A-Za-z0-9:._-]*$/;

const HTML_ATTRIBUTE_ALIASES: Readonly<Record<string, string>> = {
  className: "class",
  htmlFor: "for",
  httpEquiv: "http-equiv",
  acceptCharset: "accept-charset",
};

export function htmlAttributeName(key: string): string {
  return HTML_ATTRIBUTE_ALIASES[key] ?? key;
}

export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Attribute names can be introduced through object spreads, not only static JSX.
 * Reject names containing whitespace or quote-like syntax instead of emitting
 * malformed markup that could become a second attribute.
 */
export function isSafeHtmlName(value: string): boolean {
  return SAFE_HTML_NAME.test(value);
}

/**
 * Serialize data for an inline script without allowing `</script>` breakout.
 *
 * JSON is valid JavaScript, but HTML parses script end tags before JavaScript
 * gets a chance to parse the string. Escaping HTML-significant characters as
 * unicode escapes keeps the serialized value semantically identical in JS.
 */
export function serializeInlineScript(value: unknown): string {
  const json = JSON.stringify(value);
  if (json === undefined) return "null";

  return json
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

const TITLE_ELEMENT = /^<title(?:\s|>)/i;
const DOCUMENT_TITLE = /<title(?:\s[^>]*)?>[\s\S]*?<\/title\s*>/i;
const DOCUMENT_TITLES = /<title(?:\s[^>]*)?>[\s\S]*?<\/title\s*>/gi;

/**
 * Merge declarative head output into a rendered document. Page-level titles
 * override layout/static titles, and only the most specific collected title is
 * emitted. A default title is inserted only when no title exists anywhere.
 */
export function injectHeadElements(
  html: string,
  elements: readonly string[],
  defaultTitle?: string,
): string {
  if (!html.includes("</head>")) return html;

  let headElements = [...elements];
  let lastCollectedTitle = -1;
  for (let i = 0; i < headElements.length; i++) {
    if (TITLE_ELEMENT.test(headElements[i])) lastCollectedTitle = i;
  }

  if (lastCollectedTitle >= 0) {
    headElements = headElements.filter(
      (element, index) =>
        !TITLE_ELEMENT.test(element) || index === lastCollectedTitle,
    );
    html = html.replace(DOCUMENT_TITLES, "");
  } else if (!DOCUMENT_TITLE.test(html) && defaultTitle !== undefined) {
    headElements.unshift(`<title>${escapeHtml(defaultTitle)}</title>`);
  }

  if (headElements.length === 0) return html;
  return html.replace("</head>", `${headElements.join("\n")}</head>`);
}
