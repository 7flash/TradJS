import { describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { createElement as h, render } from "../src/client/render";
import { Fragment } from "../src/client/types";
import { renderToString, renderToStringAsync } from "../src/server/ssr";
import { Head, collectHead } from "../src/server/head";
import { injectHeadElements, serializeInlineScript } from "../src/server/html";
import { createClientInitializer } from "../src/server/document";
import { isUnsafeUrlAttribute } from "../src/shared/attributes";

type Tree = any;
const HOSTILE = [
  `< > & " ' ` + "`",
  `</script><img src=x onerror=alert(1)>`,
  `</style><svg onload=alert(1)>`,
  `<!-- <script>alert(1)</script>`,
  `]]> &quot; &#x3c;`,
  `𝄞 😀 \u2028 \u2029 \ud800 \udfff`,
  "JaVaScRiPt:alert(1)", "java\nscript:alert(1)",
  " java\tscript:alert(1)", "VBScript:msgbox(1)",
  "data:text/html,<svg onload=alert(1)>",
  "data:image/svg+xml,<svg onload=alert(1)>",
  "javascript&#58;alert(1)",
];
const SAFE = ["/ok", "#fragment", "https://example.test/a?x=1&y=2", "data:image/png;base64,aGVsbG8="];
const TAGS = ["div", "span", "section", "strong", "em", "p", "small", "label", "button", "ul", "li", "pre", "code", "textarea", "template", "svg", "math", "br", "img", "input", "hr", "a"];
const VOID = new Set(["br", "img", "input", "hr"]);
const URL_PROPS = ["href", "src", "action", "formAction", "xlinkHref", "poster", "data"];
const STRINGS = [...HOSTILE, "ordinary", "", "a\nb", "0", "<b>not HTML</b>"];
const CSS = [
  { color: "red", marginTop: 2, "--accent": "<red>", WebkitTransform: "scale(1)" },
  { backgroundImage: "url(javascript:alert(1))" },
  { backgroundImage: String.raw`url(j\61vascript:alert(1))` },
  { backgroundImage: "url(data:text/html,<script>)" },
  { backgroundImage: "url(/ok.png)" },
  {},
];
function random(seed: number) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 0x100000000);
}
function pick<T>(rnd: () => number, values: readonly T[]): T {
  return values[Math.floor(rnd() * values.length)];
}
function Component(props: any) { return h("span", { "data-component": "yes" }, props.children); }

function propsFor(rnd: () => number, tag: string): Record<string, any> {
  const attrs: Record<string, any> = {};
  const n = Math.floor(rnd() * 7);
  for (let i = 0; i < n; i++) {
    const key = pick(rnd, [
      "title", "id", "className", "class", "style", "aria-hidden", "aria-label",
      "data-input", "draggable", "spellCheck", "hidden", "disabled", "readOnly",
      "tabIndex", "strokeWidth", ...URL_PROPS, "srcdoc", "onClick", "ONMOUSEOVER",
      'evil" onfocus="alert(1)', "constructor", "__proto__",
    ]);
    let value: any = pick(rnd, STRINGS);
    if (key === "style") value = pick(rnd, CSS);
    if (key === "hidden" || key === "disabled" || key === "readOnly") value = rnd() > .5;
    if (key === "draggable" || key === "spellCheck" || key === "aria-hidden") value = rnd() > .5;
    if (key === "onClick") value = () => {};
    if (key === "tabIndex" || key === "strokeWidth") value = Math.floor(rnd() * 5);
    Object.defineProperty(attrs, key, { value, configurable: true, enumerable: true, writable: true });
  }
  if (tag === "input" && rnd() > .5) {
    attrs.type = "checkbox"; attrs.checked = rnd() > .5; attrs.value = pick(rnd, STRINGS);
  }
  if (tag === "a") attrs.href = pick(rnd, [...HOSTILE, ...SAFE]);
  if (rnd() > .8) attrs.key = "item-" + Math.floor(rnd() * 99);
  if (rnd() > .9) attrs.ref = { current: null };
  return attrs;
}
// Children of these elements are phrasing content only: the HTML parser
// restructures <div> inside <p>, <a> inside <a>, <li> inside <li> and so on,
// so such trees are not valid HTML and have no single correct rendering.
const PHRASING_PARENTS = new Set(["p", "li", "a", "button", "label"]);
const PHRASING = ["span", "strong", "em", "small", "code", "br", "img", "input", "svg", "math", "textarea"];
function generate(rnd: () => number, depth = 0, phrasing = false): Tree {
  const variant = Math.floor(rnd() * (depth > 3 ? 8 : 13));
  if (variant === 0) return null;
  if (variant === 1) return false;
  if (variant === 2) return true;
  if (variant === 3) return 0;
  if (variant === 4) return "";
  if (variant === 5) return Math.floor(rnd() * 1000);
  if (variant === 6) return pick(rnd, STRINGS);
  if (variant === 7 && depth < 4) return [generate(rnd, depth + 1, phrasing), generate(rnd, depth + 1, phrasing)];
  const tag = pick(rnd, phrasing ? PHRASING : TAGS);
  let attrs = propsFor(rnd, tag);
  // jsdom's MathML elements have no .style (browsers have one): no style there.
  if (tag === "math") attrs = Object.fromEntries(Object.entries(attrs).filter(([key]) => key !== "style"));
  const inner = phrasing || PHRASING_PARENTS.has(tag);
  if (variant === 8 && depth < 4) return h(Fragment, null, generate(rnd, depth + 1, phrasing), generate(rnd, depth + 1, phrasing));
  if (variant === 9 && depth < 4) return h(Component, null, generate(rnd, depth + 1, phrasing));
  if (variant === 10 && !VOID.has(tag) && tag !== "svg" && tag !== "math") {
    attrs.dangerouslySetInnerHTML = { __html: "<b data-trusted='yes'>trusted markup</b>" };
    return h(tag, attrs);
  }
  if (VOID.has(tag)) return h(tag, attrs);
  if (tag === "svg") return h("svg", attrs, h("circle", { r: 2, cx: 3, cy: 4 }));
  if (tag === "math") return h("math", attrs, h("mi", null, "x"));
  if (tag === "textarea" || tag === "pre") return h(tag, attrs, rnd() > .5 ? "\n" + pick(rnd, STRINGS) : pick(rnd, STRINGS));
  if (tag === "template") return h("template", attrs, h("span", null, pick(rnd, STRINGS)));
  if (depth >= 4) return h(tag, attrs, pick(rnd, STRINGS));
  return h(tag, attrs, generate(rnd, depth + 1, inner), generate(rnd, depth + 1, inner));
}

