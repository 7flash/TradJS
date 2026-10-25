import type { Fiber } from "../render";
import type { VNode, Child } from "../types";
export type Reconciler = (
  parentFiber: Fiber,
  parentNode: Node,
  oldFibers: Fiber[],
  newVNodes: (VNode | Child)[],
  ctx: ReconcilerContext,
) => void;
export interface ReconcilerContext {
  endAnchor?: Node | null;
  mountVNode: (
    vnode: VNode | Child,
    parentFiber: Fiber,
    parentNode?: Node,
  ) => Fiber | null;
  patchFiber: (
    oldFiber: Fiber,
    newVNode: VNode | Child,
    parentFiber: Fiber,
    parentNode: Node,
  ) => Fiber | null;
  removeFiber: (fiber: Fiber, parentNode: Node) => void;
  collectNodes: (fiber: Fiber) => Node[];
}
export type ReconcilerName = "auto" | "keyed" | "sequential" | "replace";
