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
  setElementClass,
} from "./dom";

export interface Fiber {
  node: Node | null;
  vnode: VNode | Child;
  parent: Fiber | null;
  children: Fiber[];
  listeners: Map<string, EventListener>;
  key: string | number | null;
}

const rootFibers = new WeakMap<HTMLElement, Fiber>();
const vnodeOwners = new WeakMap<VNode, Fiber>();
let activeComponentFiber: Fiber | null = null;
let renderInProgress = false;
let _renderScopedReconciler: ReconcilerName | Reconciler | null = null;

export interface RenderOptions {
  reconciler?: ReconcilerName | Reconciler;
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
    "[tradjs] Client render() does not support async components. Await async work in a controller/action, update state, then repaint the affected render boundary.",
  );
}

function runRenderTransaction<T>(work: () => T): T {
  if (renderInProgress) {
    throw new Error("[tradjs] Cannot render during another render.");
  }
  renderInProgress = true;
  try {
    return work();
  } finally {
    renderInProgress = false;
  }
}

export function render(
  vnode: VNode | null,
  container: HTMLElement,
  options?: RenderOptions,
): Fiber {
  return runRenderTransaction(() => {
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
  });
}

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
    if (fiber.node instanceof Element || fiber.node instanceof Text) {
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
  const logicalParent = parentFiber.node === null;
  const oldLogicalNodes = logicalParent ? collectNodes(parentFiber) : [];
  const needsPlacement =
    logicalParent &&
    (oldLogicalNodes.length === 0 ||
      typeof effective === "function" ||
      effective === "replace" ||
      hasKeys);
  const placementAnchor = needsPlacement
    ? findPlacementAnchor(parentFiber, parentNode)
    : null;

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

  if (needsPlacement) {
    placeLogicalFiber(parentFiber, parentNode, placementAnchor);
  }
}

function patchProps(
  el: Element,
  oldProps: Props,
  newProps: Props,
  fiber: Fiber,
): void {
  const safeOldProps = oldProps || {};
  const safeNewProps = newProps || {};
  for (const key of Object.keys(safeOldProps)) {
    if (key === "children" || key === "key" || key === "ref") continue;
    if (key in safeNewProps) continue;
    if (key.startsWith("on") && typeof safeOldProps[key] === "function") {
      const event = key.slice(2).toLowerCase();
      const oldListener = fiber.listeners.get(event);
      if (oldListener) {
        el.removeEventListener(event, oldListener);
        fiber.listeners.delete(event);
      }
    } else if (isFormStateProp(el, key)) {
      setDomProp(el, key, null);
    } else if (key === "className" || key === "class") {
      setElementClass(el, "");
    } else if (key === "style") {
      el.removeAttribute("style");
    } else {
      el.removeAttribute(domAttributeName(el, key));
    }
  }

  for (const [key, value] of Object.entries(safeNewProps)) {
    if (key === "children" || key === "key" || key === "ref") continue;
    if (isFormStateProp(el, key)) continue;
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
    if (oldFiber.node instanceof Text) {
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
    if (el instanceof Element) {
      if (oldVNode.props.ref !== newVNode.props.ref) {
        releaseRef(oldVNode.props.ref, el, oldFiber);
      }
      patchProps(el, oldVNode.props, newVNode.props, oldFiber);
      const newChildVNodes = normalizeChildren(newVNode.props.children);
      diffChildren(oldFiber, el, oldFiber.children, newChildVNodes);
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

  if (typeof vnode === "string" || typeof vnode === "number") {
    const fiber = createFiber(vnode, parentFiber);
    fiber.node = document.createTextNode(String(vnode));
    if (parentNode) parentNode.appendChild(fiber.node);
    return fiber;
  }

  const { type, props: rawProps } = vnode;
  const props = rawProps || {};

  if (type === Fragment) {
    const fiber = createFiber(vnode, parentFiber);
    const children = normalizeChildren(props.children);
    for (const child of children) {
      const childFiber = mountVNode(child, fiber, parentNode);
      if (childFiber) fiber.children.push(childFiber);
    }
    return fiber;
  }

  if (typeof type === "function") {
    const fiber = createFiber(vnode, parentFiber);
    const result = executeComponent(fiber, type as Component, props);
    const children = flattenChildren([result]);
    for (const child of children) {
      const childFiber = mountVNode(child, fiber, parentNode);
      if (childFiber) fiber.children.push(childFiber);
    }
    return fiber;
  }

  const el = createDomElement(type as string, parentNode);
  const fiber = createFiber(vnode, parentFiber);
  fiber.node = el;

  applyProps(el, props, fiber);

  const children = normalizeChildren(props.children);
  for (const child of children) {
    const childFiber = mountVNode(child, fiber, el);
    if (childFiber) fiber.children.push(childFiber);
  }
  syncFormState(el, props);
  if (parentNode) parentNode.appendChild(el);
  bindRef(props.ref, el, fiber, vnodeOwners.get(vnode) ?? null);

  return fiber;
}

function removeFiber(fiber: Fiber, parentNode: Node): void {
  const nodes = collectNodes(fiber);
  for (const node of nodes) {
    if (node.parentNode) node.parentNode.removeChild(node);
  }
  cleanupFiber(fiber);
}

function cleanupFiber(fiber: Fiber): void {
  if (fiber.node instanceof Element) {
    const vnode = fiber.vnode;
    if (vnode && typeof vnode === "object" && "type" in vnode) {
      releaseRef(vnode.props?.ref, fiber.node, fiber);
    }
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

// Reapply controlled state even when vnode props are unchanged: user input can
// change live properties independently. Select values require mounted options.
function syncFormState(el: Element, props: Props): void {
  for (const [key, value] of Object.entries(props || {})) {
    if (isFormStateProp(el, key)) setDomProp(el, key, value);
  }
}

function applyProps(el: Element, props: Props, fiber: Fiber): void {
  if (!props) return;
  for (const [key, value] of Object.entries(props)) {
    if (key === "children" || key === "key" || key === "ref") continue;
    if (isFormStateProp(el, key)) continue;
    if (key === "className" || key === "class") {
      setElementClass(el, value);
    } else if (key === "style" && typeof value === "object") {
      assignElementStyle(el, value);
    } else if (key.startsWith("on") && typeof value === "function") {
      const event = key.slice(2).toLowerCase();
      el.addEventListener(event, value);
      fiber.listeners.set(event, value);
    } else if (key === "dangerouslySetInnerHTML") {
      el.innerHTML = value.__html;
    } else if (typeof value === "boolean") {
      if (value) el.setAttribute(domAttributeName(el, key), "");
    } else if (value != null) {
      el.setAttribute(domAttributeName(el, key), String(value));
    }
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
  if (isBoundary(ref)) {
    attachBoundary(ref, element, fiber, (options) =>
      renderBoundary(ref, fiber, owner, options),
    );
    return;
  }
  if (ref && typeof ref === "object" && "current" in ref) {
    (ref as { current: Element | null }).current = element;
  }
}

function releaseRef(ref: unknown, element: Element, fiber: Fiber): void {
  if (isBoundary(ref)) {
    detachBoundary(ref, element, fiber);
    return;
  }
  if (
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
  if (!(host instanceof Element) || boundary.current !== host) {
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
