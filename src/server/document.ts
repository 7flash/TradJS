import { serializeInlineScript } from "./html";
const VIEW_TRANSITION_STYLE = `<style data-tradjs-view-transitions="stable-root-v3">
@view-transition { navigation: auto; }
@layer tradjs.navigation {
  ::view-transition-group(root),
  ::view-transition-old(root),
  ::view-transition-new(root) { animation: none; }
  ::view-transition-old(root),
  ::view-transition-new(root) { mix-blend-mode: normal; }
}
@media (prefers-reduced-motion: reduce) {
  ::view-transition,
  ::view-transition-group(*),
  ::view-transition-image-pair(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation: none !important;
    transition: none !important;
  }
  ::view-transition-old(*),
  ::view-transition-new(*) { mix-blend-mode: normal !important; }
}
</style>`;
export function injectViewTransitions(html: string, enabled: boolean): string {
  if (!enabled || /<style\b[^>]*\bdata-tradjs-view-transitions\b/i.test(html))
    return html;
  if (/<\/head\s*>/i.test(html)) {
    const bodyClose = [...html.matchAll(/<\/body\s*>/gi)].at(-1);
    let readinessLink = "";
    if (bodyClose) {
      let markerId = "tradjs-document-end";
      for (let index = 1; html.includes(markerId); index++) {
        markerId = `tradjs-document-end-${index}`;
      }
      const marker = `<span id="${markerId}" data-tradjs-document-end hidden></span>`;
      html =
        html.slice(0, bodyClose.index) + marker + html.slice(bodyClose.index);
      readinessLink = `<link rel="expect" href="#${markerId}" blocking="render" data-tradjs-document-ready>`;
    }
    return html.replace(
      /<\/head\s*>/i,
      () => `${VIEW_TRANSITION_STYLE}${readinessLink}</head>`,
    );
  }
  return html.replace(
    /^(\s*<!doctype html>)?/i,
    (prefix) => `${prefix}${VIEW_TRANSITION_STYLE}`,
  );
}
export function createClientInitializer(
  urls: readonly string[],
  context: {
    params: Record<string, string>;
    pathname: string;
  },
  blockRendering: boolean,
): string {
  if (urls.length === 0) return "";
  const modules = urls.map((_, i) => `client${i}`);
  const imports = urls
    .map(
      (url, i) =>
        `import * as ${modules[i]} from ${serializeInlineScript(url)};`,
    )
    .join("\n");
  return `<script type="module"${blockRendering ? ' blocking="render"' : ""} data-tradjs-client>
${imports}
const context = ${serializeInlineScript(context)};
for (const client of [${modules.join(", ")}]) {
  if (typeof client.default === "function") await client.default(context);
}
</script>`;
}
