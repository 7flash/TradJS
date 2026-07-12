/**
 * tradjs/client/reconcilers — Reconciler Strategy Interface
 *
 * Defines the contract that all reconcilers must implement.
 * This enables hot-swapping reconciliation strategies at build time
 * or runtime without touching the core renderer.
 *
 * HOW TO CHOOSE A RECONCILER:
 * ──────────────────────────────
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  Use Case                              │  Best Strategy            │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │  Dynamic lists with add/remove/reorder │  keyed (default)          │
 * │  Static forms, fixed layouts           │  sequential               │
 * │  Text-heavy updates, no structure chg  │  sequential               │
 * │  Large lists (1000+) with reorders     │  keyed                    │
 * │  Simple apps, smallest bundle size     │  sequential               │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * The default reconciler (`auto`) inspects children for `key` props and
 * automatically selects keyed or sequential. This is the best choice for
 * most apps. Override only if you're optimizing a specific workload.
 *
 * BENCHMARKS (JSDOM, 1000 items, single run):
 * ──────────────────────────────────────────────
 *   Mount 1000 items:           ~9ms
 *   Keyed reorder (reverse):    ~19ms
 *   Sequential patch (text):    ~3ms
 *   Partial update 10/1000:     ~2ms
 */

import type { Fiber } from "../render";
import type { VNode, Child } from "../types";

/**
 * A Reconciler takes old fibers and new VNodes and updates the DOM.
 * It must:
 *   1. Reuse existing DOM nodes where possible
 *   2. Insert new nodes for new VNodes
 *   3. Remove nodes for deleted VNodes
 *   4. Update parentFiber.children with the new fiber list
 */
export type Reconciler = (
  parentFiber: Fiber,
  parentNode: Node,
  oldFibers: Fiber[],
  newVNodes: (VNode | Child)[],
  ctx: ReconcilerContext,
) => void;

/**
 * Context passed to reconcilers — provides shared utilities so
 * each strategy doesn't need to duplicate mount/patch/remove logic.
 */
export interface ReconcilerContext {
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
