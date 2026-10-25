import { describe, expect, test } from "bun:test";
import {
  hasActiveMeasurement,
  measureRequired,
  measures,
} from "../src/server/measure";
describe("measurement policy", () => {
  test("required measurements preserve the original thrown value", async () => {
    const cause = new Error("expected failure");
    try {
      await measureRequired(measures.route, "test failure", async () => {
        throw cause;
      });
      throw new Error("measureRequired unexpectedly resolved");
    } catch (error) {
      expect(error).toBe(cause);
    }
  });
  test("required measurements allow a successful null result", async () => {
    const result = await measureRequired(
      measures.route,
      "nullable result",
      async () => null,
    );
    expect(result).toBeNull();
  });
  test("nested framework measurements inherit an active trace context", async () => {
    expect(hasActiveMeasurement()).toBe(false);
    const result = await measureRequired(
      measures.http,
      "outer operation",
      async () => {
        expect(hasActiveMeasurement()).toBe(true);
        return measureRequired(measures.build, "inner operation", async () => {
          expect(hasActiveMeasurement()).toBe(true);
          return 42;
        });
      },
    );
    expect(result).toBe(42);
    expect(hasActiveMeasurement()).toBe(false);
  });
});
test("measure-fn 4 receives labels, subsystem scopes, and explicit summaries", async () => {
  const { configure, silent, logger } = await import("measure-fn");
  const events: any[] = [];
  configure({ silent: false, logger: (event) => events.push(event) });
  try {
    await measureRequired(measures.http, { label: "request" }, () =>
      measureRequired(
        measures.build,
        { label: "compile", result: (value: number) => ({ bytes: value }) },
        async () => 12,
      ),
    );
    const starts = events.filter((event) => event.type === "start");
    expect(starts.map((event) => event.scope)).toEqual(["http", "build"]);
    expect(starts.map((event) => event.depth)).toEqual([0, 1]);
    expect(starts[1].label).toContain("compile");
    const success = events.find(
      (event) => event.type === "success" && event.scope === "build",
    );
    expect(success.result).toEqual({ bytes: 12 });
  } finally {
    configure({ silent, logger });
  }
});
