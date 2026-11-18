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
import { isFormStateProp, setDomProp } from "./props";
import {
  attachBoundary,
  detachBoundary,
  isBoundary,
  type Boundary,
} from "./boundary";
import {
  assignElementStyle,
  createDomElement,
  domAttributeName,
  SVG_NS,
  MATH_NS,
  setElementClass,
} from "./dom";

import { foreignAttribute, isEventProp, isSafeHtmlName } from "../shared/attributes";

/**
 * HTML tokenization keeps the last effective JSX spelling in the client
 * (the server emits only the last spelling because the parser otherwise keeps
 * the first duplicate attribute). Track by canonical qualified name.
 */
function foreignPropEntries(
  props: Props,
  namespace: string,
): Map<string, [string, unknown]> {
  const entries = new Map<string, [string, unknown]>();
  for (const [key, value] of Object.entries(props || {})) {
    if (key === "children" || key === "key" || key === "ref" ||
        key === "dangerouslySetInnerHTML" ||
        !isSafeHtmlName(key) || isEventProp(key)) continue;
    const mapped = foreignAttribute(key, namespace);
    // Namespace is part of the identity; a namespaced attribute must not be
    // removed/recreated as an unnamespaced attribute during a keyed reorder.
    entries.set(`${mapped.namespace ?? ""}|${mapped.localName}`, [key, value]);
  }
  return entries;
}

export interface Fiber {
  /** Document of the render container; every node of this tree is created in it. */
  ownerDocument: Document | null;
  node: Node | null;
  vnode: VNode | Child;
  parent: Fiber | null;
  children: Fiber[];
  listeners: Map<string, EventListener>;
  key: string | number | null;
}

const rootFibers = new WeakMap<HTMLElement, Fiber>();
const vnodeOwners = new WeakMap<VNode, Fiber>();
const nodeOwners = new WeakMap<Node, Fiber>();
const boundRefs = new WeakMap<Fiber, { ref: unknown; element: Element }>();
let activeComponentFiber: Fiber | null = null;
let renderInProgress = false;
let activePlacementAnchors = new Map<
  Fiber,
  { parentNode: Node; anchor: Node | null }
>();
let activeRenderPass: RenderPass | null = null;
let _renderScopedReconciler: ReconcilerName | Reconciler | null = null;

export interface RenderOptions {
  reconciler?: ReconcilerName | Reconciler;
}

interface RenderPass {
  created: Set<Fiber>;
  cleaned: Set<Fiber>;
  cleanupErrors: unknown[];
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as any).then === "function"
  );
}

function assertSyncClientComponentResult(result: unknown): void {
  if (!isPromiseLike(result)) return;
  throw new Error(
    "[tradjs] Client render() does not support async components; browser render() is synchronous. Await async work in a controller/action, update state, then repaint the affected render boundary.",
  );
}

function runRenderTransaction<T>(work: () => T): T {
  if (renderInProgress) {
    throw new Error("[tradjs] Cannot render during another render.");
  }
  renderInProgress = true;
  const previousPass = activeRenderPass;
  const pass: RenderPass = {
    created: new Set(),
    cleaned: new Set(),
    cleanupErrors: [],
  };
  activeRenderPass = pass;
  let result!: T;
  let failed = false;
  let failure: unknown;
  try {
    result = work();
  } catch (error) {
    failed = true;
    failure = error;
  } finally {
    activeRenderPass = previousPass;
    renderInProgress = false;
  }

  if (failed) {
    if (pass.cleanupErrors.length) {
      const aggregate = new AggregateError(
        [failure, ...pass.cleanupErrors],
        "[tradjs] Render failed and cleanup also failed.",
      );
      (aggregate as any).cause = failure;
      throw aggregate;
    }
    throw failure;
  }
  if (pass.cleanupErrors.length === 1) throw pass.cleanupErrors[0];
  if (pass.cleanupErrors.length > 1) {
    throw new AggregateError(
      pass.cleanupErrors,
      "[tradjs] Multiple render cleanup operations failed.",
    );
  }
  return result;
}

