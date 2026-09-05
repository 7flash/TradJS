import { describe, expect, test } from "bun:test";
import { parseBuildArgs } from "../src/server/cli-build";

describe("parseBuildArgs", () => {
  test("parses repeated entries and paths", () => {
    expect(
      parseBuildArgs([
        "--entry",
        "src/a.ts",
        "--entry",
        "src/b.tsx",
        "--outdir",
        "out",
      ]),
    ).toEqual({ entries: ["src/a.ts", "src/b.tsx"], outDir: "out" });
  });

  test("rejects missing values and unknown flags", () => {
    expect(() => parseBuildArgs(["--entry"])).toThrow(
      "Missing value for --entry",
    );
    expect(() => parseBuildArgs(["--wat"])).toThrow(
      "Unknown build option: --wat",
    );
  });
});
