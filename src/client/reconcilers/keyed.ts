/**
 * Keyed Reconciler — O(n log n) via key→fiber map + LIS
 *
 * Matches old and new children by `key` prop. Uses Longest Increasing
 * Subsequence to minimize DOM moves.
 *
 * This version hardens DOM insertion against stale anchors. Browsers throw
 * NotFoundError when parent.insertBefore(node, anchor) is called and `anchor`
 * is no longer a direct child of `parent`. High-churn keyed lists can hit that
 * path if a previous reconciliation step, cleanup, route swap, or third-party
 * DOM mutation detaches the anchor before the move pass completes.
 */

import type { Reconciler } from "./types";

type AnyFiber = any;

function isParentedBy(
  parentNode: Node,
  node: Node | null | undefined,
): node is Node {
  return !!node && node.parentNode === parentNode;
}

function firstParentedNode(parentNode: Node, nodes: Node[]): Node | null {
  return nodes.find((node) => isParentedBy(parentNode, node)) ?? null;
}

function allNodesParentedBy(parentNode: Node, nodes: Node[]): boolean {
  return (
    nodes.length > 0 && nodes.every((node) => node.parentNode === parentNode)
  );
}

function safeInsertBefore(
  parentNode: Node,
  node: Node,
  anchor: Node | null,
): void {
  const safeAnchor = isParentedBy(parentNode, anchor) ? anchor : null;

  // Avoid self-insertion and no-op moves. These are harmless in some DOMs but
  // can still produce surprising behavior with fragments/polyfilled DOMs.
  if (node === safeAnchor) return;
  if (node.parentNode === parentNode && node.nextSibling === safeAnchor) return;

  if (safeAnchor) parentNode.insertBefore(node, safeAnchor);
  else parentNode.appendChild(node);
}

function safeInsertNodesBefore(
  parentNode: Node,
  nodes: Node[],
  anchor: Node | null,
): Node | null {
  if (nodes.length === 0)
    return isParentedBy(parentNode, anchor) ? anchor : null;

  // Keep multi-node fragments in their natural order. Use the same validated
  // anchor for the group; insertBefore moves existing children automatically.
  for (const node of nodes) {
    safeInsertBefore(parentNode, node, anchor);
  }

  return firstParentedNode(parentNode, nodes);
}

export const keyedReconciler: Reconciler = (
  parentFiber,
  parentNode,
  oldFibers,
  newVNodes,
  ctx,
) => {
  // Build key → fiber map.
  const oldKeyMap = new Map<string | number, AnyFiber>();
  const oldIndexMap = new Map<AnyFiber, number>();

  for (let i = 0; i < oldFibers.length; i++) {
    const fiber = oldFibers[i] as AnyFiber;
    if (fiber.key != null) oldKeyMap.set(fiber.key, fiber);
    oldIndexMap.set(fiber, i);
  }

  const newFibers: AnyFiber[] = [];
  const usedOldFibers = new Set<AnyFiber>();
  const sources: number[] = [];

  // First pass: match by key and patch reusable fibers.
  for (let i = 0; i < newVNodes.length; i++) {
    const vnode = newVNodes[i];
    const key =
      vnode && typeof vnode === "object" && "key" in vnode
        ? (vnode as any).key
        : null;

    const oldFiber = key != null ? oldKeyMap.get(key) : undefined;

    if (oldFiber && !usedOldFibers.has(oldFiber)) {
      usedOldFibers.add(oldFiber);

      const patched = ctx.patchFiber(
        oldFiber,
        vnode!,
        parentFiber,
        parentNode,
      ) as AnyFiber | null;
      if (patched) {
        newFibers.push(patched);
        sources.push(oldIndexMap.get(oldFiber) ?? -1);
      }
    } else {
      // Mount new without appending. The second pass positions it.
      const mounted = ctx.mountVNode(vnode!, parentFiber) as AnyFiber | null;
      if (mounted) {
        newFibers.push(mounted);
        sources.push(-1);
      }
    }
  }

  // Remove old fibers not reused.
  for (const oldFiber of oldFibers as AnyFiber[]) {
    if (!usedOldFibers.has(oldFiber)) {
      ctx.removeFiber(oldFiber, parentNode);
    }
  }

  // Compute LIS over existing-source indexes so we only move nodes that need it.
  const oldIndicesOnly = sources.filter((source) => source !== -1);
  const lisIndices = longestIncreasingSubsequence(oldIndicesOnly);
  const lisValues = new Set(lisIndices.map((index) => oldIndicesOnly[index]));

  // Second pass: position nodes right-to-left. The carried anchor is always
  // revalidated immediately before insertion. If it went stale, we fall back
  // to append instead of letting DOM throw NotFoundError.
  let anchor: Node | null = null;

  for (let i = newFibers.length - 1; i >= 0; i--) {
    const fiber = newFibers[i];
    const nodes = ctx.collectNodes(fiber).filter(Boolean);
    if (nodes.length === 0) continue;

    const source = sources[i];
    const needsMove = source === -1 || !lisValues.has(source);
    const detached = !allNodesParentedBy(parentNode, nodes);

    if (needsMove || detached) {
      const first = safeInsertNodesBefore(parentNode, nodes, anchor);
      if (first) anchor = first;
    } else {
      const first = firstParentedNode(parentNode, nodes);
      if (first) anchor = first;
    }
  }

  parentFiber.children = newFibers;
};

/**
 * Returns indexes into `arr` that form the longest increasing subsequence.
 */
function longestIncreasingSubsequence(arr: number[]): number[] {
  if (arr.length === 0) return [];

  const predecessors = new Array<number>(arr.length).fill(-1);
  const tails: number[] = [];

  for (let i = 0; i < arr.length; i++) {
    let low = 0;
    let high = tails.length;

    while (low < high) {
      const mid = (low + high) >> 1;
      if (arr[tails[mid]] < arr[i]) low = mid + 1;
      else high = mid;
    }

    if (low > 0) predecessors[i] = tails[low - 1];
    tails[low] = i;
  }

  const result = new Array<number>(tails.length);
  let k = tails[tails.length - 1];

  for (let i = tails.length - 1; i >= 0; i--) {
    result[i] = k;
    k = predecessors[k];
  }

  return result;
}
