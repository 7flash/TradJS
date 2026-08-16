/**
 * tradjs/client — Client-Side Renderer
 *
 * Pluggable VDOM reconciler with replaceable diffing strategies:
 *
 * 1. KEYED DIFF — O(n log n) via key→fiber map + LIS for list mutations.
 * 2. SEQUENTIAL DIFF — O(n) index-based for static/non-keyed children.
 * 3. PROPERTY PATCH — In-place attribute updates, preserves event listeners.
 *
 * The reconciler is configurable via `setReconciler()`. By default, `auto`
 * mode inspects children for keys and selects the best strategy per diff.
 *
 * Strategies are defined in `src/client/reconcilers/` and implement the
 * Reconciler interface. See reconcilers/types.ts for the contract.
 *
 * Zero dependencies. ~2KB gzipped.
 */

import {
  Fragment,
  type VNode,
  type Child,
  type Component,
  type Props,
} from "./types";
import type {
  Reconciler,
  ReconcilerContext,
  ReconcilerName,
} from "./reconcilers/types";
import { sequentialReconciler } from "./reconcilers/sequential";
import { keyedReconciler } from "./reconcilers/keyed";
import { replaceReconciler } from "./reconcilers/replace";
import {
  assignElementStyle,
  createDomElement,
  domAttributeName,
  setElementClass,
} from "./dom";

// ─── Fiber: Internal representation of a mounted VNode ─────────────────────────

export interface Fiber {
  node: Node | null; // The real DOM node (or null for fragments/components)
  vnode: VNode | Child; // The VNode that produced this fiber
  parent: Fiber | null;
  children: Fiber[];
  listeners: Map<string, EventListener>; // Track event listeners for cleanup
  key: string | number | null;
}

// ─── Public API ────────────────────────────────────────────────────────────────

const rootFibers = new WeakMap<HTMLElement, Fiber>();

// Per-render reconciler override — set during render(), used by diffChildren()
let _renderScopedReconciler: ReconcilerName | Reconciler | null = null;

export interface RenderOptions {
  /** Override reconciler strategy for this render call only. */
  reconciler?: ReconcilerName | Reconciler;
}

/**
 * Render a VNode tree into a container.
 * First call: mounts the tree.
 * Subsequent calls: diffs against the previous tree and patches the DOM.
 *
 * @param options.reconciler  Override reconciler for this render only.
 */
export function render(
  vnode: VNode | null,
  container: HTMLElement,
  options?: RenderOptions,
): Fiber {
  let rootFiber = rootFibers.get(container);

  if (!rootFiber) {
    while (container.firstChild) container.removeChild(container.firstChild);
    rootFiber = createFiber(null, null);
    rootFiber.node = container;
    rootFibers.set(container, rootFiber);
  }

  const prev = _renderScopedReconciler;
  _renderScopedReconciler = options?.reconciler ?? null;
  try {
    const newChildren = vnode ? [vnode] : [];
    diffChildren(rootFiber, container, rootFiber.children, newChildren);
  } finally {
    _renderScopedReconciler = prev;
  }

  return rootFiber;
}

// ─── Fiber Factory ─────────────────────────────────────────────────────────────

function createFiber(vnode: VNode | Child, parent: Fiber | null): Fiber {
  return {
    node: null,
    vnode,
    parent,
    children: [],
    listeners: new Map(),
    key:
      vnode && typeof vnode === "object" && "key" in vnode ? vnode.key : null,
  };
}

// ─── Collect DOM Nodes ─────────────────────────────────────────────────────────
// Fragments and components don't have their own DOM node.
// This collects the actual DOM nodes from a fiber tree.

function collectNodes(fiber: Fiber): Node[] {
  if (
    fiber.node &&
    !(
      fiber.vnode &&
      typeof fiber.vnode === "object" &&
      "type" in fiber.vnode &&
      fiber.vnode.type === Fragment
    )
  ) {
    // Regular element or text — return its DOM node
    if (fiber.node instanceof Element || fiber.node instanceof Text) {
      return [fiber.node];
    }
  }
  // Fragment or component without own node — collect from children
  const nodes: Node[] = [];
  for (const child of fiber.children) {
    nodes.push(...collectNodes(child));
  }
  return nodes;
}