export function render(
  vnode: VNode | null,
  container: HTMLElement,
  options?: RenderOptions,
): Fiber {
  return runRenderTransaction(() => {
    let rootFiber = rootFibers.get(container);
    if (!rootFiber) {
      const ownerFiber = nodeOwners.get(container);
      if (ownerFiber) {
        rootFiber = ownerFiber;
      } else {
        for (
          let ancestor = container.parentNode;
          ancestor;
          ancestor = ancestor.parentNode
        ) {
          if (nodeOwners.has(ancestor)) {
            throw new Error(
              "[tradjs] Cannot render into an untracked descendant.",
            );
          }
        }
        rootFiber = createFiber(null, null, container.ownerDocument);
        rootFiber.node = container;
        nodeOwners.set(container, rootFiber);
        rootFibers.set(container, rootFiber);
        const cleanupCount = activeRenderPass!.cleanupErrors.length;
        clearInitialContainer(rootFiber, container);
        if (activeRenderPass!.cleanupErrors.length > cleanupCount) {
          return rootFiber;
        }
      }
      rootFibers.set(container, rootFiber);
    }

    const prev = _renderScopedReconciler;
    _renderScopedReconciler = options?.reconciler ?? null;
    try {
      const previousFibers = snapshotFibers(rootFiber.children);
      try {
        // 0 and "" are content; only null, undefined and booleans render nothing.
      const newChildren =
        vnode == null || typeof vnode === "boolean" ? [] : [vnode];
        // Raw HTML has no child fibers. Remove its unmanaged DOM before taking
        // over the region, without modifying the caller-owned VNode.
        const rootVNode = rootFiber.vnode;
        if (
          rootFiber.node === container &&
          rootFiber.children.length === 0 &&
          container.firstChild &&
          rootVNode &&
          typeof rootVNode === "object" &&
          "type" in rootVNode &&
          rootVNode.props?.dangerouslySetInnerHTML
        ) {
          cleanupNestedRoots(container, rootFiber);
          removeContainerChildren(container);
        }
        diffChildren(rootFiber, container, rootFiber.children, newChildren);
        syncControlledAncestors(container);
      } catch (error) {
        rollbackRenderTarget(rootFiber, container, previousFibers);
        throw error;
      }
    } finally {
      _renderScopedReconciler = prev;
    }
    return rootFiber;
  });
}

function isElementNode(node: unknown): node is Element {
  return !!node && (node as Node).nodeType === 1;
}

function isTextNode(node: unknown): node is Text {
  return !!node && (node as Node).nodeType === 3;
}

function findHostParentNode(fiber: Fiber): Node | undefined {
  let current: Fiber | null = fiber;
  while (current) {
    if (current.node) return current.node;
    current = current.parent;
  }
  return undefined;
}

/** The document to create nodes in: the parent node's, else the render
 *  container's (kept on the fiber), else the global one. */
function documentFor(fiber: Fiber, parentNode?: Node): Document {
  const doc =
    parentNode?.ownerDocument ??
    fiber.ownerDocument ??
    (typeof document !== "undefined" ? document : null);
  if (!doc) throw new Error("[tradjs] No document to render into.");
  return doc;
}

function createFiber(
  vnode: VNode | Child,
  parent: Fiber | null,
  ownerDocument?: Document | null,
): Fiber {
  const fiber: Fiber = {
    ownerDocument: ownerDocument ?? parent?.ownerDocument ?? null,
    node: null,
    vnode,
    parent,
    children: [],
    listeners: new Map(),
    key:
      vnode && typeof vnode === "object" && "key" in vnode ? vnode.key : null,
  };
  if (parent) activeRenderPass?.created.add(fiber);
  return fiber;
}

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
    if (isElementNode(fiber.node) || isTextNode(fiber.node)) {
      return [fiber.node];
    }
  }
  const nodes: Node[] = [];
  for (const child of fiber.children) {
    nodes.push(...collectNodes(child));
  }
  return nodes;
}

let activeReconciler: ReconcilerName | Reconciler = "auto";

const RECONCILERS: Record<string, Reconciler> = {
  keyed: keyedReconciler,
  sequential: sequentialReconciler,
  replace: replaceReconciler,
};

