import { describe, expect, it } from "vitest";
import {
  candidateFractions,
  candidatesAt,
  LabelLayoutStore,
  LabelSide,
  type LabelCandidate,
} from "../src/architecture/edges/labelLayout";

const spot = (x: number, y: number): LabelCandidate => ({
  x,
  y,
  angle: 0,
  pushX: 0,
  pushY: 0,
});

describe("candidateFractions", () => {
  it("keeps the spots 10% from either end for an edge without siblings", () => {
    for (const reversed of [false, true]) {
      const fractions = candidateFractions(0, 1, reversed);
      expect(fractions.some((f) => Math.abs(f - 0.1) < 1e-9)).toBe(true);
      expect(fractions.some((f) => Math.abs(f - 0.9) < 1e-9)).toBe(true);
    }
  });
});

describe("candidatesAt", () => {
  it("keeps a lane's label on its own side when the route runs backwards", () => {
    // Right of eastward travel is down; right of westward travel (the middle
    // run of an S-shaped route) is up.
    const [east] = candidatesAt(0, 0, 0, LabelSide.Right);
    const [west] = candidatesAt(0, 0, Math.PI, LabelSide.Right);
    expect([east!.pushX, east!.pushY]).toEqual([0, 1]);
    expect([west!.pushX, west!.pushY]).toEqual([0, -1]);
  });
});

describe("LabelLayoutStore", () => {
  it("returns a label to its preferred spot once the label that pushed it aside moves", async () => {
    const store = new LabelLayoutStore();
    // "a" settles first at x=0, pushing "b" to its fallback; then "a" steps
    // aside to x=200, which frees b's preferred x=10.
    store.register("a", { width: 40, height: 10, candidates: [spot(0, 0), spot(200, 0)] });
    store.register("b", { width: 40, height: 10, candidates: [spot(10, 0), spot(40, 0)] });
    await Promise.resolve();
    expect(store.getPlacement("a")).toMatchObject({ x: 200, y: 0 });
    expect(store.getPlacement("b")).toMatchObject({ x: 10, y: 0 });
  });
});
