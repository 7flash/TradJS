/** Small, dependency-free helpers for handling `unknown` errors safely. */

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function errorStack(error: unknown): string {
  return error instanceof Error
    ? (error.stack ?? error.message)
    : String(error);
}

export function serializeError(error: unknown): string {
  const seen = new WeakSet<object>();

  try {
    return (
      JSON.stringify(
        error,
        (_key, value) => {
          if (typeof value === "bigint") return `${value}n`;
          if (typeof value === "symbol") return String(value);
          if (typeof value === "function") {
            return `[Function ${value.name || "anonymous"}]`;
          }

          if (value instanceof Error) {
            if (seen.has(value)) return "[Circular Error]";
            seen.add(value);
            return {
              ...value,
              name: value.name,
              message: value.message,
              stack: value.stack,
              cause: value.cause,
            };
          }

          if (typeof value === "object" && value !== null) {
            if (seen.has(value)) return "[Circular]";
            seen.add(value);
          }

          return value;
        },
        2,
      ) ?? String(error)
    );
  } catch {
    return errorMessage(error);
  }
}