// ─── Pluggable Reconciler ──────────────────────────────────────────────────────

/** The global reconciler. Defaults to 'auto' which selects keyed vs sequential per diff. */
let activeReconciler: ReconcilerName | Reconciler = "auto";

/** Named strategy lookup — avoids if/else chains. */
const RECONCILERS: Record<string, Reconciler> = {
  keyed: keyedReconciler,
  sequential: sequentialReconciler,
  replace: replaceReconciler,
};

/**
 * Set the global reconciliation strategy.
 * Can be overridden per-render via `render(vnode, container, { reconciler }))`.
 */
export function setReconciler(strategy: ReconcilerName | Reconciler): void {
  activeReconciler = strategy;
}

/** Get the current global reconciler name/function. */
export function getReconciler(): ReconcilerName | Reconciler {
  return activeReconciler;
}

/** Shared context passed to reconciler strategies. */
const reconcilerCtx: ReconcilerContext = {
  mountVNode,
  patchFiber,
  removeFiber,
  collectNodes,
};

function diffChildren(
  parentFiber: Fiber,
  parentNode: Node,
  oldFibers: Fiber[],
  newVNodes: (VNode | Child)[],
): void {
  const flatNew = flattenChildren(newVNodes);

  // Per-render override OR global strategy
  const effective = _renderScopedReconciler ?? activeReconciler;

  // Custom reconciler function — delegate entirely
  if (typeof effective === "function") {
    effective(parentFiber, parentNode, oldFibers, flatNew, reconcilerCtx);
    return;
  }

  // Detect keys in this set of children
  const hasKeys =
    flatNew.some(
      (v) => v && typeof v === "object" && "key" in v && v.key != null,
    ) || oldFibers.some((f) => f.key != null);

  // Named strategy resolution — key-aware at every level:
  //   'keyed'     → use keyed ONLY when keys exist, else sequential
  //   'sequential'→ always sequential (ignores keys entirely)
  //   'auto'      → keyed when keys present, sequential otherwise
  //   'replace'   → always replace
  if (effective === "replace") {
    RECONCILERS.replace(
      parentFiber,
      parentNode,
      oldFibers,
      flatNew,
      reconcilerCtx,
    );
    return;
  }
  if (effective === "sequential") {
    sequentialReconciler(
      parentFiber,
      parentNode,
      oldFibers,
      flatNew,
      reconcilerCtx,
    );
    return;
  }
  // 'keyed' and 'auto' both respect key presence
  if (hasKeys) {
    keyedReconciler(parentFiber, parentNode, oldFibers, flatNew, reconcilerCtx);
  } else {
    sequentialReconciler(
      parentFiber,
      parentNode,
      oldFibers,
      flatNew,
      reconcilerCtx,
    );
  }
}

// ─── Strategy 3: Property Patching ─────────────────────────────────────────────

function patchProps(
  el: Element,
  oldProps: Props,
  newProps: Props,
  fiber: Fiber,
): void {
  // Remove old props not in new
  const safeOldProps = oldProps || {};
  const safeNewProps = newProps || {};
  for (const key of Object.keys(safeOldProps)) {
    if (key === "children" || key === "key") continue;
    if (key in safeNewProps) continue;

    if (key.startsWith("on") && typeof safeOldProps[key] === "function") {
      const event = key.slice(2).toLowerCase();
      const oldListener = fiber.listeners.get(event);
      if (oldListener) {
        el.removeEventListener(event, oldListener);
        fiber.listeners.delete(event);
      }
    } else if (key === "className" || key === "class") {
      setElementClass(el, "");
    } else if (key === "style") {
      el.removeAttribute("style");
    } else {
      el.removeAttribute(domAttributeName(el, key));
    }
  }

  // Set new/changed props
  for (const [key, value] of Object.entries(safeNewProps)) {
    if (key === "children" || key === "key") continue;
    if (safeOldProps[key] === value) continue;

    if (key === "className" || key === "class") {
      setElementClass(el, value);
    } else if (key === "style" && typeof value === "object") {
      assignElementStyle(el, value, true);
    } else if (key.startsWith("on") && typeof value === "function") {
      const event = key.slice(2).toLowerCase();
      const oldListener = fiber.listeners.get(event);
      if (oldListener) el.removeEventListener(event, oldListener);
      el.addEventListener(event, value);
      fiber.listeners.set(event, value);
    } else if (
      key === "ref" &&
      typeof value === "object" &&
      "current" in value
    ) {
      value.current = el;
    } else if (key === "dangerouslySetInnerHTML") {
      el.innerHTML = value.__html;
    } else if (typeof value === "boolean") {
      if (value) el.setAttribute(domAttributeName(el, key), "");
      else el.removeAttribute(domAttributeName(el, key));
    } else if (value != null) {
      el.setAttribute(domAttributeName(el, key), String(value));
    } else {
      el.removeAttribute(domAttributeName(el, key));
    }
  }
}