export function setReconciler(strategy: ReconcilerName | Reconciler): void {
  activeReconciler = strategy;
}

export function getReconciler(): ReconcilerName | Reconciler {
  return activeReconciler;
}

const reconcilerCtx: ReconcilerContext = {
  mountVNode,
  patchFiber,
  removeFiber,
  collectNodes,
};

function findPlacementAnchor(fiber: Fiber, parentNode: Node): Node | null {
  let current: Fiber | null = fiber;

  while (current?.parent) {
    const parent: Fiber = current.parent;
    const index = parent.children.indexOf(current);

    if (index >= 0) {
      for (let i = index + 1; i < parent.children.length; i++) {
        const siblingNodes = collectNodes(parent.children[i]);
        for (const node of siblingNodes) {
          if (node.parentNode === parentNode) return node;
        }
      }
    }

    if (parent.node === parentNode) return null;
    current = parent;
  }

  return null;
}

function placeLogicalFiber(
  fiber: Fiber,
  parentNode: Node,
  anchor: Node | null,
): void {
  const nodes = collectNodes(fiber);
  if (nodes.length === 0) return;

  const safeAnchor = anchor?.parentNode === parentNode ? anchor : null;
  const allParented = nodes.every((node) => node.parentNode === parentNode);
  const contiguous =
    allParented &&
    nodes.every(
      (node, index) =>
        index === nodes.length - 1 || node.nextSibling === nodes[index + 1],
    );
  const correctlyPlaced =
    contiguous && nodes[nodes.length - 1].nextSibling === safeAnchor;

  if (correctlyPlaced) return;

  for (const node of nodes) {
    if (safeAnchor) parentNode.insertBefore(node, safeAnchor);
    else parentNode.appendChild(node);
  }
}

function cachedPlacementAnchor(
  fiber: Fiber,
  parentNode: Node,
): Node | null | undefined {
  const cached = activePlacementAnchors.get(fiber);
  if (!cached || cached.parentNode !== parentNode) return undefined;
  if (cached.anchor && cached.anchor.parentNode !== parentNode) {
    return undefined;
  }
  return cached.anchor;
}

const warnedDuplicateKeys = new Set<string>();

/**
 * Duplicate sibling keys still render (the reconciler matches them in
 * order), but they are almost always a bug, so say so once per key.
 */
function warnDuplicateKeys(children: (VNode | Child)[]): void {
  const seen = new Set<unknown>();
  for (const child of children) {
    if (!child || typeof child !== "object" || !("key" in child)) continue;
    const key = (child as VNode).key;
    if (key == null) continue;
    if (seen.has(key)) {
      const id = String(key);
      if (!warnedDuplicateKeys.has(id)) {
        warnedDuplicateKeys.add(id);
        console.warn(`[tradjs] Duplicate sibling key "${id}"; give each item in a list its own key.`);
      }
    } else seen.add(key);
  }
}

