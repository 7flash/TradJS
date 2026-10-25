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
  for (let i = 0; i < newVNodes.length; i++) {
    const vnode = newVNodes[i];
    const key =
      vnode && typeof vnode === "object" && "key" in vnode
        ? (vnode as any).key
        : null;
    const positional = oldFibers[i];
    const oldFiber =
      key != null
        ? oldKeyMap.get(key)
        : positional?.key == null
          ? positional
          : undefined;
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
      const mounted = ctx.mountVNode(vnode!, parentFiber) as AnyFiber | null;
      if (mounted) {
        newFibers.push(mounted);
        sources.push(-1);
      }
    }
  }
  for (const oldFiber of oldFibers as AnyFiber[]) {
    if (!usedOldFibers.has(oldFiber)) {
      ctx.removeFiber(oldFiber, parentNode);
    }
  }
  const oldIndicesOnly = sources.filter((source) => source !== -1);
  const lisIndices = longestIncreasingSubsequence(oldIndicesOnly);
  const lisValues = new Set(lisIndices.map((index) => oldIndicesOnly[index]));
  let anchor: Node | null = ctx.endAnchor ?? null;
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
