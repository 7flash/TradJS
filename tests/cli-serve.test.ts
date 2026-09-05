import { describe, expect, test } from "bun:test";
import { parseServeArgs } from "../src/server/cli-serve";

describe("parseServeArgs", () => {
  test("parses app directory and port", () => {
    expect(parseServeArgs(["--appdir", "site", "3456"])).toEqual({
      appDir: "site",
      port: 3456,
      handleSignals: true,
    });
  });

  test("parses unix sockets", () => {
    expect(parseServeArgs(["--unix", "/tmp/tradjs.sock"])).toEqual({
      unix: "/tmp/tradjs.sock",
      handleSignals: true,
    });
  });

  test("rejects malformed or conflicting arguments", () => {
    expect(() => parseServeArgs(["--appdir"])).toThrow(
      "Missing value for --appdir",
    );
    expect(() => parseServeArgs(["--unknown"])).toThrow("Unknown serve option");
    expect(() => parseServeArgs(["3000", "--unix", "/tmp/app.sock"])).toThrow(
      "Cannot combine",
    );
    expect(() => parseServeArgs(["99999"])).toThrow("Invalid port");
  });
});