// ─── Shallow Props Comparison ───────────────────────────────────────────────────

/**
 * Compare two props objects for shallow equality.
 * Ignores `children` and `key` — only compares actual props that affect rendering.
 * Used to bail out of component re-execution when props haven't changed.
 */
function shallowPropsEqual(
  a: Record<string, any>,
  b: Record<string, any>,
): boolean {
  if (a === b) return true;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  // Quick-check: count non-children/key props
  let aCount = 0,
    bCount = 0;
  for (let i = 0; i < aKeys.length; i++) {
    const k = aKeys[i];
    if (k === "children" || k === "key") continue;
    aCount++;
    if (!Object.prototype.hasOwnProperty.call(b, k) || a[k] !== b[k]) {
      return false;
    }
  }
  for (let i = 0; i < bKeys.length; i++) {
    const k = bKeys[i];
    if (k === "children" || k === "key") continue;
    bCount++;
  }
  return aCount === bCount;
}

// ─── Patch: Diff one fiber against a new VNode ─────────────────────────────────

function patchFiber(
  oldFiber: Fiber,
  newVNode: VNode | Child,
  parentFiber: Fiber,
  parentNode: Node,
): Fiber | null {
  if (
    newVNode === null ||
    newVNode === undefined ||
    newVNode === false ||
    newVNode === true
  ) {
    removeFiber(oldFiber, parentNode);
    return null;
  }

  // Text node
  if (typeof newVNode === "string" || typeof newVNode === "number") {
    if (oldFiber.node instanceof Text) {
      const text = String(newVNode);
      if (oldFiber.node.textContent !== text) {
        oldFiber.node.textContent = text;
      }
      oldFiber.vnode = newVNode;
      return oldFiber;
    }
    // Type changed — replace
    const anchor = getNextSibling(oldFiber, parentNode);
    removeFiber(oldFiber, parentNode);
    const newFiber = mountVNode(newVNode, parentFiber);
    if (newFiber?.node) {
      if (anchor) parentNode.insertBefore(newFiber.node, anchor);
      else parentNode.appendChild(newFiber.node);
    }
    return newFiber;
  }

  const oldVNode = oldFiber.vnode;
  if (!oldVNode || typeof oldVNode !== "object" || !("type" in oldVNode)) {
    // Old was text/null, new is VNode — replace
    const anchor = getNextSibling(oldFiber, parentNode);
    removeFiber(oldFiber, parentNode);
    const newFiber = mountVNode(newVNode, parentFiber);
    if (newFiber) {
      const nodes = collectNodes(newFiber);
      for (const node of nodes) {
        if (anchor) parentNode.insertBefore(node, anchor);
        else parentNode.appendChild(node);
      }
    }
    return newFiber;
  }

  // Same type? Patch in-place!
  if (oldVNode.type === newVNode.type) {
    // Fragment
    if (newVNode.type === Fragment) {
      const fragChildren = normalizeChildren(newVNode.props.children);
      diffChildren(oldFiber, parentNode, oldFiber.children, fragChildren);
      oldFiber.vnode = newVNode;
      return oldFiber;
    }

    // Component — always re-execute by default.
    // Components may read global/module state, so unchanged props do not prove
    // unchanged output. Use memo(Component) for explicit opt-in bailout.
    if (typeof newVNode.type === "function") {
      const compare = (newVNode.type as any).__tradjsMemoCompare as
        ((oldProps: any, newProps: any) => boolean) | undefined;

      if (compare && compare(oldVNode.props, newVNode.props)) {
        oldFiber.vnode = newVNode;
        return oldFiber;
      }

      const result = (newVNode.type as Component)(newVNode.props);
      const resultArr = result ? [result] : [];
      const componentParent = oldFiber.node || parentNode;
      diffChildren(oldFiber, componentParent, oldFiber.children, resultArr);
      oldFiber.vnode = newVNode;
      // Update component fiber's node reference to its first child's node
      if (oldFiber.children.length > 0 && oldFiber.children[0].node) {
        oldFiber.node = oldFiber.children[0].node;
      }
      return oldFiber;
    }

    // Same DOM element — patch props + diff children (HTML or SVG).
    const el = oldFiber.node;
    if (el instanceof Element) {
      patchProps(el, oldVNode.props, newVNode.props, oldFiber);
      const newChildVNodes = normalizeChildren(newVNode.props.children);
      diffChildren(oldFiber, el, oldFiber.children, newChildVNodes);
      oldFiber.vnode = newVNode;
      return oldFiber;
    }
  }

  // Different type — replace
  const anchor = getNextSibling(oldFiber, parentNode);
  removeFiber(oldFiber, parentNode);
  const newFiber = mountVNode(newVNode, parentFiber);
  if (newFiber) {
    const nodes = collectNodes(newFiber);
    for (const node of nodes) {
      if (anchor) parentNode.insertBefore(node, anchor);
      else parentNode.appendChild(node);
    }
  }
  return newFiber;
}

