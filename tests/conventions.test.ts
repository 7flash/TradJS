import { describe, expect, test } from "bun:test";
import {
  clientCompanionPath,
  styleCompanionPath,
} from "../src/server/conventions";

describe("source convention helpers", () => {
  for (const extension of ["ts", "tsx", "js", "jsx"]) {
    test(`supports .${extension} convention files`, () => {
      const file = `/app/account/page.${extension}`;
      expect(clientCompanionPath(file)).toBe("/app/account/page.client.tsx");
      expect(styleCompanionPath(file)).toBe("/app/account/page.css");
    });
  }

  test("rejects non-source paths instead of silently returning a bad companion", () => {
    expect(() => clientCompanionPath("/app/page.md")).toThrow(
      "Expected a JS/TS source file",
    );
  });
});
