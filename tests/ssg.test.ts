import { describe, test, expect, beforeEach } from "bun:test";
import {
  getPrerendered,
  setPrerendered,
  clearSSGCache,
} from "../src/server/ssg";
describe("SSG Cache", () => {
  beforeEach(() => {
    clearSSGCache();
  });
  test("setPrerendered + getPrerendered stores and retrieves HTML", () => {
    setPrerendered("/pricing", "<h1>Pricing</h1>");
    const html = getPrerendered("/pricing");
    expect(html).toBe("<h1>Pricing</h1>");
  });
  test("getPrerendered returns null for uncached routes", () => {
    expect(getPrerendered("/nonexistent")).toBeNull();
  });
  test("clearSSGCache clears all routes", () => {
    setPrerendered("/a", "page-a");
    setPrerendered("/b", "page-b");
    setPrerendered("/c", "page-c");
    clearSSGCache();
    expect(getPrerendered("/a")).toBeNull();
    expect(getPrerendered("/b")).toBeNull();
    expect(getPrerendered("/c")).toBeNull();
  });
  test("setPrerendered overwrites existing cache", () => {
    setPrerendered("/page", "v1");
    expect(getPrerendered("/page")).toBe("v1");
    setPrerendered("/page", "v2");
    expect(getPrerendered("/page")).toBe("v2");
  });
  test("handles empty string HTML", () => {
    setPrerendered("/empty", "");
    const result = getPrerendered("/empty");
    expect(result).toBeDefined();
  });
});