// ─── Mount: Create a fiber + DOM node from a VNode ─────────────────────────────
// `parentNode` is optional — if provided, the created node is appended there.

function mountVNode(
  vnode: VNode | Child,
  parentFiber: Fiber,
  parentNode?: Node,
): Fiber | null {
  if (
    vnode === null ||
    vnode === undefined ||
    vnode === false ||
    vnode === true
  ) {
    return null;
  }

  // Text
  if (typeof vnode === "string" || typeof vnode === "number") {
    const fiber = createFiber(vnode, parentFiber);
    fiber.node = document.createTextNode(String(vnode));
    if (parentNode) parentNode.appendChild(fiber.node);
    return fiber;
  }

  const { type, props: rawProps } = vnode;
  const props = rawProps || {};

  // Fragment — no own DOM node, mount children directly
  if (type === Fragment) {
    const fiber = createFiber(vnode, parentFiber);
    const children = normalizeChildren(props.children);
    for (const child of children) {
      const childFiber = mountVNode(child, fiber, parentNode);
      if (childFiber) fiber.children.push(childFiber);
    }
    return fiber;
  }

  // Component — execute and mount result
  if (typeof type === "function") {
    const fiber = createFiber(vnode, parentFiber);
    const result = (type as Component)(props);
    if (result) {
      const childFiber = mountVNode(result, fiber, parentNode);
      if (childFiber) {
        fiber.children.push(childFiber);
        fiber.node = childFiber.node;
      }
    }
    return fiber;
  }

  // DOM element. SVG descendants inherit the namespace from their parent.
  const el = createDomElement(type as string, parentNode);
  const fiber = createFiber(vnode, parentFiber);
  fiber.node = el;

  applyProps(el, props, fiber);

  // Mount children into the element
  const children = normalizeChildren(props.children);
  for (const child of children) {
    const childFiber = mountVNode(child, fiber, el);
    if (childFiber) fiber.children.push(childFiber);
  }

  // Append to parent DOM node
  if (parentNode) parentNode.appendChild(el);

  return fiber;
}

