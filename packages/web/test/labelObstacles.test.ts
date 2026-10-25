import { describe, expect, it } from "vitest";
import type { ReactFlowState } from "@xyflow/react";
import { CONTAINER_HEADER } from "../src/architecture/ArchitectureNode";
import { obstacleRects } from "../src/architecture/edges/labelLayout";

function stateWith(
  nodes: { x: number; y: number; width: number; height: number; isContainer: boolean }[],
): ReactFlowState {
  const nodeLookup = new Map(
    nodes.map((n, i) => [
      `n${i}`,
      {
        data: { isContainer: n.isContainer },
        measured: { width: n.width, height: n.height },
        internals: { positionAbsolute: { x: n.x, y: n.y } },
      },
    ]),
  );
  // Only nodeLookup is read; the rest of the store is irrelevant here.
  return { nodeLookup } as unknown as ReactFlowState;
}

describe("obstacleRects", () => {
  it("blocks a node's whole box but only a container's header band", () => {
    const rects = obstacleRects(
      stateWith([
        { x: 10, y: 20, width: 160, height: 60, isContainer: false },
        { x: 0, y: 200, width: 400, height: 300, isContainer: true },
      ]),
    );
    expect(rects).toEqual([
      { x0: 10, y0: 20, x1: 170, y1: 80 },
      { x0: 0, y0: 200, x1: 400, y1: 200 + CONTAINER_HEADER },
    ]);
  });
});
