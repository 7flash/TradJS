import { AsyncLocalStorage } from "node:async_hooks";
import {
  createMeasure,
  type MeasureAction,
  type MeasureFn,
  type MeasureSyncFn,
} from "measure-fn";

/**
 * Central measurement policy for the server runtime.
 *
 * The important rule is that a framework operation creates a root measurement
 * only when no measurement is already active. Calls made inside that operation
 * automatically reuse the child `m`/`ms` functions supplied by measure-fn, so
 * request/build/SSG work appears as one hierarchical trace instead of a series
 * of unrelated root timings.
 *
 * measure-fn uses `null` as its safe error sentinel. Framework-internal work is
 * normally fail-fast, and some valid functions can themselves return `null`, so
 * required measurements use a private success/error envelope rather than
 * `.assert()`. This preserves the original thrown value exactly and avoids
 * conflating a successful `null` result with failure.
 */
const DEFAULT_RESULT_LIMIT = 200;

function createServerMeasure(scope: string) {
  return createMeasure(scope);
}

export const measures = {
  http: createServerMeasure("http"),
  build: createServerMeasure("build"),
  cliBuild: createServerMeasure("cli:build"),
  route: createServerMeasure("route"),
  imports: createServerMeasure("imports"),
  ssg: createServerMeasure("ssg"),
} as const;

// Named exports preserve the existing internal API while keeping scope creation
// in one place.
export const httpMeasure = measures.http;
export const buildMeasure = measures.build;
export const cliBuildMeasure = measures.cliBuild;
export const routeMeasure = measures.route;
export const importMapMeasure = measures.imports;
export const ssgMeasure = measures.ssg;

export type ServerMeasureScope = ReturnType<typeof createMeasure>;
export type ServerMeasureAction<T = unknown> = MeasureAction<T>;

type RequiredOutcome<T> =
  { ok: true; value: T } | { ok: false; error: unknown };

interface ActiveMeasureContext {
  measure?: MeasureFn;
  measureSync?: MeasureSyncFn;
}

const activeMeasure = new AsyncLocalStorage<ActiveMeasureContext>();

/**
 * Runtime-compatible overload used by measure-fn internally. Its public type
 * declarations split "nested callback" and "onError" into separate overloads,
 * while the implementation supports both at once. Keeping the cast here avoids
 * leaking that library typing detail through the rest of the framework.
 */
type NestedAsyncRunner = <T>(
  action: MeasureAction<T>,
  fn: (measure: MeasureFn, measureSync: MeasureSyncFn) => Promise<T>,
  onError?: (error: unknown) => T | null | Promise<T | null>,
) => Promise<T | null>;

type NestedSyncRunner = <T>(
  action: MeasureAction<T>,
  fn: (measureSync: MeasureSyncFn) => T,
  onError?: (error: unknown) => T | null,
) => T | null;

function actionLabel<T>(action: MeasureAction<T>): string {
  return typeof action === "string" ? action : action.label;
}

/**
 * Required operations are measured as an internal envelope so measure-fn can
 * keep its `null` error sentinel without changing the operation's own return
 * domain. The result mapper unwraps the envelope before anything is logged.
 */
function requiredAction<T>(
  action: ServerMeasureAction<T>,
): MeasureAction<RequiredOutcome<T>> {
  if (typeof action === "string") {
    return {
      label: action,
      maxResultLength: DEFAULT_RESULT_LIMIT,
      result: (outcome: RequiredOutcome<T>) =>
        outcome.ok ? outcome.value : undefined,
    };
  }

  const mapResult = action.result;

  return {
    ...action,
    maxResultLength: action.maxResultLength ?? DEFAULT_RESULT_LIMIT,
    result: (outcome: RequiredOutcome<T>) => {
      if (!outcome.ok) return undefined;
      return mapResult ? mapResult(outcome.value) : outcome.value;
    },
  } as MeasureAction<RequiredOutcome<T>>;
}

function missingOutcomeError<T>(action: ServerMeasureAction<T>): Error {
  return new Error(
    `[tradjs] Measurement "${actionLabel(action)}" returned no outcome`,
  );
}

async function runRequired<T>(
  runner: MeasureFn,
  action: ServerMeasureAction<T>,
  fn: () => Promise<T>,
): Promise<T> {
  const outcome = await (runner as NestedAsyncRunner)<RequiredOutcome<T>>(
    requiredAction(action),
    async (measure, measureSync) => {
      const value = await activeMeasure.run({ measure, measureSync }, fn);
      return { ok: true, value };
    },
    (error) => ({ ok: false, error }),
  );

  if (outcome === null) throw missingOutcomeError(action);
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}

function runRequiredSync<T>(
  runner: MeasureSyncFn,
  action: ServerMeasureAction<T>,
  fn: () => T,
): T {
  const parent = activeMeasure.getStore();
  const outcome = (runner as NestedSyncRunner)<RequiredOutcome<T>>(
    requiredAction(action),
    (measureSync) => {
      const value = activeMeasure.run(
        { measure: parent?.measure, measureSync },
        fn,
      );
      return { ok: true, value };
    },
    (error) => ({ ok: false, error }),
  );

  if (outcome === null) throw missingOutcomeError(action);
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}

/**
 * Measure async work that must succeed. If another measurement is active, this
 * becomes a child span automatically; otherwise `scope` supplies the root.
 */
export function measureRequired<T>(
  scope: ServerMeasureScope,
  action: ServerMeasureAction<T>,
  fn: () => Promise<T>,
): Promise<T> {
  const current = activeMeasure.getStore()?.measure;
  return runRequired(current ?? scope.measure, action, fn);
}

/**
 * Synchronous counterpart to `measureRequired()` with the same auto-nesting
 * semantics and original-error preservation.
 */
export function measureRequiredSync<T>(
  scope: ServerMeasureScope,
  action: ServerMeasureAction<T>,
  fn: () => T,
): T {
  const current = activeMeasure.getStore()?.measureSync;
  return runRequiredSync(current ?? scope.measureSync, action, fn);
}

/**
 * Emit an annotation in the current trace when one exists, otherwise on the
 * supplied scope. Useful for state transitions that do not need a duration.
 */
export async function measureNote(
  scope: ServerMeasureScope,
  action: ServerMeasureAction,
): Promise<void> {
  const runner = activeMeasure.getStore()?.measure ?? scope.measure;
  await runner(action);
}

/** Exposed for focused tests and diagnostics, not for application state. */
export function hasActiveMeasurement(): boolean {
  return activeMeasure.getStore() !== undefined;
}