// ─── Remove: Clean up a fiber and remove its DOM nodes ─────────────────────────
// Unlike unmountFiber, this does NOT modify parent.children — the caller manages that.

function removeFiber(fiber: Fiber, parentNode: Node): void {
  // Collect all DOM nodes this fiber owns
  const nodes = collectNodes(fiber);
  for (const node of nodes) {
    if (node.parentNode) node.parentNode.removeChild(node);
  }

  // Clean up listeners recursively
  cleanupFiber(fiber);
}

function cleanupFiber(fiber: Fiber): void {
  if (fiber.node instanceof Element) {
    for (const [event, listener] of fiber.listeners) {
      fiber.node.removeEventListener(event, listener);
    }
  }
  fiber.listeners.clear();
  for (const child of fiber.children) {
    cleanupFiber(child);
  }
  fiber.children = [];
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function applyProps(el: Element, props: Props, fiber: Fiber): void {
  if (!props) return;
  for (const [key, value] of Object.entries(props)) {
    if (key === "children" || key === "key") continue;

    if (key === "className" || key === "class") {
      setElementClass(el, value);
    } else if (key === "style" && typeof value === "object") {
      assignElementStyle(el, value);
    } else if (key.startsWith("on") && typeof value === "function") {
      const event = key.slice(2).toLowerCase();
      el.addEventListener(event, value);
      fiber.listeners.set(event, value);
    } else if (
      key === "ref" &&
      typeof value === "object" &&
      "current" in value
    ) {
      value.current = el;
    } else if (key === "dangerouslySetInnerHTML") {
      el.innerHTML = value.__html;
    } else if (typeof value === "boolean") {
      if (value) el.setAttribute(domAttributeName(el, key), "");
    } else if (value != null) {
      el.setAttribute(domAttributeName(el, key), String(value));
    }
  }
}

function normalizeChildren(
  children: Child | Child[] | undefined,
): (VNode | Child)[] {
  if (children === undefined || children === null) return [];
  if (!Array.isArray(children)) return [children];
  return children.flat(Infinity) as (VNode | Child)[];
}

function flattenChildren(children: (VNode | Child)[]): (VNode | Child)[] {
  const result: (VNode | Child)[] = [];
  for (const child of children) {
    if (Array.isArray(child)) {
      result.push(...flattenChildren(child as (VNode | Child)[]));
    } else if (
      child !== null &&
      child !== undefined &&
      child !== false &&
      child !== true
    ) {
      result.push(child);
    }
  }
  return result;
}

/**
 * Get the next sibling DOM node after a fiber's nodes, for insertion positioning.
 */
function getNextSibling(fiber: Fiber, parentNode: Node): Node | null {
  const nodes = collectNodes(fiber);
  if (nodes.length === 0) return null;
  return nodes[nodes.length - 1].nextSibling;
}

// ─── Explicit Component Memoization ────────────────────────────────────────────

export function memo<P extends Record<string, any>>(
  Component: (props: P) => any,
  compare: (oldProps: P, newProps: P) => boolean = shallowPropsEqual,
) {
  function MemoComponent(props: P) {
    return Component(props);
  }

  Object.defineProperty(MemoComponent, "name", {
    value: Component.name ? `Memo(${Component.name})` : "MemoComponent",
    configurable: true,
  });

  (MemoComponent as any).__tradjsMemoCompare = compare;

  return MemoComponent as typeof Component;
}

// ─── createElement ─────────────────────────────────────────────────────────────

export function createElement(
  type: string | Component<any> | typeof Fragment,
  props: Props | null,
  ...children: Child[]
): VNode {
  const normalizedProps: Props = { ...(props || {}) };
  if (children.length === 1) {
    normalizedProps.children = children[0];
  } else if (children.length > 1) {
    normalizedProps.children = children;
  }
  return {
    type,
    props: normalizedProps,
    key: normalizedProps.key ?? null,
  };
}

// JSX automatic transform
export function jsx(type: any, props: any, key?: any): VNode {
  return { type, props: props || {}, key: key ?? props?.key ?? null };
}
export const jsxs = jsx;
export const jsxDEV = jsx;
