import { describe, expect, it } from "vitest";
import {
  DEFAULT_APPEARANCE,
  EdgeAnimationMode,
  isCssColor,
  isEdgeAnimated,
  mergeAppearance,
} from "../src/index";

describe("mergeAppearance", () => {
  it("returns defaults for non-object input", () => {
    expect(mergeAppearance(undefined)).toEqual(DEFAULT_APPEARANCE);
    expect(mergeAppearance("nope")).toEqual(DEFAULT_APPEARANCE);
    expect(mergeAppearance([1, 2])).toEqual(DEFAULT_APPEARANCE);
  });

  it("applies valid overrides and keeps sibling defaults", () => {
    const a = mergeAppearance({
      edgeLabel: { backgroundColor: "rgba(0, 0, 0, 0.5)", backgroundOpacity: 0.4 },
    });
    expect(a.edgeLabel.backgroundColor).toBe("rgba(0, 0, 0, 0.5)");
    expect(a.edgeLabel.backgroundOpacity).toBe(0.4);
    expect(a.edgeLabel.textColor).toBe(DEFAULT_APPEARANCE.edgeLabel.textColor);
  });

  it("drops invalid values and falls back to defaults", () => {
    const a = mergeAppearance({
      edgeLabel: {
        backgroundColor: "red; background-image: url(x)",
        backgroundOpacity: 2,
        fontSize: Number.NaN,
        visible: "yes",
      },
      edge: { animation: "sometimes", dashPattern: "5 5; x" },
      canvas: { grid: "hexagons" },
    });
    expect(a.edgeLabel).toEqual(DEFAULT_APPEARANCE.edgeLabel);
    expect(a.edge).toEqual(DEFAULT_APPEARANCE.edge);
    expect(a.canvas.grid).toBe(DEFAULT_APPEARANCE.canvas.grid);
  });

  it("partial per-type override keeps the type's other fields", () => {
    const a = mergeAppearance({
      nodeTypes: { database: { accent: "hotpink" }, ghost: { accent: "red" } },
      edgeTypes: { calls: { dashed: true, color: 42 } },
    });
    expect(a.nodeTypes.database).toEqual({
      ...DEFAULT_APPEARANCE.nodeTypes.database,
      accent: "hotpink",
    });
    expect(a.nodeTypes.service).toEqual(DEFAULT_APPEARANCE.nodeTypes.service);
    expect(a.nodeTypes).not.toHaveProperty("ghost");
    expect(a.edgeTypes.calls).toEqual({
      ...DEFAULT_APPEARANCE.edgeTypes.calls,
      dashed: true,
    });
  });

  it("accepts null to clear the label border", () => {
    const a = mergeAppearance(
      { edgeLabel: { borderColor: null } },
      mergeAppearance({ edgeLabel: { borderColor: "#fff" } }),
    );
    expect(a.edgeLabel.borderColor).toBeNull();
  });

  it("wraps edge labels at 18 chars by default; wrapAt must be an in-range integer", () => {
    expect(DEFAULT_APPEARANCE.edgeLabel).toMatchObject({ wrap: true, wrapAt: 18 });
    expect(mergeAppearance({ edgeLabel: { wrap: false, wrapAt: 30 } }).edgeLabel)
      .toMatchObject({ wrap: false, wrapAt: 30 });
    for (const wrapAt of [12.5, 2, 500, "20"]) {
      expect(mergeAppearance({ edgeLabel: { wrapAt } }).edgeLabel.wrapAt).toBe(18);
    }
  });
});

describe("isCssColor", () => {
  it.each(["#abc", "#aabbcc", "#aabbcc80", "rgb(1, 2, 3)", "hsla(200 50% 50% / 0.5)", "teal"])(
    "accepts %s",
    (c) => expect(isCssColor(c)).toBe(true),
  );
  it.each(["", "#ab", "url(x)", "red;", "var(--x)", "expression(alert(1))"])(
    "rejects %s",
    (c) => expect(isCssColor(c)).toBe(false),
  );
});

describe("isEdgeAnimated", () => {
  const animated = { color: "#fff", dashed: false, animated: true };
  const still = { ...animated, animated: false };
  const withMode = (animation: EdgeAnimationMode) =>
    mergeAppearance({ edge: { animation } });

  it("auto defers to the type flag", () => {
    expect(isEdgeAnimated(withMode(EdgeAnimationMode.Auto), animated)).toBe(true);
    expect(isEdgeAnimated(withMode(EdgeAnimationMode.Auto), still)).toBe(false);
  });
  it("always/never override the type flag", () => {
    expect(isEdgeAnimated(withMode(EdgeAnimationMode.Always), still)).toBe(true);
    expect(isEdgeAnimated(withMode(EdgeAnimationMode.Never), animated)).toBe(false);
  });
});
