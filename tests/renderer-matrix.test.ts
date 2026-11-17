/** Differential renderer tests: each update is compared with a new mount.
 * Replay: bun test tests/renderer-matrix.test.ts -t 'seed=...' .
 * Every seeded test name and each assertion includes the complete operation trace.
 */
import { describe, test, expect } from "bun:test";
import { JSDOM } from "jsdom";
import { render, createElement as h } from "../src/client/render";
import { Fragment } from "../src/client/types";
import { createBoundary } from "../src/client/boundary";

type Kind = "li" | "span" | "button" | "input" | "a" | "svg" | "raw" | "component" | "fragment" | "hole" | "text";
type Item = { id: number; kind: Kind; key?: string | number | null; value: string; variant: number };
type State = { items: Item[]; wrapper: "div" | "section" | "fragment"; attrs: number };
type Action = { op: string; arg: number };
const KINDS: Kind[] = ["li", "span", "button", "input", "a", "svg", "raw", "component", "fragment", "hole", "text"];
const Component = ({ children }: { children?: any }) => h("em", { "data-component": "yes" }, children);
const MOD = 0x100000000;
function random(seed: number) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return (x >>> 0) / MOD;
  };
}
const initial = (): State => ({ items: [], wrapper: "div", attrs: 0 });
const item = (id: number, variant = 0): Item => ({ id, kind: KINDS[id % KINDS.length], key: `k${id}`, value: `v${id}`, variant });
function update(state: State, action: Action): State {
  const s: State = { ...state, items: state.items.map(i => ({ ...i })) };
  const n = s.items.length;
  const at = n ? action.arg % n : 0;
  const id = 10 + (action.arg % 17);
  switch (action.op) {
    case "insert": s.items.splice(at, 0, item(id, action.arg % 6)); break;
    case "remove": if (n) s.items.splice(at, 1); break;
    case "move": if (n > 1) s.items.splice((action.arg * 7 + 1) % n, 0, ...s.items.splice(at, 1)); break;
    case "reverse": s.items.reverse(); break;
    case "shuffle": {
      const rand = random(action.arg + 42);
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [s.items[i], s.items[j]] = [s.items[j], s.items[i]];
      }
      break;
    }
    case "replace-type": if (n) s.items[at].kind = KINDS[(KINDS.indexOf(s.items[at].kind) + 1) % KINDS.length]; break;
    case "toggle-key": if (n) s.items[at].key = s.items[at].key == null ? `k${s.items[at].id}` : null; break;
    case "duplicate-key": if (n > 1) s.items[at].key = s.items[(at + 1) % n].key; break;
    case "change-props": if (n) { s.items[at].variant = (s.items[at].variant + 1) % 8; s.items[at].value += "x"; } break;
    case "raw-children": if (n) s.items[at].kind = s.items[at].kind === "raw" ? "span" : "raw"; break;
    case "empty-many": s.items = n ? [] : [item(11), item(12), item(13), item(14)]; break;
    case "wrapper": s.wrapper = s.wrapper === "div" ? "fragment" : s.wrapper === "fragment" ? "section" : "div"; break;
    case "root-props": s.attrs = (s.attrs + 1) % 8; break;
  }
  // A bounded size permits thousands of transitions in a normal test run.
  if (s.items.length > 8) s.items = s.items.slice(0, 8);
  return s;
}
const OPS = ["insert", "remove", "move", "reverse", "shuffle", "replace-type", "toggle-key", "duplicate-key", "change-props", "raw-children", "empty-many", "wrapper", "root-props"];
function attributes(variant: number): Record<string, any> {
  const props: Record<string, any> = { "data-state": variant % 2 ? null : "set" };
  if (variant % 4 === 0) props.className = "alpha";
  if (variant % 4 === 1) props.class = "beta";
  if (variant % 4 === 2) props.style = { color: "red", marginTop: "2px" };
  if (variant % 4 === 3) props.style = "color: blue";
  props.title = variant % 3 === 0 ? false : variant % 3 === 1 ? undefined : "caption";
  return props;
}
// Each materialisation creates fresh VNodes and handlers; the oracle has its own trace.
function materialize(state: State, calls: string[]) {
  const child = (it: Item): any => {
    const props: Record<string, any> = { ...attributes(it.variant), "data-id": String(it.id) };
    if (it.key != null) props.key = it.key;
    switch (it.kind) {
      case "hole": return it.variant % 3 === 0 ? null : it.variant % 3 === 1 ? false : undefined;
      case "text": return it.variant % 2 ? Number(it.id) : it.value;
      case "li": return h("li", props, it.value);
      case "span": return h("span", props, [it.value, [0, null, false, undefined]]);
      case "button":
        props.onClick = () => calls.push(`${it.id}:click:${it.variant}`);
        props.onClickCapture = () => calls.push(`${it.id}:capture:${it.variant}`);
        props.onDoubleClick = () => calls.push(`${it.id}:double:${it.variant}`);
        return h("button", props, it.value);
      case "input": props.value = it.value; props.checked = !!(it.variant % 2); props.type = "checkbox"; return h("input", props);
      case "a": props.href = it.variant % 3 === 0 ? "javascript:alert(1)" : it.variant % 3 === 1 ? "data:text/html,<svg/onload=alert(1)>" : "/safe"; return h("a", props, it.value);
      case "svg": return h("svg", props, h("circle", { cx: it.variant + 1, cy: "2", r: "1" }));
      case "raw": props.dangerouslySetInnerHTML = { __html: `<b>raw-${it.id}-${it.variant}</b>` }; return h("div", props, h("i", null, "ignored"));
      case "component": return h(Component, props, [it.value, [h("small", null, "!")]]);
      case "fragment": return h(Fragment, props, [h("b", null, it.value), [h("i", null, it.value)]]);
    }
  };
  const children = state.items.map(child);
  return state.wrapper === "fragment"
    ? h(Fragment, null, children)
    : h(state.wrapper, { ...attributes(state.attrs), "data-root": "matrix" }, children);
}
function snapshot(root: HTMLElement): any {
  const walk = (node: Element): any => ({
    tag: node.tagName, ns: node.namespaceURI,
    attributes: [...node.attributes].map(a => [a.name, a.value]).sort((a, b) => a[0].localeCompare(b[0])),
    value: /^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName) ? (node as HTMLInputElement).value : undefined,
    checked: node.tagName === "INPUT" ? (node as HTMLInputElement).checked : undefined,
    children: [...node.childNodes].map(n => n.nodeType === 3 ? ["#text", n.nodeValue] : walk(n as Element)),
  });
  return [...root.childNodes].map(n => n.nodeType === 3 ? ["#text", n.nodeValue] : walk(n as Element));
}
function assertions(root: HTMLElement, oracle: HTMLElement, left: string[], right: string[], label: string) {
  expect(snapshot(root), `${label}: structure and live properties`).toEqual(snapshot(oracle));
  // No innerHTML string comparison: attribute order is not meaningful, and
  // snapshot() already compares every attribute (sorted), text and live property.
  for (const element of [root, oracle]) {
    for (const a of element.querySelectorAll("a")) {
      expect((a.getAttribute("href") ?? "").toLowerCase().startsWith("javascript:"), `${label}: unsafe javascript URL`).toBe(false);
    }
    for (const node of element.querySelectorAll("[srcdoc]")) {
      throw new Error(`${label}: srcdoc reached DOM: ${node.outerHTML}`);
    }
  }
  // Click/capture/dblclick counts and handler freshness are compared with an independent mount.
  left.length = 0; right.length = 0;
  for (const [container, events] of [[root, left], [oracle, right]] as const) {
    for (const button of container.querySelectorAll("button")) {
      button.dispatchEvent(new container.ownerDocument.defaultView!.MouseEvent("click", { bubbles: true }));
      button.dispatchEvent(new container.ownerDocument.defaultView!.MouseEvent("dblclick", { bubbles: true }));
    }
  }
  expect(left, `${label}: event dispatch and latest handlers`).toEqual(right);
}
function run(sequence: Action[], seed: number) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const doc = dom.window.document;
  const root = doc.createElement("div");
  const left: string[] = [];
  let state = initial();
  const operations: string[] = [];
  try {
    for (const [step, action] of sequence.entries()) {
      const previous = state;
      const previousNodes = new Map<string, Element>();
      for (const it of previous.items) {
        if (it.key == null || ["hole", "text", "component", "fragment"].includes(it.kind)) continue;
        if (previous.items.filter(other => other.key === it.key).length !== 1) continue;
        const matches = [...root.querySelectorAll("[data-id]")].filter(el => el.getAttribute("data-id") === String(it.id));
        if (matches.length === 1) previousNodes.set(`${String(it.key)}:${it.id}:${it.kind}`, matches[0]);
      }
      state = update(state, action);
      operations.push(`${step}:${action.op}(${action.arg})`);
      const oracle = doc.createElement("div");
      const right: string[] = [];
      const label = `seed=${seed} sequence=[${operations.join(", ")}]`;
      try {
        render(materialize(state, left), root);
        render(materialize(state, right), oracle);
        assertions(root, oracle, left, right, label);
        if (state.wrapper === previous.wrapper) {
          for (const it of state.items) {
            if (it.key == null || state.items.filter(other => other.key === it.key).length !== 1) continue;
            const prior = previousNodes.get(`${String(it.key)}:${it.id}:${it.kind}`);
            if (!prior) continue;
            const matches = [...root.querySelectorAll("[data-id]")].filter(el => el.getAttribute("data-id") === String(it.id));
            if (matches.length === 1) expect(matches[0], `${label}: persistent keyed DOM identity`).toBe(prior);
          }
        }
      } catch (error) {
        throw new Error(`${label}\n${String(error)}`, { cause: error });
      } finally {
        render(null, oracle);
      }
    }
  } finally {
    render(null, root);
    dom.window.close();
  }
}
function generated(seed: number, length: number): Action[] {
  const rng = random(seed);
  return Array.from({ length }, () => ({ op: OPS[Math.floor(rng() * OPS.length)], arg: Math.floor(rng() * 65536) }));
}

