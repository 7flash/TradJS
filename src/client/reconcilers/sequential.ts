import type { Reconciler } from "./types";
export const sequentialReconciler: Reconciler = (
  parentFiber,
  parentNode,
  oldFibers,
  newVNodes,
  ctx,
) => {
  const newFibers: any[] = [];
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
      if (oldFib) ctx.removeFiber(oldFib, parentNode);
      continue;
    }
    if (!oldFib) {
      const fiber = ctx.mountVNode(newVNode, parentFiber);
      if (fiber) {
        for (const node of ctx.collectNodes(fiber)) {
          parentNode.insertBefore(
            node,
            ctx.endAnchor?.parentNode === parentNode ? ctx.endAnchor : null,
          );
        }
        newFibers.push(fiber);
      }
      continue;
    }
    const patched = ctx.patchFiber(oldFib, newVNode, parentFiber, parentNode);
    if (patched) newFibers.push(patched);
  }
  parentFiber.children = newFibers;
};
