const NOT_FOUND = Symbol.for("tradjs.notFound");

/** Thrown by notFound(); the router answers 404 instead of 500. */
export class NotFoundSignal extends Error {
  readonly [NOT_FOUND] = true;
  constructor() {
    super("Not Found");
    this.name = "NotFoundSignal";
  }
}

/** Call from a page, layout or server component to answer 404. */
export function notFound(): never {
  throw new NotFoundSignal();
}

/** True for a notFound() signal, also from another copy of the package. */
export function isNotFound(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    (error as Record<symbol, unknown>)[NOT_FOUND] === true
  );
}
