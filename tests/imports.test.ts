import { describe, expect, test } from "bun:test";
import { imports } from "../src/server/imports";

describe("imports", () => {
  test("preserves the full base name for scoped package subpaths", async () => {
    const map = await imports(
      ["@scope/pkg/subpath"],
      { dependencies: { "@scope/pkg": "^1.2.3" } },
      {},
    );

    expect(map.imports["@scope/pkg/subpath"]).toContain(
      "https://esm.sh/@scope/pkg@1.2.3/subpath",
    );
    expect(map.imports["@scope/pkg/subpath"]).not.toContain("@scope@1.2.3");
    expect(map.imports["@scope/pkg/"]).toBe("https://esm.sh/@scope/pkg@1.2.3/");
  });

  test("returns an empty map when dependencies are intentionally disabled", async () => {
    expect(await imports([], null)).toEqual({ imports: {} });
  });
});
