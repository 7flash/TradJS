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
