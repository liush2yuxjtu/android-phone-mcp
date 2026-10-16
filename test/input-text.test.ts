import { describe, expect, it } from "vitest";
import { encodeAdbInput, isAdbInputSafe, planTypeMethod } from "../src/adb/input-text.js";

describe("adb input text", () => {
  it("encodes spaces as %s", () => {
    expect(encodeAdbInput("hello world")).toBe("hello%sworld");
  });

  it("routes unicode through clipboard", () => {
    expect(isAdbInputSafe("hello")).toBe(true);
    expect(isAdbInputSafe("你好")).toBe(false);
    expect(planTypeMethod("")).toBe("empty");
    expect(planTypeMethod("ok")).toBe("input");
    expect(planTypeMethod("x".repeat(90))).toBe("chunked");
    expect(planTypeMethod("café")).toBe("clipboard");
  });
});
