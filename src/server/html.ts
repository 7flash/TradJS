export {
  attributeName as htmlAttributeName,
  isSafeHtmlName,
} from "../shared/attributes";
export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
/** <style> and <script> are raw-text elements: the HTML parser does not decode
 *  character references inside them, so their text must not be escaped. */
export function isRawTextElement(tag: string): boolean {
  const name = tag.toLowerCase();
  return name === "style" || name === "script";
}

/** Plain text of raw-text children: strings and numbers, through arrays and
 *  fragments. Anything else (elements, components) has no raw-text meaning
 *  and is dropped. */
export function rawTextOf(children: unknown, fragment: unknown): string {
  if (children === null || children === undefined || typeof children === "boolean") return "";
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map((child) => rawTextOf(child, fragment)).join("");
  const vnode = children as { type?: unknown; props?: { children?: unknown } };
  if (vnode && vnode.type === fragment) return rawTextOf(vnode.props?.children, fragment);
  return "";
}

/** Keep raw text from closing its element early: a literal end tag (any case,
 *  even split across children) becomes `<\\/style` / `<\\/script`. */
export function neutralizeRawTextEndTag(text: string, tag: string): string {
  const name = tag.toLowerCase();
  return text.replace(new RegExp(`</(${name})`, "gi"), "<\\/$1");
}

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
export function injectHeadElements(
  html: string,
  elements: readonly string[],
  defaultTitle?: string,
): string {
  const match = /<head(?:\s[^>]*)?>([\s\S]*?)<\/head\s*>/i.exec(html);
  if (!match) return html;
  let headHtml = match[0];
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
    headHtml = headHtml.replace(DOCUMENT_TITLES, "");
  } else if (!DOCUMENT_TITLE.test(headHtml) && defaultTitle !== undefined) {
    headElements.unshift(`<title>${escapeHtml(defaultTitle)}</title>`);
  }
  headHtml = headHtml.replace(
    /<\/head\s*>/i,
    () => `${headElements.join("\n")}</head>`,
  );
  return (
    html.slice(0, match.index) +
    headHtml +
    html.slice(match.index + match[0].length)
  );
}
