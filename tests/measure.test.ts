import { expect, test } from "bun:test";
import { buildMeasure, httpMeasure } from "../src/server/measure";

// The framework's measurement scopes (src/server/measure.ts) are plain
// measure-fn scopes. These tests pin the behaviour the router relies on.

test("a measured failure rethrows the original value", async () => {
  const cause = new Error("expected failure");
  let caught: unknown;
  try {
    await httpMeasure.measure("test failure", async () => {
      throw cause;
    });
  } catch (error) {
    caught = error;
  }
  expect(caught).toBe(cause);
});

test("a measured null result stays null", async () => {
  expect(await httpMeasure.measure("nullable result", async () => null)).toBeNull();
});

test("framework scopes nest and carry their scope names", async () => {
  const { configure, silent, logger } = await import("measure-fn");
  const events: any[] = [];
  configure({ silent: false, logger: (event: any) => events.push(event) });
  try {
    const result = await httpMeasure.measure("request", () =>
      buildMeasure.measure("compile", async () => 12),
    );
    expect(result).toBe(12);
    const starts = events.filter((event) => event.type === "start");
    expect(starts.map((event) => event.scope)).toEqual(["http", "build"]);
    expect(starts.map((event) => event.depth)).toEqual([0, 1]);
  } finally {
    configure({ silent, logger });
  }
});