/** Delta-debug a failure by deleting contiguous chunks; retain the shortest
 * still-failing subsequence found. Printed output is directly replayable.
 * Minimization runs only on a failed seed, never during successful cases.
 */
function minimize(sequence: Action[], seed: number): Action[] {
  let best = sequence.slice();
  let granularity = 2;
  while (best.length > 1) {
    const width = Math.ceil(best.length / granularity);
    let reduced = false;
    for (let start = 0; start < best.length; start += width) {
      const candidate = best.slice(0, start).concat(best.slice(start + width));
      if (!candidate.length) continue;
      try { run(candidate, seed); } catch {
        best = candidate;
        granularity = Math.max(2, granularity - 1);
        reduced = true;
        break;
      }
    }
    if (!reduced) {
      if (granularity >= best.length) break;
      granularity = Math.min(best.length, granularity * 2);
    }
  }
  return best;
}
function checked(sequence: Action[], seed: number): void {
  try { run(sequence, seed); } catch (error) {
    const smallest = minimize(sequence, seed);
    throw new Error(
      `seed=${seed} original=${JSON.stringify(sequence)}\n` +
      `MINIMIZED REPLAY=${JSON.stringify(smallest)}\n${String(error)}`,
      { cause: error },
    );
  }
}

describe("renderer differential matrix", () => {
  // 64 * 80 = 5,120 deterministic transitions, plus exhaustive short sequences.
  for (let seed = 1; seed <= 64; seed++) {
    test(`seed=${seed} random 80 operations`, () => checked(generated(seed, 80), seed));
  }
  const small = ["insert", "remove", "reverse", "change-props", "toggle-key", "empty-many"];
  for (let a = 0; a < small.length; a++) for (let b = 0; b < small.length; b++) for (let c = 0; c < small.length; c++) {
    const ops = [small[a], small[b], small[c]];
    test(`exhaustive ${ops.join(" → ")}`, () => checked(ops.map((op, i) => ({ op, arg: 11 + i })), 0));
  }
  test("regression: logical fragments grow before following host siblings", () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    const root = dom.window.document.createElement("div");
    const oracle = dom.window.document.createElement("div");
    const tree = (values: string[]) => h("main", null,
      h("span", null, "before"),
      h(Fragment, null, values.map(v => h("b", { key: v }, v))),
      h("span", null, "after"),
    );
    try {
      render(tree(["a"]), root);
      render(tree(["a", "b", "c"]), root);
      render(tree(["a", "b", "c"]), oracle);
      expect(snapshot(root)).toEqual(snapshot(oracle));
    } finally { render(null, root); render(null, oracle); dom.window.close(); }
  });
  test("regression: latest capture and double-click handlers fire once", () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    const root = dom.window.document.createElement("div");
    const events: string[] = [];
    const node = (version: number) => h("button", {
      onClickCapture: () => events.push(`capture-${version}`),
      onDoubleClick: () => events.push(`double-${version}`),
    }, "go");
    try {
      render(node(0), root);
      render(node(1), root);
      const button = root.querySelector("button")!;
      button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      button.dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true }));
      expect(events).toEqual(["capture-1", "double-1"]);
    } finally { render(null, root); dom.window.close(); }
  });
  test("regression: raw HTML content owns descendants on transition", () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    const root = dom.window.document.createElement("div");
    const oracle = dom.window.document.createElement("div");
    const raw = () => h("div", { dangerouslySetInnerHTML: { __html: "<b>raw</b>" } }, h("i", null, "ignored"));
    try {
      render(h("div", null, h("button", { onClick: () => {} }, "child")), root);
      render(raw(), root);
      render(raw(), oracle);
      expect(snapshot(root)).toEqual(snapshot(oracle));
      render(h("div", null, h("i", null, "back")), root);
      expect(root.innerHTML).toBe("<div><i>back</i></div>");
    } finally { render(null, root); render(null, oracle); dom.window.close(); }
  });
  test("regression: URL changes must pass the mount sanitiser", () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    const root = dom.window.document.createElement("div");
    try {
      render(h("a", { href: "/safe" }, "link"), root);
      render(h("a", { href: "javascript:alert(1)" }, "link"), root);
      expect(root.querySelector("a")!.hasAttribute("href")).toBe(false);
      render(h("a", { href: "data:text/html,<b>bad</b>" }, "link"), root);
      const fresh = dom.window.document.createElement("div");
      render(h("a", { href: "data:text/html,<b>bad</b>" }, "link"), fresh);
      expect(snapshot(root)).toEqual(snapshot(fresh));
      render(null, fresh);
    } finally { render(null, root); dom.window.close(); }
  });
  test("regression: srcdoc updates must not reach DOM", () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    const root = dom.window.document.createElement("div");
    try {
      render(h("iframe", { title: "frame" }), root);
      render(h("iframe", { srcDoc: "<script>alert(1)</script>" }), root);
      expect(root.querySelector("iframe")!.hasAttribute("srcdoc")).toBe(false);
    } finally { render(null, root); dom.window.close(); }
  });
  test("regression: duplicate keys retain every sibling on reorder", () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    const root = dom.window.document.createElement("div");
    const view = (values: string[]) => h("ul", null, values.map(v => h("li", { key: "duplicate" }, v)));
    try {
      render(view(["a", "b", "c"]), root);
      const initialNodes = [...root.querySelectorAll("li")];
      render(view(["c", "a", "b"]), root);
      expect(root.querySelectorAll("li").length).toBe(3);
      expect(root.textContent).toBe("cab");
      // Same DOM nodes (identity, not deep equality), reused in order of the duplicates.
      const after = [...root.querySelectorAll("li")];
      expect(after.every(node => initialNodes.includes(node))).toBe(true);
    } finally { render(null, root); dom.window.close(); }
  });
  test("regression: attributes and styles update like clean mounts", () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    const root = dom.window.document.createElement("div");
    const oracle = dom.window.document.createElement("div");
    try {
      render(h("div", { style: { color: "red" }, className: "old", title: "old" }), root);
      const next = () => h("div", { style: "color: blue", className: false, title: undefined });
      render(next(), root);
      render(next(), oracle);
      expect(snapshot(root)).toEqual(snapshot(oracle));
    } finally { render(null, root); render(null, oracle); dom.window.close(); }
  });
  test("boundary repaint matches full render for owned children", () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    const root = dom.window.document.createElement("div");
    const fresh = dom.window.document.createElement("div");
    const boundary = createBoundary<HTMLDivElement>();
    let value = "first";
    const Region = () => h("div", { ref: boundary }, h("b", null, value));
    try {
      render(h(Region, null), root);
      value = "second";
      expect(boundary.render()).toBe(true);
      render(h("div", null, h("b", null, value)), fresh);
      expect(snapshot(root)).toEqual(snapshot(fresh));
    } finally { render(null, root); render(null, fresh); dom.window.close(); }
  });
});
