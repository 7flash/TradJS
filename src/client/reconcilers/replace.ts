import type { Reconciler } from "./types";
export const replaceReconciler: Reconciler = (
  parentFiber,
  parentNode,
  oldFibers,
  newVNodes,
  ctx,
) => {
  for (const oldFib of oldFibers) {
    ctx.removeFiber(oldFib, parentNode);
  }
  const newFibers: any[] = [];
  for (const v of newVNodes) {
    const fiber = ctx.mountVNode(v, parentFiber);
    if (fiber) {
      for (const node of ctx.collectNodes(fiber)) {
        parentNode.insertBefore(
          node,
          ctx.endAnchor?.parentNode === parentNode ? ctx.endAnchor : null,
        );
      }
      newFibers.push(fiber);
    }
  }
  parentFiber.children = newFibers;
};
