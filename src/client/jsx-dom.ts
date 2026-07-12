/**
 * Melina.js JSX-to-DOM Runtime
 *
 * JSX in client.tsx files creates REAL DOM elements, not virtual DOM.
 *
 * Usage:
 *   const el = <div class="toast"><span>Hello</span></div>;
 *   document.body.appendChild(el); // Works directly!
 */

type Child = Node | string | number | boolean | null | undefined | Child[];

export function jsx(
  tag: string | ((props: any) => Node),
  props: Record<string, any> | null,
  ...children: Child[]
): Node {
  // Function component
  if (typeof tag === "function") {
    const finalProps = { ...props };
    // Use varargs children only if props.children is missing (Classic Runtime fallback)
    if ((!props || props.children === undefined) && children.length > 0) {
      finalProps.children = children.length === 1 ? children[0] : children;
    }
    return tag(finalProps);
  }

  // SVG elements must be created with the SVG namespace
  const SVG_NS = "http://www.w3.org/2000/svg";
  const SVG_TAGS = new Set([
    "svg",
    "path",
    "circle",
    "ellipse",
    "line",
    "polyline",
    "polygon",
    "rect",
    "g",
    "defs",
    "use",
    "text",
    "tspan",
    "clipPath",
    "mask",
    "image",
    "pattern",
    "linearGradient",
    "radialGradient",
    "stop",
    "filter",
    "feGaussianBlur",
    "feOffset",
    "feMerge",
    "feMergeNode",
    "foreignObject",
    "marker",
    "symbol",
    "animate",
    "animateTransform",
  ]);
  const isSVG = SVG_TAGS.has(tag);
  const el = isSVG
    ? document.createElementNS(SVG_NS, tag)
    : document.createElement(tag);

  // React camelCase → SVG dash-case attribute mapping
  const SVG_ATTR_MAP: Record<string, string> = {
    strokeWidth: "stroke-width",
    strokeLinecap: "stroke-linecap",
    strokeLinejoin: "stroke-linejoin",
    strokeDasharray: "stroke-dasharray",
    strokeDashoffset: "stroke-dashoffset",
    strokeMiterlimit: "stroke-miterlimit",
    strokeOpacity: "stroke-opacity",
    fillOpacity: "fill-opacity",
    fillRule: "fill-rule",
    clipRule: "clip-rule",
    clipPath: "clip-path",
    fontFamily: "font-family",
    fontSize: "font-size",
    fontWeight: "font-weight",
    textAnchor: "text-anchor",
    dominantBaseline: "dominant-baseline",
    colorInterpolation: "color-interpolation",
    colorInterpolationFilters: "color-interpolation-filters",
    floodColor: "flood-color",
    floodOpacity: "flood-opacity",
    lightingColor: "lighting-color",
    baselineShift: "baseline-shift",
  };

  // Set attributes/properties
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (key === "children") continue;
      if (value === null || value === undefined || value === false) continue;

      if (key === "style" && typeof value === "object") {
        Object.assign((el as HTMLElement).style, value);
      } else if (key === "className" || key === "class") {
        if (isSVG) {
          el.setAttribute("class", String(value));
        } else {
          (el as HTMLElement).className = String(value);
        }
      } else if (key === "htmlFor") {
        el.setAttribute("for", String(value));
      } else if (key === "dangerouslySetInnerHTML") {
        el.innerHTML = value.__html || "";
      } else if (key.startsWith("on") && typeof value === "function") {
        // Event handlers: onClick -> click
        const event = key.slice(2).toLowerCase();
        el.addEventListener(event, value);
      } else if (key === "ref" && typeof value === "function") {
        value(el);
      } else if (value === true) {
        el.setAttribute(key, "");
      } else {
        // Map React camelCase SVG attributes to dash-case
        const attr = isSVG ? SVG_ATTR_MAP[key] || key : key;
        el.setAttribute(attr, String(value));
      }
    }

    // Handle children passed as prop
    // Handle children passed as prop (Automatic Runtime)
    if (props.children !== undefined) {
      appendChildren(
        el,
        Array.isArray(props.children) ? props.children : [props.children],
      );
    }
  }

  // Append direct children (Classic Runtime fallback)
  if ((!props || props.children === undefined) && children.length > 0) {
    appendChildren(el, children);
  }

  return el;
}

function appendChildren(parent: Element, children: Child[]) {
  for (const child of children) {
    if (
      child === null ||
      child === undefined ||
      child === false ||
      child === true
    )
      continue;
    if (Array.isArray(child)) {
      appendChildren(parent, child);
    } else if (child instanceof Node) {
      parent.appendChild(child);
    } else {
      parent.appendChild(document.createTextNode(String(child)));
    }
  }
}

// JSX runtime entry points (used by Bun/esbuild JSX transform)
export const jsxs = jsx;
export const jsxDEV = jsx;
export const Fragment = ({ children }: { children: Child | Child[] }) => {
  const frag = document.createDocumentFragment();
  if (children !== undefined) {
    appendChildren(
      frag as any,
      Array.isArray(children) ? children : [children],
    );
  }
  return frag;
};

export default { jsx, jsxs, jsxDEV, Fragment };
