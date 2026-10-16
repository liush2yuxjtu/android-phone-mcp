import { describe, expect, it } from "vitest";
import { parseUiHierarchy } from "../src/ui/hierarchy.js";
import { selectElement } from "../src/ui/select.js";
import { WINDOW_DUMP } from "./helpers/fake-adb.js";

describe("selectElement", () => {
  const elements = parseUiHierarchy(WINDOW_DUMP.toString("utf8")).elements;

  it("selects by index", () => {
    expect(selectElement(elements, { index: 1 }).text).toBe("Play Store");
  });

  it("selects by text and prefers clickable matches", () => {
    expect(selectElement(elements, { text: "Phone" }).index).toBe(2);
  });

  it("matches short resource ids", () => {
    expect(selectElement(elements, { resourceId: "search_edit_frame" }).contentDesc).toBe(
      "Search",
    );
  });

  it("throws when missing", () => {
    expect(() => selectElement(elements, { text: "Not there" })).toThrow(/No element matched/);
  });
});