function snapshot(root: Element | DocumentFragment): unknown[] {
  const out: unknown[] = [];
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === 3) {
      // HTML parsing coalesces adjacent text nodes, unlike createTextNode.
      if (typeof out.at(-1) === "string") out[out.length - 1] += node.nodeValue!.toWellFormed();
      else if (node.nodeValue) out.push(node.nodeValue.toWellFormed());
      continue;
    }
    if (node.nodeType !== 1) continue;
    const el = node as Element;
    const attrs = Array.from(el.attributes, attr => [attr.name, attr.value] as [string, string])
      .filter(([name]) => !(
        (el.localName === "input" && ["checked", "value"].includes(name)) ||
        (el.localName === "option" && name === "selected")
      ))
      .map(([name, value]) => {
        if (name !== "style") return [name, value.toWellFormed()];
        const style = (el as HTMLElement).style;
        return [name, Array.from(style).map(k => `${k}:${style.getPropertyValue(k).trim()}`).sort().join(";")];
      }).sort((a, b) => a[0].localeCompare(b[0]));
    const field = /^(input|textarea|select|option)$/.test(el.localName);
    out.push({
      tag: el.localName, namespace: el.namespaceURI, attrs,
      value: field ? (el as HTMLInputElement).value.toWellFormed() : undefined,
      checked: el.localName === "input" ? (el as HTMLInputElement).checked : undefined,
      selected: el.localName === "option" ? (el as HTMLOptionElement).selected : undefined,
      // textarea's displayed text is its live value; controlled values can
      // differ from the backing text node without changing what users see.
      children: el.localName === "textarea" ? []
        : snapshot(el.localName === "template" ? (el as HTMLTemplateElement).content : el),
    });
  }
  return out;
}
function assertNoInjectedCode(root: Element, allowExplicitCode = false) {
  for (const el of root.querySelectorAll("*")) {
    if (!allowExplicitCode) expect(el.localName).not.toBe("script");
    for (const { name, value } of Array.from(el.attributes)) {
      expect(/^on/i.test(name), `${el.localName}[${name}] event attribute`).toBe(false);
      expect(name.toLowerCase()).not.toBe("srcdoc");
      expect(isUnsafeUrlAttribute(name, value), `${el.localName}[${name}] executable URL or CSS`).toBe(false);
      if (["href", "src", "action", "formaction", "xlink:href", "poster", "data", "srcset"].includes(name.toLowerCase())) {
        expect(/^(?:javascript|vbscript):/i.test(value.replace(/[\u0000-\u0020\u007f]/g, ""))).toBe(false);
        if (/^data:/i.test(value.replace(/[\u0000-\u0020\u007f]/g, "")))
          expect(/^(?:src|srcset|poster)$/i.test(name) && /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon)[;,]/i.test(value)).toBe(true);
      }
    }
  }
}
function run(tree: Tree, seed: number, index: number): void {
  const dom = new JSDOM("<!doctype html><html><body><div id='server'></div><div id='client'></div></body></html>");
  const doc = dom.window.document;
  const server = doc.getElementById("server")!;
  const client = doc.getElementById("client")!;
  try {
    const html = renderToString(tree);
    server.innerHTML = html;
    render(tree, client);
    expect(snapshot(server), `seed=${seed} case=${index} tree=${describeTree(tree)}`).toEqual(snapshot(client));
    assertNoInjectedCode(server);
    assertNoInjectedCode(client);
  } finally {
    render(null, client);
    dom.window.close();
  }
}
function describeTree(tree: Tree): string {
  if (tree == null || typeof tree !== "object") return JSON.stringify(tree);
  if (Array.isArray(tree)) return `[${tree.map(describeTree).join(",")}]`;
  const tag = typeof tree.type === "string" ? tree.type : tree.type === Fragment ? "Fragment" : "Component";
  const props = Object.fromEntries(Object.entries(tree.props || {}).filter(([key]) => !["children", "ref"].includes(key))
    .map(([key, value]) => [key, typeof value === "function" ? "[function]" : value]));
  return `${tag}(${JSON.stringify(props)}){${describeTree(tree.props?.children)}}`;
}
// Tree minimizer: reduce arrays, children, then properties while preserving the failure.
// Only invoked on failure; the minimized tree is printed as a replayable h(...) shape.
function minimize(tree: Tree, failed: (tree: Tree) => boolean): Tree {
  let best = tree;
  for (let round = 0; round < 30; round++) {
    const choices: Tree[] = [];
    if (Array.isArray(best)) {
      choices.push(...best, ...best.map((_, i) => best.filter((__, j) => i !== j)));
    } else if (best && typeof best === "object" && "type" in best) {
      const props = best.props || {};
      if (props.children !== undefined) {
        choices.push(props.children, h(best.type, { ...props, children: null }));
        if (Array.isArray(props.children)) for (const child of props.children) choices.push(h(best.type, { ...props, children: child }));
      }
      for (const key of Object.keys(props)) if (key !== "children") {
        const reduced = { ...props }; delete reduced[key];
        choices.push(h(best.type, reduced));
      }
    }
    const smaller = choices.find(candidate => {
      try { return describeTree(candidate).length < describeTree(best).length && failed(candidate); }
      catch { return false; }
    });
    if (smaller === undefined) break;
    best = smaller;
  }
  return best;
}

