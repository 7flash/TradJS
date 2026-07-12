/**
 * Sequential Reconciler — O(n) linear diff
 *
 * Patches children by index position. No key lookup, no LIS.
 * Best for: static layouts, forms, text-heavy updates.
 *
 * Trade-offs:
 *   ✅ Fastest for in-place updates (no map/set allocation)
 *   ✅ Smallest code size (~30 lines)
 *   ❌ Cannot detect reorders — treats moved items as type changes
 *   ❌ Recreates nodes when items shift positions
 */

import type { Reconciler } from "./types";

export const sequentialReconciler: Reconciler = (
  parentFiber,
  parentNode,
  oldFibers,
  newVNodes,
  ctx,
) => {
  const newFibers: any[] = [];

  // Snapshot old fibers — don't mutate during iteration
  const oldSnapshot = [...oldFibers];
  const maxLen = Math.max(oldSnapshot.length, newVNodes.length);

  for (let i = 0; i < maxLen; i++) {
    const oldFib = oldSnapshot[i];
    const newVNode = i < newVNodes.length ? newVNodes[i] : undefined;

    if (
      newVNode === undefined ||
      newVNode === null ||
      newVNode === false ||
      newVNode === true
    ) {
      // Remove old node
      if (oldFib) ctx.removeFiber(oldFib, parentNode);
      continue;
    }

    if (!oldFib) {
      // Append new node
      const fiber = ctx.mountVNode(newVNode, parentFiber, parentNode);
      if (fiber) newFibers.push(fiber);
      continue;
    }

    // Patch existing
    const patched = ctx.patchFiber(oldFib, newVNode, parentFiber, parentNode);
    if (patched) newFibers.push(patched);
  }

  parentFiber.children = newFibers;
};