function diffChildren(
  parentFiber: Fiber,
  parentNode: Node,
  oldFibers: Fiber[],
  newVNodes: (VNode | Child)[],
): void {
  const flatNew = flattenChildren(newVNodes);
  const effective = _renderScopedReconciler ?? activeReconciler;
  const hasKeys =
    flatNew.some(
      (v) => v && typeof v === "object" && "key" in v && v.key != null,
    ) || oldFibers.some((f) => f.key != null);
  if (hasKeys) warnDuplicateKeys(flatNew);
  const logicalParent = parentFiber.node === null;
  const oldLogicalNodes = logicalParent ? collectNodes(parentFiber) : [];
  const needsPlacement =
    logicalParent &&
    (oldLogicalNodes.length === 0 ||
      // More children than before: new nodes must go before the next sibling,
      // not at the end of the host element.
      flatNew.length > oldFibers.length ||
      typeof effective === "function" ||
      effective === "replace" ||
      hasKeys);
  const cached = cachedPlacementAnchor(parentFiber, parentNode);
  const placementAnchor = needsPlacement
    ? cached !== undefined
      ? cached
      : findPlacementAnchor(parentFiber, parentNode)
    : null;

  // Capture anchors before a reconciler starts replacing parent.children.
  // Empty components and fragments can acquire DOM nodes during this pass;
  // their placement must still be relative to the original following sibling.
  const previousAnchors = activePlacementAnchors;
  const nextAnchors = new Map(previousAnchors);
  for (const child of oldFibers) {
    if (child.node === null) {
      nextAnchors.set(child, {
        parentNode,
        anchor: findPlacementAnchor(child, parentNode),
      });
    }
  }
  activePlacementAnchors = nextAnchors;
  try {
    if (typeof effective === "function") {
      effective(parentFiber, parentNode, oldFibers, flatNew, reconcilerCtx);
      if (needsPlacement) {
        placeLogicalFiber(parentFiber, parentNode, placementAnchor);
      }
      return;
    }

    if (effective === "replace") {
      RECONCILERS.replace(
        parentFiber,
        parentNode,
        oldFibers,
        flatNew,
        reconcilerCtx,
      );
    } else if (effective === "sequential") {
      sequentialReconciler(
        parentFiber,
        parentNode,
        oldFibers,
        flatNew,
        reconcilerCtx,
      );
    } else if (hasKeys) {
      keyedReconciler(
        parentFiber,
        parentNode,
        oldFibers,
        flatNew,
        reconcilerCtx,
      );
    } else {
      sequentialReconciler(
        parentFiber,
        parentNode,
        oldFibers,
        flatNew,
        reconcilerCtx,
      );
    }

    if (needsPlacement) {
      placeLogicalFiber(parentFiber, parentNode, placementAnchor);
    }
  } finally {
    activePlacementAnchors = previousAnchors;
  }
}

function syncControlledAncestors(container: Node): void {
  for (let node: Node | null = container; node; node = node.parentNode) {
    if (!isElementNode(node)) continue;
    const fiber = nodeOwners.get(node);
    const vnode = fiber?.vnode;
    if (vnode && typeof vnode === "object" && "type" in vnode) {
      syncFormState(node, vnode.props || {});
    }
  }
}

/**
 * onClick -> "click", onClickCapture -> "click" in the capture phase,
 * onDoubleClick -> "dblclick". The returned id keys fiber.listeners.
 */
function eventOf(key: string): { type: string; capture: boolean; id: string } {
  let name = key.slice(2);
  let capture = false;
  if (name.length > 7 && name.endsWith("Capture")) {
    capture = true;
    name = name.slice(0, -7);
  }
  let type = name.toLowerCase();
  if (type === "doubleclick") type = "dblclick";
  return { type, capture, id: capture ? `${type}|capture` : type };
}

function removeListenerById(el: EventTarget, id: string, listener: EventListener): void {
  const [type, phase] = id.split("|");
  el.removeEventListener(type, listener, phase === "capture");
}