describe("SSR/client HTML-parsing differential matrix", () => {
  // 96 x 32 = 3,072 deterministic fresh trees, plus independent regressions.
  for (let seed = 1; seed <= 96; seed++) {
    test(`seed=${seed} 32 fresh JSX trees`, () => {
      const rnd = random(seed);
      for (let i = 0; i < 32; i++) {
        const tree = generate(rnd);
        try { run(tree, seed, i); }
        catch (error) {
          const minimal = minimize(tree, candidate => {
            try { run(candidate, seed, i); return false; } catch { return true; }
          });
          throw new Error(`seed=${seed} case=${i}\nMINIMAL TREE: ${describeTree(minimal)}\nORIGINAL TREE: ${describeTree(tree)}\n${String(error)}`, { cause: error });
        }
      }
    });
  }

  test("explicit tbody, SVG and MathML namespaces", () => {
    run(h("table", null, h("tbody", null, h("tr", null, h("td", null, "cell")))), 0, 8);
    run(h("svg", null, h("circle", { cx: "3", cy: "4", r: "2" })), 0, 9);
    run(h("math", null, h("mi", null, "x")), 0, 10);
    run(h("template", null, h("p", null, "inside")), 0, 11);
  });
  test("form defaults and selected options, including an explicit false state", () => {
    run(h("input", { type: "checkbox", checked: true, value: "a" }), 0, 12);
    run(h("input", { type: "checkbox", checked: false, value: "b" }), 0, 13);
    run(h("select", null,
      h("option", { value: "a", selected: false }, "A"),
      h("option", { value: "b", selected: true }, "B"),
    ), 0, 14);
    run(h("select", { value: "b" },
      h("option", { value: "a" }, "A"),
      h("option", { value: "b" }, "B"),
    ), 0, 16);
    run(h("select", { multiple: true, value: ["a", "c"] },
      ...["a", "b", "c"].map(value => h("option", { value }, value)),
    ), 0, 17);
    run(h("textarea", { value: "safe < & >" }), 0, 18);
  });
  test("duplicate alias attributes honor last JSX prop", () => {
    run(h("div", { className: "first", class: "second" }), 0, 19);
    run(h("div", { class: "first", className: false }), 0, 20);
  });
  test("void tags and event/key/ref props never turn into attributes", () => {
    run(h("div", null,
      h("input", { key: "i", ref: { current: null }, onClick: () => {}, disabled: true }),
      h("img", { src: "data:image/png;base64,aGVsbG8=" }),
      h("br", null),
    ), 0, 15);
  });
  test("explicit CSS and JS raw-text children stay within their intended elements", () => {
    for (const tag of ["script", "style"]) {
      const tree = h(tag, null, "before </" + tag + "><img onerror=alert(1)> after");
      const html = renderToString(tree);
      const dom = new JSDOM("<!doctype html><html><head>" + html + "</head></html>");
      expect(dom.window.document.querySelectorAll(tag)).toHaveLength(1);
      expect(dom.window.document.querySelectorAll("img")).toHaveLength(0);
      dom.window.close();
    }
  });
  test("regression: first mount rejects CSS URL scripts", () => {
    for (const style of CSS.slice(1, 4)) run(h("div", { style }), 0, 1);
  });
  test("regression: removed class and empty style do not create extra attributes", () => {
    run(h("div", { className: false, style: {} }, "text"), 0, 2);
  });
  test("regression: initial pre and textarea newlines survive HTML parsing", async () => {
    for (const tag of ["pre", "textarea"]) for (const value of ["\nhello", "\n\nhello"]) {
      const tree = h(tag, null, value);
      run(tree, 0, 3);
      expect(await renderToStringAsync(tree)).toBe(renderToString(tree));
    }
  });
  test("regression: hostile text never creates elements or event attributes", () => {
    for (const str of HOSTILE) {
      run(h("div", { title: str, "aria-label": str, "data-value": str }, str), 0, 4);
      run(h("a", { href: str }, str), 0, 5);
    }
  });
  test("explicit raw HTML and script are intentional opt-ins, not escaped text", () => {
    const tree = h("div", { dangerouslySetInnerHTML: { __html: "<b>trusted</b>" } });
    run(tree, 0, 6);
    const safe = h("script", null, `const x = "</script><img onerror=x>";`);
    const html = renderToString(safe);
    expect(html).toContain("<\\/script>");
    const dom = new JSDOM(`<!doctype html><body>${html}</body>`);
    expect(dom.window.document.querySelectorAll("script")).toHaveLength(1);
    expect(dom.window.document.querySelectorAll("img")).toHaveLength(0);
    dom.window.close();
  });
  test("head title/meta/link collect and dedupe escaped hostile strings", () => {
    for (const value of HOSTILE) {
      const { head, value: output } = collectHead(() => renderToString(
        h(Head, null,
          h("title", null, "old"),
          h("title", null, value),
          h("meta", { name: "description", content: value, onclick: "alert(1)" }),
          h("link", { rel: "canonical", href: value }),
        ),
      ));
      expect(output).toBe("");
      const html = injectHeadElements("<!doctype html><html><head><title>default</title></head><body></body></html>", head);
      const dom = new JSDOM(html);
      // The HTML parser turns CR/CRLF into LF and NUL into U+FFFD in text; an in-memory
      // parse keeps lone surrogates (they only become U+FFFD when encoded as UTF-8).
      expect(dom.window.document.querySelector("title")!.textContent).toBe(
        value.replace(/\r\n?/g, "\n").replace(/\0/g, "�"));
      expect(dom.window.document.querySelectorAll("title")).toHaveLength(1);
      assertNoInjectedCode(dom.window.document.head);
      dom.window.close();
    }
  });
  test("inline bootstrap serialization prevents script-breakout", () => {
    for (const value of HOSTILE) {
      const script = createClientInitializer(["/safe.js"], { pathname: value, params: { id: value } }, false);
      const dom = new JSDOM("<!doctype html><body>" + script + "</body>");
      expect(dom.window.document.querySelectorAll("script")).toHaveLength(1);
      expect(dom.window.document.querySelectorAll("img,svg")).toHaveLength(0);
      expect(serializeInlineScript({ value })).not.toContain("<");
      dom.window.close();
    }
  });
});
