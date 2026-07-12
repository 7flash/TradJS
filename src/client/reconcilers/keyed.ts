/**
 * Keyed Reconciler — O(n log n) via key→fiber map + LIS
 *
 * Matches old and new children by `key` prop. Uses Longest Increasing
 * Subsequence to minimize DOM moves. This is the same algorithm used
 * by Inferno, Preact, and Solid.
 *
 * Trade-offs:
 *   ✅ Optimal for list mutations (insert, delete, reorder)
 *   ✅ Preserves DOM nodes across position changes
 *   ✅ Minimal DOM operations via LIS
 *   ❌ Higher overhead per diff (Map + Set + LIS computation)
 *   ❌ Requires unique keys on children
 */

import type { Reconciler } from "./types";

export const keyedReconciler: Reconciler = (
  parentFiber,
  parentNode,
  oldFibers,
  newVNodes,
  ctx,
) => {
  // Build key → fiber map
  const oldKeyMap = new Map<string | number, any>();
  const oldIndexMap = new Map<any, number>();
  for (let i = 0; i < oldFibers.length; i++) {
    const f = oldFibers[i];
    if (f.key != null) oldKeyMap.set(f.key, f);
    oldIndexMap.set(f, i);
  }

  const newFibers: any[] = [];
  const usedOldFibers = new Set<any>();
  const sources: number[] = [];

  // First pass: match by key, patch reusable fibers
  for (let i = 0; i < newVNodes.length; i++) {
    const v = newVNodes[i];
    const key =
      v && typeof v === "object" && "key" in v ? (v as any).key : null;

    let oldFib: any | undefined;
    if (key != null) oldFib = oldKeyMap.get(key);

    if (oldFib && !usedOldFibers.has(oldFib)) {
      usedOldFibers.add(oldFib);
      const patched = ctx.patchFiber(oldFib, v!, parentFiber, parentNode);
      newFibers.push(patched!);
      sources.push(oldIndexMap.get(oldFib)!);
    } else {
      // Mount new — but don't append to DOM yet, we'll position in second pass
      const fiber = ctx.mountVNode(v!, parentFiber);
      if (fiber) {
        newFibers.push(fiber);
        sources.push(-1);
      }
    }
  }

  // Remove old fibers not reused
  for (const oldFib of oldFibers) {
    if (!usedOldFibers.has(oldFib)) {
      ctx.removeFiber(oldFib, parentNode);
    }
  }

  // Compute LIS to minimize moves
  const oldIndicesOnly = sources.filter((s) => s !== -1);
  const lisIndices = longestIncreasingSubsequence(oldIndicesOnly);
  const lisValues = new Set(lisIndices.map((i) => oldIndicesOnly[i]));

  // Second pass: position all nodes correctly (right to left)
  let anchor: Node | null = null;
  for (let i = newFibers.length - 1; i >= 0; i--) {
    const fiber = newFibers[i];
    const needsMove = sources[i] === -1 || !lisValues.has(sources[i]);

    if (needsMove) {
      const nodes = ctx.collectNodes(fiber);
      if (nodes.length === 0) continue;
      for (const node of nodes) {
        if (anchor) {
          parentNode.insertBefore(node, anchor);
        } else {
          parentNode.appendChild(node);
        }
      }
      anchor = nodes[0];
    } else {
      // Non-moving item — just get the first node for anchor without full traversal
      const node = fiber.node;
      if (node) {
        anchor = node;
      } else if (fiber.children.length > 0) {
        // Component/fragment fiber — find first child's node
        const nodes = ctx.collectNodes(fiber);
        if (nodes.length > 0) anchor = nodes[0];
      }
    }
  }

  parentFiber.children = newFibers;
};

/**
 * Longest Increasing Subsequence — O(n log n)
 *
 * Returns indices of elements forming the LIS. Nodes at these positions
 * are already in correct relative order and don't need DOM moves.
 *
 * Algorithm: Patience sorting + backtracking.
 */
function longestIncreasingSubsequence(arr: number[]): number[] {
  if (arr.length === 0) return [];

  const n = arr.length;
  const tails: number[] = [];
  const indices: number[] = [];
  const predecessors: number[] = new Array(n).fill(-1);

  for (let i = 0; i < n; i++) {
    let lo = 0,
      hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < arr[i]) lo = mid + 1;
      else hi = mid;
    }

    tails[lo] = arr[i];
    indices[lo] = i;
    if (lo > 0) predecessors[i] = indices[lo - 1];
  }

  const result: number[] = [];
  let k = indices[tails.length - 1];
  for (let i = tails.length - 1; i >= 0; i--) {
    result[i] = k;
    k = predecessors[k];
  }

  return result;
}