function patchProps(
  el: Element,
  oldProps: Props,
  newProps: Props,
  fiber: Fiber,
): void {
  const safeOldProps = oldProps || {};
  const safeNewProps = newProps || {};
  const foreignNamespace =
    el.namespaceURI === SVG_NS || el.namespaceURI === MATH_NS
      ? el.namespaceURI : null;
  for (const key of Object.keys(safeOldProps)) {
    if (key === "children" || key === "key" || key === "ref") continue;
    if (foreignNamespace && !isEventProp(key) && key !== "dangerouslySetInnerHTML") continue;
    if (
      key in safeNewProps &&
      !(key.startsWith("on") && typeof safeNewProps[key] !== "function")
    ) continue;
    if (key.startsWith("on") && typeof safeOldProps[key] === "function") {
      const { id } = eventOf(key);
      const oldListener = fiber.listeners.get(id);
      if (oldListener) {
        removeListenerById(el, id, oldListener);
        fiber.listeners.delete(id);
      }
    } else if (key === "dangerouslySetInnerHTML") {
      el.innerHTML = "";
    } else {
      // Removals must obey the same attribute and form-property rules as mounts.
      setDomProp(el, key, null);
    }
  }

  for (const [key, value] of Object.entries(safeNewProps)) {
    if (key === "children" || key === "key" || key === "ref") continue;
    if (foreignNamespace && !isEventProp(key) && key !== "dangerouslySetInnerHTML") continue;
    if (isFormStateProp(el, key)) continue;
    if (key === "dangerouslySetInnerHTML") {
      el.innerHTML = value?.__html ?? "";
      continue;
    }
    if (safeOldProps[key] === value) continue;
    if (key.startsWith("on") && typeof value === "function") {
      const { type, capture, id } = eventOf(key);
      const oldListener = fiber.listeners.get(id);
      if (oldListener) removeListenerById(el, id, oldListener);
      el.addEventListener(type, value, capture);
      fiber.listeners.set(id, value);
    } else {
      // In particular, never bypass URL / srcdoc validation on updates.
      setDomProp(el, key, value);
    }
  }
  if (foreignNamespace) {
    const before = foreignPropEntries(safeOldProps, foreignNamespace);
    const after = foreignPropEntries(safeNewProps, foreignNamespace);
    for (const [identity, [key]] of before)
      if (!after.has(identity)) setDomProp(el, key, null);
    for (const [identity, [key, value]] of after) {
      if (!before.has(identity) || before.get(identity)![1] !== value)
        setDomProp(el, key, value);
    }
  }
}

