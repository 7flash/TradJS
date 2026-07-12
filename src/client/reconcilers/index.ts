/**
 * tradjs/client/reconcilers — Pluggable Reconciliation Strategies
 *
 * Available strategies:
 *   - `sequentialReconciler` — O(n) index-based (forms, static layouts)
 *   - `keyedReconciler`      — O(n log n) key+LIS  (dynamic lists, reorders)
 *   - `autoReconciler`       — Auto-selects based on key presence (default)
 *
 * Usage:
 *   import { setReconciler, keyedReconciler } from 'tradjs/client/reconcilers';
 *   setReconciler(keyedReconciler); // force keyed for all diffs
 */

export type { Reconciler, ReconcilerContext, ReconcilerName } from "./types";
export { sequentialReconciler } from "./sequential";
export { keyedReconciler } from "./keyed";
export { replaceReconciler } from "./replace";
