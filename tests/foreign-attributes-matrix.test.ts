import { describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { createElement as h, render } from "../src/client/render";
import { SVG_TAGS, SVG_NS, MATH_NS } from "../src/client/dom";
import { renderToString, renderToStringAsync } from "../src/server/ssr";
import {
  SVG_ATTR_MAP, SVG_HTML_PARSER_ATTRIBUTES, MATH_HTML_PARSER_ATTRIBUTES,
  FOREIGN_HTML_PARSER_ATTRIBUTES, SVG_FOREIGN_ATTRIBUTES, MATH_FOREIGN_ATTRIBUTES,
  foreignAttribute, XLINK_NS, XML_NS, XMLNS_NS, isUnsafeUrlAttribute,
} from "../src/shared/attributes";

// Independently transcribed WHATWG "adjust SVG attributes" (58 complete rows).
// Do not derive expected values from the production mapper.
const SVG_SPEC: Readonly<Record<string, string>> = Object.fromEntries(`
attributename=attributeName attributetype=attributeType basefrequency=baseFrequency baseprofile=baseProfile calcmode=calcMode clippathunits=clipPathUnits diffuseconstant=diffuseConstant edgemode=edgeMode filterunits=filterUnits glyphref=glyphRef gradienttransform=gradientTransform gradientunits=gradientUnits kernelmatrix=kernelMatrix kernelunitlength=kernelUnitLength keypoints=keyPoints keysplines=keySplines keytimes=keyTimes lengthadjust=lengthAdjust limitingconeangle=limitingConeAngle markerheight=markerHeight markerunits=markerUnits markerwidth=markerWidth maskcontentunits=maskContentUnits maskunits=maskUnits numoctaves=numOctaves pathlength=pathLength patterncontentunits=patternContentUnits patterntransform=patternTransform patternunits=patternUnits pointsatx=pointsAtX pointsaty=pointsAtY pointsatz=pointsAtZ preservealpha=preserveAlpha preserveaspectratio=preserveAspectRatio primitiveunits=primitiveUnits refx=refX refy=refY repeatcount=repeatCount repeatdur=repeatDur requiredextensions=requiredExtensions requiredfeatures=requiredFeatures specularconstant=specularConstant specularexponent=specularExponent spreadmethod=spreadMethod startoffset=startOffset stddeviation=stdDeviation stitchtiles=stitchTiles surfacescale=surfaceScale systemlanguage=systemLanguage tablevalues=tableValues targetx=targetX targety=targetY textlength=textLength viewbox=viewBox viewtarget=viewTarget xchannelselector=xChannelSelector ychannelselector=yChannelSelector zoomandpan=zoomAndPan
`.trim().split(/\s+/).map(row => row.split("=")));

// Independent React getAttributeAlias spellings (every entry in React DOM's
// current mapping; includes the three HTML/SVG shared aliases).
const REACT_ALIAS_SPEC: Readonly<Record<string, string>> = Object.fromEntries(`
acceptCharset=accept-charset htmlFor=for httpEquiv=http-equiv crossOrigin=crossorigin accentHeight=accent-height alignmentBaseline=alignment-baseline arabicForm=arabic-form baselineShift=baseline-shift capHeight=cap-height clipPath=clip-path clipRule=clip-rule colorInterpolation=color-interpolation colorInterpolationFilters=color-interpolation-filters colorProfile=color-profile colorRendering=color-rendering dominantBaseline=dominant-baseline enableBackground=enable-background fillOpacity=fill-opacity fillRule=fill-rule floodColor=flood-color floodOpacity=flood-opacity fontFamily=font-family fontSize=font-size fontSizeAdjust=font-size-adjust fontStretch=font-stretch fontStyle=font-style fontVariant=font-variant fontWeight=font-weight glyphName=glyph-name glyphOrientationHorizontal=glyph-orientation-horizontal glyphOrientationVertical=glyph-orientation-vertical horizAdvX=horiz-adv-x horizOriginX=horiz-origin-x imageRendering=image-rendering letterSpacing=letter-spacing lightingColor=lighting-color markerEnd=marker-end markerMid=marker-mid markerStart=marker-start maskType=mask-type overlinePosition=overline-position overlineThickness=overline-thickness paintOrder=paint-order panose-1=panose-1 pointerEvents=pointer-events renderingIntent=rendering-intent shapeRendering=shape-rendering stopColor=stop-color stopOpacity=stop-opacity strikethroughPosition=strikethrough-position strikethroughThickness=strikethrough-thickness strokeDasharray=stroke-dasharray strokeDashoffset=stroke-dashoffset strokeLinecap=stroke-linecap strokeLinejoin=stroke-linejoin strokeMiterlimit=stroke-miterlimit strokeOpacity=stroke-opacity strokeWidth=stroke-width textAnchor=text-anchor textDecoration=text-decoration textRendering=text-rendering transformOrigin=transform-origin underlinePosition=underline-position underlineThickness=underline-thickness unicodeBidi=unicode-bidi unicodeRange=unicode-range unitsPerEm=units-per-em vAlphabetic=v-alphabetic vHanging=v-hanging vIdeographic=v-ideographic vMathematical=v-mathematical vectorEffect=vector-effect vertAdvY=vert-adv-y vertOriginX=vert-origin-x vertOriginY=vert-origin-y wordSpacing=word-spacing writingMode=writing-mode xmlnsXlink=xmlns:xlink xHeight=x-height
`.trim().split(/\s+/).map(pair => pair.split("=")));

// React DOM's complete SVG JSX vocabulary (possibleStandardNames / SVG DOMProperty).
const REACT_SVG_NAMES = `
accentHeight accumulate additive alignmentBaseline allowReorder alphabetic amplitude arabicForm ascent attributeName attributeType autoReverse azimuth baseFrequency baseProfile baselineShift bbox begin bias by calcMode capHeight clip clipPath clipPathUnits clipRule colorInterpolation colorInterpolationFilters colorProfile colorRendering contentScriptType contentStyleType cursor cx cy d decelerate descent diffuseConstant direction display divisor dominantBaseline dur dx dy edgeMode elevation enableBackground end exponent externalResourcesRequired fill fillOpacity fillRule filter filterRes filterUnits floodColor floodOpacity focusable fontFamily fontSize fontSizeAdjust fontStretch fontStyle fontVariant fontWeight format from fx fy g1 g2 glyphName glyphOrientationHorizontal glyphOrientationVertical glyphRef gradientTransform gradientUnits hanging horizAdvX horizOriginX ideographic imageRendering in in2 intercept k k1 k2 k3 k4 kernelMatrix kernelUnitLength kerning keyPoints keySplines keyTimes lengthAdjust letterSpacing lightingColor limitingConeAngle local markerEnd markerHeight markerMid markerStart markerUnits markerWidth mask maskContentUnits maskUnits maskType mathematical mode numOctaves offset opacity operator order orient orientation origin overflow overlinePosition overlineThickness paintOrder panose1 pathLength patternContentUnits patternTransform patternUnits pointerEvents points pointsAtX pointsAtY pointsAtZ preserveAlpha preserveAspectRatio primitiveUnits r radius refX refY renderingIntent repeatCount repeatDur requiredExtensions requiredFeatures restart result rotate rx ry scale seed shapeRendering slope spacing specularConstant specularExponent speed spreadMethod startOffset stdDeviation stemh stemv stitchTiles stopColor stopOpacity strikethroughPosition strikethroughThickness string stroke strokeDasharray strokeDashoffset strokeLinecap strokeLinejoin strokeMiterlimit strokeOpacity strokeWidth surfaceScale systemLanguage tableValues targetX targetY textAnchor textDecoration textLength textRendering to transform transformOrigin u1 u2 underlinePosition underlineThickness unicode unicodeBidi unicodeRange unitsPerEm vAlphabetic vHanging vIdeographic vMathematical values vectorEffect version vertAdvY vertOriginX vertOriginY viewBox viewTarget visibility widths wordSpacing writingMode x x1 x2 xChannelSelector xHeight xlinkActuate xlinkArcrole xlinkHref xlinkRole xlinkShow xlinkTitle xlinkType xmlns xmlnsXlink xmlBase xmlLang xmlSpace y y1 y2 yChannelSelector z zoomAndPan
`.trim().split(/\s+/);
const REACT_CAMEL = REACT_SVG_NAMES.filter(name => /[A-Z]/.test(name));

const SVG_ELEMENTS = [
  "svg", ...SVG_TAGS, "a", "title", "style", "script",
].filter((tag, index, all) => all.indexOf(tag) === index)
  // The HTML parser's SVG tag-name table predates feDropShadow, so server HTML
  // for it parses as <fedropshadow> in browsers too: no SSR output can match.
  .filter((tag) => tag !== "feDropShadow");
const MATH_ELEMENTS = [
  "math", "mi", "mn", "mo", "ms", "mtext", "mrow", "mfrac", "msqrt",
  "mroot", "msub", "msup", "msubsup", "mtable", "mtr", "mtd",
  "semantics", "annotation", "annotation-xml", "menclose", "mstyle",
  "maction", "maligngroup", "malignmark", "mmultiscripts", "mover", "mpadded",
  "mphantom", "mprescripts", "mspace", "munder", "munderover", "none",
];
const FOREIGN_PROPS = [
  "xlink:actuate", "xlink:arcrole", "xlink:href", "xlink:role",
  "xlink:show", "xlink:title", "xlink:type", "xml:lang", "xml:space",
  "xmlns", "xmlns:xlink", "xlinkHref", "XLINK:HREF", "xmlLang",
  "xmlnsXlink", "xmlBase",
];
const MATH_PROPS = [
  "definitionurl", "definitionURL", "DEFINITIONURL",
  "mathvariant", "mathsize", "displaystyle", "scriptlevel",
  "tabIndex", "readOnly", "className", "aria-label", "data-Mixed",
  ...FOREIGN_PROPS,
];

type Attr = [name: string, namespace: string | null, localName: string, value: string];
function attributes(element: Element): Attr[] {
  return Array.from(element.attributes, a =>
    [a.name, a.namespaceURI, a.localName, a.value] as Attr)
    .sort((a, b) => a.slice(0, 3).join("|").localeCompare(b.slice(0, 3).join("|")));
}

function signature(node: Node): unknown {
  if (node.nodeType === 3) return ["text", node.textContent];
  if (node.nodeType !== 1) return null;
  const el = node as Element;
  return [el.localName, el.namespaceURI, attributes(el),
    Array.from(el.childNodes).map(signature)];
}

function parity(server: HTMLElement, client: HTMLElement, tree: any, marker: string) {
  const html = renderToString(tree);
  server.innerHTML = html;
  try {
    expect(Array.from(client.childNodes).map(signature)).toEqual(
      Array.from(server.childNodes).map(signature));
  } catch (error) {
    throw new Error(`${marker}\nSSR: ${html}\nCLIENT: ${client.innerHTML}\n` + String(error), { cause: error });
  }
}

function freshDom() {
  const dom = new JSDOM("<!doctype html><body><div id='s'></div><div id='c'></div></body>");
  const doc = dom.window.document;
  return {
    dom, server: doc.getElementById("s")!, client: doc.getElementById("c")!,
    close() { dom.window.close(); },
  };
}
function foreignTree(namespace: "svg" | "math", tag: string, prop: string, value: unknown) {
  const props = value === undefined ? {} : { [prop]: value };
  return namespace === "svg"
    ? tag === "svg" ? h("svg", props, h("rect", { id: "child" }))
      : h("svg", null, h(tag, props))
    : tag === "math" ? h("math", props, h("mi", null, "x"))
      : h("math", null, h(tag, props));
}
function target(el: HTMLElement, namespace: "svg" | "math", tag: string): Element {
  const root = el.firstElementChild!;
  return tag === namespace ? root : root.firstElementChild!;
}
function resolved(name: string, namespace: string) {
  const a = foreignAttribute(name, namespace);
  return [a.name, a.namespace, a.localName];
}
function random(seed: number) {
  let n = seed >>> 0;
  return () => (n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 0x100000000;
}
function choose<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}
const VALUE_A = `v&<"'>-a`;
const VALUE_B = `w&<"'>-b`;


/** Delta-debug a seeded case (including the prior tree for patch-only failures). */
function minimalSeededTree(
  previous: any,
  svgTag: string,
  originalSvgProps: Record<string, unknown>,
  mathTag: string,
  originalMathProps: Record<string, unknown>,
): string {
  let svgProps = { ...originalSvgProps };
  let mathProps = { ...originalMathProps };
  let keepSvg = true;
  let keepMath = true;
  const build = () => h("section", null,
    ...(keepSvg ? [h("svg", { viewBox: "0 0 10 10" }, h(svgTag, svgProps))] : []),
    ...(keepMath ? [h("math", { definitionURL: "https://example.test/" }, h(mathTag, mathProps))] : []));
  const fails = () => {
    const fixture = freshDom();
    try {
      if (previous) render(previous, fixture.client);
      const candidate = build();
      render(candidate, fixture.client);
      parity(fixture.server, fixture.client, candidate, "minimizer");
      return false;
    } catch { return true; }
    finally { render(null, fixture.client); fixture.close(); }
  };
  if (!fails()) {
    return `h("section",null,h("svg",null,h(${JSON.stringify(svgTag)},${JSON.stringify(svgProps)})),h("math",null,h(${JSON.stringify(mathTag)},${JSON.stringify(mathProps)})))`;
  }
  for (let pass = 0; pass < 3; pass++) {
    // Whole branches before individual attrs; never keep a reduction unless
    // the failure survives in a fresh DOM with the same previous tree.
    if (keepSvg) {
      keepSvg = false;
      if (!fails()) keepSvg = true;
    }
    if (keepMath) {
      keepMath = false;
      if (!fails()) keepMath = true;
    }
    for (const key of Object.keys(svgProps)) {
      const value = svgProps[key];
      delete svgProps[key];
      if (!fails()) svgProps[key] = value;
    }
    for (const key of Object.keys(mathProps)) {
      const value = mathProps[key];
      delete mathProps[key];
      if (!fails()) mathProps[key] = value;
    }
  }
  return `h("section",null,${keepSvg
    ? `h("svg",{viewBox:"0 0 10 10"},h(${JSON.stringify(svgTag)},${JSON.stringify(svgProps)}))`
    : "null"},${keepMath
    ? `h("math",{definitionURL:"https://example.test/"},h(${JSON.stringify(mathTag)},${JSON.stringify(mathProps)}))`
    : "null"})`;
}

describe("WHATWG table completeness and independent spelling rules", () => {
  test("full SVG, MathML and foreign adjustment tables", () => {
    expect(SVG_HTML_PARSER_ATTRIBUTES).toEqual(SVG_SPEC);
    expect(Object.keys(SVG_SPEC)).toHaveLength(58);
    expect(MATH_HTML_PARSER_ATTRIBUTES).toEqual({ definitionurl: "definitionURL" });
    expect(Object.keys(FOREIGN_HTML_PARSER_ATTRIBUTES)).toEqual([
      "xlink:actuate", "xlink:arcrole", "xlink:href", "xlink:role",
      "xlink:show", "xlink:title", "xlink:type", "xml:lang", "xml:space",
      "xmlns", "xmlns:xlink",
    ]);
    for (const [key, expected] of Object.entries(SVG_SPEC)) {
      for (const spelling of [key, key.toUpperCase(), expected]) {
        expect(foreignAttribute(spelling, SVG_NS).name, spelling).toBe(expected);
      }
    }
    expect(resolved("definitionURL", MATH_NS)).toEqual(["definitionURL", null, "definitionURL"]);
    expect(resolved("definitionurl", MATH_NS)).toEqual(["definitionURL", null, "definitionURL"]);
    for (const name of ["xlink:href", "xlinkHref", "XLINK:HREF"])
      expect(resolved(name, SVG_NS)).toEqual(["xlink:href", XLINK_NS, "href"]);
    expect(resolved("xmlLang", MATH_NS)).toEqual(["xml:lang", XML_NS, "lang"]);
    expect(resolved("xmlnsXlink", SVG_NS)).toEqual(["xmlns:xlink", XMLNS_NS, "xlink"]);
    expect(resolved("xmlns", SVG_NS)).toEqual(["xmlns", XMLNS_NS, "xmlns"]);
    // Deliberately no XML namespace here: HTML's foreign-attribute adjustment
    // table contains xml:lang and xml:space, NOT xml:base.
    expect(resolved("xmlBase", SVG_NS)).toEqual(["xml:base", null, "xml:base"]);
    expect(resolved("notInAnyTable", SVG_NS)).toEqual(["notinanytable", null, "notinanytable"]);
    expect(resolved("custom-kebab", SVG_NS)).toEqual(["custom-kebab", null, "custom-kebab"]);
    for (const collision of ["constructor", "__proto__", "toString", "hasOwnProperty"])
      expect(resolved(collision, SVG_NS)).toEqual([
        collision.toLowerCase(), null, collision.toLowerCase(),
      ]);
    for (const ns of [SVG_NS, MATH_NS]) {
      expect(resolved("tabIndex", ns)).toEqual(["tabindex", null, "tabindex"]);
      expect(resolved("readOnly", ns)).toEqual(["readonly", null, "readonly"]);
      expect(resolved("className", ns)).toEqual(["class", null, "class"]);
    }
  });

  test("React SVG camelCase vocabulary is fully covered", () => {
    expect(Object.keys(REACT_ALIAS_SPEC).length).toBeGreaterThan(70);
    for (const [jsx, canonical] of Object.entries(REACT_ALIAS_SPEC)) {
      for (const spelling of [jsx, jsx.toUpperCase(), canonical]) {
        expect(foreignAttribute(spelling, SVG_NS).name, spelling).toBe(canonical);
      }
    }
    expect(REACT_SVG_NAMES.length).toBeGreaterThan(220);
    for (const name of REACT_SVG_NAMES) {
      const canonical = foreignAttribute(name, SVG_NS);
      expect(SVG_FOREIGN_ATTRIBUTES[name.toLowerCase()]?.name ??
        name.toLowerCase()).toBe(canonical.name);
      const normalized = foreignAttribute(name.toUpperCase(), SVG_NS);
      expect(normalized).toEqual(canonical);
      if (Object.hasOwn(SVG_ATTR_MAP, name)) {
        expect(canonical.name).toBe(SVG_ATTR_MAP[name]);
      }
      // React lowercase/no-uppercase SVG attributes must stay lowercase.
      // (panose1 is the one exception: React writes it as panose-1.)
      if (!/[A-Z]/.test(name) && name !== "panose1") expect(canonical.name).toBe(name);
    }
    expect(REACT_CAMEL.length).toBeGreaterThan(100);
    expect(Object.keys(MATH_FOREIGN_ATTRIBUTES)).toContain("definitionurl");
  });
});

describe("specific 4.6.3 regressions and HTML no-change guard", () => {
  test("ordinary HTML SSR output stays byte-for-byte unchanged", () => {
    const tree = h("div", {
      strokeWidth: 3, viewBox: "0 0 5 5", tabIndex: 2,
      readOnly: true, className: "x", xlinkHref: "/ok",
    });
    expect(renderToString(tree)).toBe(
      '<div stroke-width="3" viewBox="0 0 5 5" tabIndex="2" readOnly class="x" xlink:href="/ok"></div>');
    const fixture = freshDom();
    try {
      render(tree, fixture.client);
      parity(fixture.server, fixture.client, tree, "ordinary HTML unchanged");
    } finally { render(null, fixture.client); fixture.close(); }
  });

  test("pre-fix failing spellings: case, dash and namespaces", () => {
    const fixture = freshDom();
    const cases: Array<[string, string, string, unknown]> = [
      ["svg", "svg", "tabIndex", 2],
      ["svg", "svg", "readOnly", true],
      ["svg", "svg", "viewbox", "0 0 1 1"],
      ["svg", "svg", "VIEWBOX", "0 0 1 1"],
      ["svg", "path", "maskType", "alpha"],
      ["svg", "path", "transformOrigin", "center"],
      ["svg", "path", "arabicForm", "initial"],
      ["svg", "path", "capHeight", "1"],
      ["svg", "use", "xlinkHref", "/safe"],
      ["svg", "use", "XLINK:HREF", "/safe"],
      ["svg", "use", "xmlLang", "en"],
      ["svg", "use", "xmlnsXlink", XLINK_NS],
      ["svg", "use", "CustomMixed", "value"],
      ["math", "math", "definitionurl", "https://example.test/"],
      ["math", "mi", "tabIndex", 1],
      ["math", "mi", "readOnly", true],
    ];
    try {
      for (const [ns, tag, prop, value] of cases) {
        const tree = foreignTree(ns as "svg" | "math", tag, prop, value);
        render(tree, fixture.client);
        parity(fixture.server, fixture.client, tree, `${ns}/${tag} ${prop}`);
      }
    } finally { render(null, fixture.client); fixture.close(); }
  });
});

describe("DOM and parsed SSR attr names + namespaces, first mount/update/removal", () => {
  // All SVG tag kinds, not just <svg>/<path>. Every adjusted SVG spelling and
  // every React SVG camelCase spelling is exercised on all SVG element types,
  // including filters, gradients, text, resource and animation elements.
  for (const tag of SVG_ELEMENTS) {
    test(`SVG <${tag}> WHATWG × React camel names × three render phases`, async () => {
      const fixture = freshDom();
      try {
        const props = [...new Set([
          ...Object.keys(SVG_SPEC), ...Object.values(SVG_SPEC),
          ...REACT_CAMEL, ...FOREIGN_PROPS,
          "tabIndex", "readOnly", "className", "custom-kebab", "CustomMixed",
          "constructor", "toString", // __proto__ is dropped by object copying before rendering
        ])];
        for (const prop of props) {
          const expected = foreignAttribute(prop, SVG_NS);
          for (const value of [VALUE_A, VALUE_B, undefined]) {
            const tree = foreignTree("svg", tag, prop, value);
            render(tree, fixture.client);
            const id = `SVG <${tag}> prop=${prop} value=${JSON.stringify(value)}`;
            parity(fixture.server, fixture.client, tree, id);
            const el = target(fixture.client, "svg", tag);
            if (value === undefined) {
              expect(el.getAttributeNodeNS(expected.namespace, expected.localName), id).toBeNull();
            } else {
              const attr = el.getAttributeNodeNS(expected.namespace, expected.localName);
              expect(attr?.name, id).toBe(expected.name);
              expect(attr?.value, id).toBe(String(value));
            }
          }
        }
        // Both synchronous and async SSR use identical foreign mapping.
        const probe = foreignTree("svg", tag, "viewBox", "0 0 5 5");
        expect(await renderToStringAsync(probe)).toBe(renderToString(probe));
      } finally { render(null, fixture.client); fixture.close(); }
    });
  }
  for (const tag of MATH_ELEMENTS) {
    test(`MathML <${tag}> adjusted, ordinary and foreign attributes × lifecycle`, () => {
      const fixture = freshDom();
      try {
        for (const prop of MATH_PROPS) {
          const expected = foreignAttribute(prop, MATH_NS);
          for (const value of [VALUE_A, VALUE_B, undefined]) {
            const tree = foreignTree("math", tag, prop, value);
            render(tree, fixture.client);
            const id = `MathML <${tag}> ${prop} ${String(value)}`;
            parity(fixture.server, fixture.client, tree, id);
            const el = target(fixture.client, "math", tag);
            const attr = el.getAttributeNodeNS(expected.namespace, expected.localName);
            if (value === undefined) expect(attr, id).toBeNull();
            else expect([attr?.name, attr?.value], id).toEqual([expected.name, String(value)]);
          }
        }
      } finally { render(null, fixture.client); fixture.close(); }
    });
  }
});

describe("foreign-name security and keyed reconciliation", () => {
  test("hostile URL spellings and srcdoc never appear on either path or after updates", () => {
    for (const tag of ["svg", "math"] as const) {
      const fixture = freshDom();
      try {
        for (const prop of ["href", "xlinkHref", "xlink:href", "XLINK:HREF",
          "XLINKHREF", "src", "formAction", "srcDoc", "SRCDOC",
          "onClick", "ONLOAD", "onwhatever"]) {
          for (const attack of ["javascript:alert(1)", " java\nscript:alert(1)",
            "vbscript:msgbox(1)", "data:text/html,<svg onload=alert(1)>"]) {
            const tree = foreignTree(tag, tag, prop, attack);
            render(tree, fixture.client);
            parity(fixture.server, fixture.client, tree, `${tag} ${prop} ${attack}`);
            const key = foreignAttribute(prop, tag === "svg" ? SVG_NS : MATH_NS);
            const node = target(fixture.client, tag, tag);
            const shouldReject = /^on/i.test(prop) || key.name === "srcdoc" ||
              isUnsafeUrlAttribute(key.name, attack);
            if (shouldReject) expect(node.getAttributeNodeNS(key.namespace, key.localName)).toBeNull();
            // Follow a safe render with an unsafe update, then with a removal.
            const safe = foreignTree(tag, tag, prop, "/safe");
            render(safe, fixture.client);
            parity(fixture.server, fixture.client, safe, "safe " + prop);
            render(tree, fixture.client);
            parity(fixture.server, fixture.client, tree, "unsafe update " + prop);
            if (shouldReject) expect(target(fixture.client, tag, tag).getAttributeNodeNS(key.namespace, key.localName)).toBeNull();
            render(foreignTree(tag, tag, prop, undefined), fixture.client);
          }
        }
      } finally { render(null, fixture.client); fixture.close(); }
    }
  });

  test("alias collisions prefer last prop, including a falsy last value", () => {
    const fixture = freshDom();
    try {
      const trees = [
        h("svg", null, h("use", { xlinkHref: "/first", "xlink:href": "/second", viewBox: "1", viewbox: "2" })),
        h("svg", null, h("use", { "xlink:href": "/first", xlinkHref: "/second", viewbox: "1", viewBox: "2" })),
        h("svg", null, h("use", { xlinkHref: "/first", "xlink:href": null, viewBox: "1", viewbox: null })),
        h("svg", null, h("use", { xlinkHref: "/changed", viewBox: "3" })),
      ];
      for (const [i, tree] of trees.entries()) {
        render(tree, fixture.client);
        parity(fixture.server, fixture.client, tree, `collision #${i}`);
      }
    } finally { render(null, fixture.client); fixture.close(); }
  });

  test("keyed SVG node moves preserve XLink/XML/XMLNS namespaces across patches", () => {
    const fixture = freshDom();
    const item = (key: string, href: string) =>
      h("use", { key, id: key, xlinkHref: href, xmlLang: `lang-${key}`,
        xmlnsXlink: XLINK_NS, strokeWidth: "3", viewBox: "0 0 10 10" });
    try {
      const trees = [
        h("svg", null, item("a", "/a"), item("b", "/b"), item("c", "/c")),
        h("svg", null, item("c", "/c2"), item("a", "/a2"), item("b", "/b2")),
        h("svg", null, item("b", "/b3"), item("c", "/c3")),
        h("svg", null, item("c", "/c4"), item("d", "/d"), item("b", "/b4")),
      ];
      let nodes = new Map<string, Element>();
      for (const [index, tree] of trees.entries()) {
        render(tree, fixture.client, { reconciler: "keyed" });
        parity(fixture.server, fixture.client, tree, `keyed reorder step ${index}`);
        const next = new Map<string, Element>();
        for (const el of fixture.client.querySelectorAll("use")) {
          const id = el.getAttribute("id")!;
          next.set(id, el);
          if (nodes.has(id)) expect(el, `node ${id} reused`).toBe(nodes.get(id));
          expect(el.getAttributeNodeNS(XLINK_NS, "href")?.name).toBe("xlink:href");
          expect(el.getAttributeNodeNS(XML_NS, "lang")?.name).toBe("xml:lang");
          expect(el.getAttributeNodeNS(XMLNS_NS, "xlink")?.name).toBe("xmlns:xlink");
          expect(el.getAttributeNodeNS(null, "xlink:href")).toBeNull();
        }
        nodes = next;
      }
    } finally { render(null, fixture.client); fixture.close(); }
  });

  test("seeded mixed SVG + MathML attr combinations, updates and removals", () => {
    const fixture = freshDom();
    try {
      for (let seed = 1; seed <= 40; seed++) {
        const rng = random(seed);
        let previous: any = null;
        for (let i = 0; i < 32; i++) {
          const svgTag = choose(rng, SVG_ELEMENTS.filter(t => t !== "svg"));
          const mathTag = choose(rng, MATH_ELEMENTS.filter(t => t !== "math"));
          const svgProps: Record<string, unknown> = {};
          const mathProps: Record<string, unknown> = {};
          for (let j = 0; j < 4; j++) {
            svgProps[choose(rng, [...REACT_CAMEL, ...FOREIGN_PROPS])] =
              choose(rng, [VALUE_A, VALUE_B, "/safe", null, "javascript:alert(1)"]);
            mathProps[choose(rng, MATH_PROPS)] = choose(rng, [VALUE_A, VALUE_B, null, "/ok"]);
          }
          const tree = h("section", null,
            h("svg", { viewBox: "0 0 10 10" }, h(svgTag, svgProps)),
            h("math", { definitionURL: "https://example.test/" }, h(mathTag, mathProps)));
          try {
            render(tree, fixture.client);
            parity(fixture.server, fixture.client, tree, `seed=${seed} case=${i} tree=${JSON.stringify({ svgTag, svgProps, mathTag, mathProps })}`);
            previous = tree;
          } catch (error) {
            const minimal = minimalSeededTree(previous, svgTag, svgProps, mathTag, mathProps);
            throw new Error(`seed=${seed} case=${i}\nMINIMAL TREE: ${minimal}\n${String(error)}`, { cause: error });
          }
        }
      }
    } finally { render(null, fixture.client); fixture.close(); }
  });
});