function shallowPropsEqual(
  a: Record<string, any>,
  b: Record<string, any>,
): boolean {
  if (a === b) return true;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
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

  if (typeof newVNode === "string" || typeof newVNode === "number") {
    if (isTextNode(oldFiber.node)) {
      const text = String(newVNode);
      if (oldFiber.node.textContent !== text) {
        oldFiber.node.textContent = text;
      }
      oldFiber.vnode = newVNode;
      return oldFiber;
    }
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

  if (oldVNode.type === newVNode.type) {
    if (newVNode.type === Fragment) {
      const fragChildren = normalizeChildren(newVNode.props.children);
      diffChildren(oldFiber, parentNode, oldFiber.children, fragChildren);
      oldFiber.vnode = newVNode;
      return oldFiber;
    }

    if (typeof newVNode.type === "function") {
      const compare = (newVNode.type as any).__tradjsMemoCompare as
        ((oldProps: any, newProps: any) => boolean) | undefined;
      if (compare && compare(oldVNode.props, newVNode.props)) {
        oldFiber.vnode = newVNode;
        return oldFiber;
      }
      const result = executeComponent(
        oldFiber,
        newVNode.type as Component,
        newVNode.props,
      );
      const resultArr = flattenChildren([result]);
      diffChildren(oldFiber, parentNode, oldFiber.children, resultArr);
      oldFiber.vnode = newVNode;
      oldFiber.node = null;
      return oldFiber;
    }

    const el = oldFiber.node;
    if (isElementNode(el)) {
      if (oldVNode.props.ref !== newVNode.props.ref) {
        releaseRef(oldVNode.props.ref, el, oldFiber);
      }
      // Raw HTML owns the element's content: unmount the old children first
      // (disposing their listeners and refs) and render no children with it.
      const raw = newVNode.props.dangerouslySetInnerHTML != null;
      const childHost = childMountHost(el, normalizeChildren(newVNode.props.children));
      if (raw && oldFiber.children.length)
        diffChildren(oldFiber, childHost, oldFiber.children, []);
      patchProps(el, oldVNode.props, newVNode.props, oldFiber);
      if (!raw) {
        const newChildVNodes = normalizeChildren(newVNode.props.children);
        diffChildren(oldFiber, childHost, oldFiber.children, newChildVNodes);
      }
      syncFormState(el, newVNode.props);
      oldFiber.vnode = newVNode;
      bindRef(
        newVNode.props.ref,
        el,
        oldFiber,
        vnodeOwners.get(newVNode) ?? null,
      );
      return oldFiber;
    }
  }

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

// <template> children belong in its content fragment, as the HTML parser
// puts them. (Rows placed directly in a <table> stay there: the DOM accepts
// them, and an implicit <tbody> would move rows between parents on diffs.)
function childMountHost(el: Element, _children: (VNode | Child)[]): Node {
  if (el.localName === "template") return (el as HTMLTemplateElement).content;
  return el;
}

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

  const hostParentNode = parentNode ?? findHostParentNode(parentFiber);

  if (typeof vnode === "string" || typeof vnode === "number") {
    const fiber = createFiber(vnode, parentFiber);
    fiber.node = documentFor(fiber, hostParentNode).createTextNode(String(vnode));
    if (hostParentNode) hostParentNode.appendChild(fiber.node);
    return fiber;
  }

  const { type, props: rawProps } = vnode;
  const props = rawProps || {};

  if (type === Fragment) {
    const fiber = createFiber(vnode, parentFiber);
    const children = normalizeChildren(props.children);
    for (const child of children) {
      const childFiber = mountVNode(child, fiber, hostParentNode);
      if (childFiber) fiber.children.push(childFiber);
    }
    return fiber;
  }

  if (typeof type === "function") {
    const fiber = createFiber(vnode, parentFiber);
    const result = executeComponent(fiber, type as Component, props);
    const children = flattenChildren([result]);
    for (const child of children) {
      const childFiber = mountVNode(child, fiber, hostParentNode);
      if (childFiber) fiber.children.push(childFiber);
    }
    return fiber;
  }

  const fiber = createFiber(vnode, parentFiber);
  const el = createDomElement(type as string, hostParentNode, documentFor(fiber, hostParentNode));
  fiber.node = el;
  nodeOwners.set(el, fiber);

  applyProps(el, props, fiber);

  // With raw HTML, the HTML is the content; children are ignored.
  const children =
    props.dangerouslySetInnerHTML != null ? [] : normalizeChildren(props.children);
  const childHost = childMountHost(el, children);
  for (const child of children) {
    const childFiber = mountVNode(child, fiber, childHost);
    if (childFiber) fiber.children.push(childFiber);
  }
  syncFormState(el, props);
  if (hostParentNode) hostParentNode.appendChild(el);
  bindRef(props.ref, el, fiber, vnodeOwners.get(vnode) ?? null);

  return fiber;
}

function removeFiber(fiber: Fiber, parentNode: Node): void {
  const nodes = collectNodes(fiber);
  for (const node of nodes) {
    try {
      if (node.parentNode) node.parentNode.removeChild(node);
    } catch (error) {
      recordCleanupError(error);
    }
  }
  cleanupFiber(fiber);
}

function snapshotFibers(fibers: Fiber[]): Fiber[] {
  const result: Fiber[] = [];
  const visit = (fiber: Fiber): void => {
    result.push(fiber);
    for (const child of fiber.children) visit(child);
  };
  for (const fiber of fibers) visit(fiber);
  return result;
}

function recordCleanupError(error: unknown): void {
  if (activeRenderPass) activeRenderPass.cleanupErrors.push(error);
  else throw error;
}

function cleanupNestedRoots(container: Node, rootFiber: Fiber): void {
  const visit = (node: Node): void => {
    if (isElementNode(node)) {
      const element = node as HTMLElement;
      const nested = rootFibers.get(element);
      if (nested && nested !== rootFiber) {
        cleanupFiber(nested);
        rootFibers.delete(element);
      }
    }
    for (let child = node.firstChild; child; child = child.nextSibling) {
      visit(child);
    }
  };
  for (let child = container.firstChild; child; child = child.nextSibling) {
    visit(child);
  }
}

function removeContainerChildren(container: Node): void {
  for (let child = container.firstChild; child; ) {
    const next = child.nextSibling;
    try {
      container.removeChild(child);
    } catch (error) {
      recordCleanupError(error);
    }
    child = next;
  }
}

function clearInitialContainer(rootFiber: Fiber, container: Node): void {
  cleanupNestedRoots(container, rootFiber);
  removeContainerChildren(container);
  rootFiber.children = [];
}

function rollbackRenderTarget(
  rootFiber: Fiber,
  container: Node,
  previousFibers: Fiber[],
): void {
  for (const fiber of previousFibers) cleanupFiber(fiber);
  const pass = activeRenderPass;
  if (pass) {
    for (const fiber of pass.created) cleanupFiber(fiber);
  }
  cleanupNestedRoots(container, rootFiber);
  removeContainerChildren(container);
  rootFiber.children = [];
}

function cleanupFiber(fiber: Fiber): void {
  const pass = activeRenderPass;
  if (pass) {
    if (pass.cleaned.has(fiber)) return;
    pass.cleaned.add(fiber);
  }

  const node = fiber.node;
  if (isElementNode(node)) {
    const bound = boundRefs.get(fiber);
    if (bound) {
      try {
        releaseRef(bound.ref, bound.element, fiber);
      } catch (error) {
        recordCleanupError(error);
      }
    }
    for (const [event, listener] of fiber.listeners) {
      try {
        removeListenerById(node, event, listener);
      } catch (error) {
        recordCleanupError(error);
      }
    }
    if (nodeOwners.get(node) === fiber) nodeOwners.delete(node);
    if (rootFibers.get(node as HTMLElement) === fiber) {
      rootFibers.delete(node as HTMLElement);
    }
  }
  fiber.listeners.clear();

  const children = [...fiber.children];
  for (const child of children) {
    cleanupFiber(child);
  }
  fiber.children = [];
}

// Reapply controlled state even when vnode props are unchanged: user input can
// change live properties independently. Select values require mounted options.
function syncFormState(el: Element, props: Props): void {
  for (const [key, value] of Object.entries(props || {})) {
    if (isFormStateProp(el, key)) setDomProp(el, key, value);
  }
}

function applyProps(el: Element, props: Props, fiber: Fiber): void {
  if (!props) return;
  const foreignNamespace =
    el.namespaceURI === SVG_NS || el.namespaceURI === MATH_NS
      ? el.namespaceURI : null;
  for (const [key, value] of Object.entries(props)) {
    if (key === "children" || key === "key" || key === "ref") continue;
    if (foreignNamespace && !isEventProp(key) && key !== "dangerouslySetInnerHTML") continue;
    if (isFormStateProp(el, key)) continue;
    if (key === "className" || key === "class") {
      setElementClass(el, value);
    } else if (key === "style" && value != null) {
      // Initial mounts must enforce the same CSS URL policy as updates and SSR.
      setDomProp(el, key, value);
    } else if (key.startsWith("on") && typeof value === "function") {
      const { type, capture, id } = eventOf(key);
      el.addEventListener(type, value, capture);
      fiber.listeners.set(id, value);
    } else if (key === "dangerouslySetInnerHTML") {
      el.innerHTML = value.__html;
    } else if (value != null) {
      // Same rules as updates and server rendering: attribute names, event
      // names, URL schemes, srcdoc, and false only dropping real booleans.
      setDomProp(el, key, value);
    }
  }
  if (foreignNamespace) {
    for (const [key, value] of foreignPropEntries(props, foreignNamespace).values())
      setDomProp(el, key, value);
  }
}

function executeComponent(
  fiber: Fiber,
  component: Component,
  props: Props,
): VNode | null {
  const previous = activeComponentFiber;
  activeComponentFiber = fiber;
  try {
    const result = component(props);
    assertSyncClientComponentResult(result);
    return result;
  } finally {
    activeComponentFiber = previous;
  }
}

function bindRef(
  ref: unknown,
  element: Element,
  fiber: Fiber,
  owner: Fiber | null,
): void {
  if (ref == null) return;
  const current = boundRefs.get(fiber);
  if (current?.ref === ref && current.element === element) return;

  boundRefs.set(fiber, { ref, element });
  try {
    if (isBoundary(ref)) {
      attachBoundary(ref, element, fiber, (options) =>
        renderBoundary(ref, fiber, owner, options),
      );
    } else if (typeof ref === "function") {
      (ref as (node: Element | null) => void)(element);
    } else if (typeof ref === "object" && "current" in ref) {
      (ref as { current: Element | null }).current = element;
    }
  } catch (error) {
    try {
      releaseRef(ref, element, fiber);
    } catch (cleanupError) {
      recordCleanupError(cleanupError);
    }
    throw error;
  }
}

function releaseRef(ref: unknown, element: Element, fiber: Fiber): void {
  const bound = boundRefs.get(fiber);
  if (!bound || bound.ref !== ref || bound.element !== element) return;
  boundRefs.delete(fiber);

  if (isBoundary(ref)) {
    detachBoundary(ref, element, fiber);
  } else if (typeof ref === "function") {
    (ref as (node: Element | null) => void)(null);
  } else if (
    ref &&
    typeof ref === "object" &&
    "current" in ref &&
    (ref as { current: Element | null }).current === element
  ) {
    (ref as { current: Element | null }).current = null;
  }
}

function renderBoundary(
  boundary: Boundary<Element>,
  hostFiber: Fiber,
  ownerFiber: Fiber | null,
  options?: RenderOptions,
): boolean {
  const host = hostFiber.node;
  if (!isElementNode(host) || boundary.current !== host) {
    return false;
  }
  if (!ownerFiber) return false;
  const ownerVNode = ownerFiber.vnode;
  if (
    !ownerVNode ||
    typeof ownerVNode !== "object" ||
    !("type" in ownerVNode) ||
    typeof ownerVNode.type !== "function"
  ) {
    return false;
  }

  return runRenderTransaction(() => {
    const previousFibers = snapshotFibers(hostFiber.children);
    try {
      const result = executeComponent(
        ownerFiber,
        ownerVNode.type as Component,
        ownerVNode.props,
      );
      const nextHost = findBoundaryHost(result, boundary, ownerFiber);
      if (!nextHost) return false;
      const currentHost = hostFiber.vnode;
      if (
        !currentHost ||
        typeof currentHost !== "object" ||
        !("type" in currentHost) ||
        currentHost.type !== nextHost.type
      ) {
        return false;
      }

      const previous = _renderScopedReconciler;
      _renderScopedReconciler = options?.reconciler ?? null;
      try {
        diffChildren(
          hostFiber,
          host,
          hostFiber.children,
          normalizeChildren(nextHost.props.children),
        );
      } finally {
        _renderScopedReconciler = previous;
      }
      return true;
    } catch (error) {
      rollbackRenderTarget(hostFiber, host, previousFibers);
      throw error;
    }
  });
}

function findBoundaryHost(
  value: VNode | Child,
  boundary: Boundary<Element>,
  owner: Fiber,
): VNode | null {
  let match: VNode | null = null;

  const visit = (candidate: VNode | Child | Child[]): void => {
    if (Array.isArray(candidate)) {
      for (const child of candidate) visit(child);
      return;
    }
    if (!candidate || typeof candidate !== "object" || !("type" in candidate)) {
      return;
    }
    const vnode = candidate as VNode;
    if (
      typeof vnode.type === "string" &&
      vnode.props?.ref === boundary &&
      vnodeOwners.get(vnode) === owner
    ) {
      if (match && match !== vnode) {
        throw new Error(
          "[tradjs] A boundary can appear only once in its owning component.",
        );
      }
      match = vnode;
    }
    const children = vnode.props?.children;
    if (Array.isArray(children)) {
      visit(children);
    } else if (children !== undefined) {
      visit(children);
    }
  };

  visit(value);
  return match;
}

function rememberVNodeOwner(vnode: VNode): VNode {
  if (activeComponentFiber) vnodeOwners.set(vnode, activeComponentFiber);
  return vnode;
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

function getNextSibling(fiber: Fiber, parentNode: Node): Node | null {
  const nodes = collectNodes(fiber);
  if (nodes.length > 0) {
    const next = nodes[nodes.length - 1].nextSibling;
    if (next) return next;
  }
  return findPlacementAnchor(fiber, parentNode);
}

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
  return rememberVNodeOwner({
    type,
    props: normalizedProps,
    key: normalizedProps.key ?? null,
  });
}

export function jsx(type: any, props: any, key?: any): VNode {
  return rememberVNodeOwner({
    type,
    props: props || {},
    key: key ?? props?.key ?? null,
  });
}

export const jsxs = jsx;
export const jsxDEV = jsx;
