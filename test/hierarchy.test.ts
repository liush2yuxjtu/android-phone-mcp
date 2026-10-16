import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatCompactScreen, parseUiHierarchy } from "../src/ui/hierarchy.js";

const xml = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures/window_dump.xml"),
  "utf8",
);

describe("parseUiHierarchy", () => {
  it("keeps interactive and labeled nodes, skips zero-size", () => {
    const dump = parseUiHierarchy(xml);
    expect(dump.rotation).toBe(0);
    expect(dump.elements.map((el) => el.contentDesc || el.text)).toEqual([
      "Search",
      "Play Store",
      "Phone",
    ]);
    expect(dump.elements[0]?.className).toContain("EditText");
    expect(dump.elements[1]?.clickable).toBe(true);
    expect(dump.elements[1]?.center).toEqual({ x: 162, y: 1797 });
  });

  it("formats a compact numbered list", () => {
    const dump = parseUiHierarchy(xml);
    const compact = formatCompactScreen({
      serial: "emulator-5554",
      model: "sdk",
      androidVersion: "14",
      width: 1080,
      height: 2400,
      rotation: 0,
      focused: "launcher",
      elements: dump.elements,
    });
    expect(compact).toContain("emulator-5554 · sdk · Android 14 · 1080x2400");
    expect(compact).toContain('[0] CLICK EditText desc="Search"');
    expect(compact).toContain('[1] CLICK/LONG TextView text="Play Store"');
  });
});
