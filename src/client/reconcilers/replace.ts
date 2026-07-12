/**
 * Replace Reconciler — O(1) nuke and rebuild
 *
 * Removes all old children and mounts new ones from scratch.
 * No diffing, no patching, no key lookups.
 *
 * Trade-offs:
 *   ✅ Simplest possible implementation (~10 lines)
 *   ✅ Zero overhead per diff — no maps, sets, or comparisons
 *   ✅ Guaranteed correct — no stale state from reused nodes
 *   ❌ Destroys all DOM state (focus, scroll, animations, selections)
 *   ❌ Worst performance for partial updates (re-creates everything)
 *
 * Best for: One-shot renders, notification toasts, widgets where DOM state
 * doesn't matter, or when you want guaranteed-fresh DOM.
 */

import type { Reconciler } from "./types";

export const replaceReconciler: Reconciler = (
  parentFiber,
  parentNode,
  oldFibers,
  newVNodes,
  ctx,
) => {
  // Remove all old children
  for (const oldFib of oldFibers) {
    ctx.removeFiber(oldFib, parentNode);
  }

  // Mount all new children
  const newFibers: any[] = [];
  for (const v of newVNodes) {
    const fiber = ctx.mountVNode(v, parentFiber, parentNode);
    if (fiber) newFibers.push(fiber);
  }

  parentFiber.children = newFibers;
};
