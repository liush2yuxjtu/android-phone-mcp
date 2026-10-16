import { describe, expect, it } from "vitest";
import { resolveKeyEvent } from "../src/adb/keys.js";

describe("resolveKeyEvent", () => {
  it("maps aliases and KEYCODE_ names", () => {
    expect(resolveKeyEvent("home")).toBe("KEYCODE_HOME");
    expect(resolveKeyEvent("BACK")).toBe("KEYCODE_BACK");
    expect(resolveKeyEvent("KEYCODE_ENTER")).toBe("KEYCODE_ENTER");
    expect(resolveKeyEvent("66")).toBe("66");
    expect(resolveKeyEvent("app-switch")).toBe("KEYCODE_APP_SWITCH");
  });

  it("rejects empty keys", () => {
    expect(() => resolveKeyEvent("  ")).toThrow(/required/);
  });
});
