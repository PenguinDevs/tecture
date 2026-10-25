import { createContext, useContext, useEffect, useSyncExternalStore } from "react";
import { useStore, type ReactFlowState } from "@xyflow/react";
import { CONTAINER_HEADER } from "../ArchitectureNode";

/** A point on an edge path, in flow coordinates. */
export interface LabelCandidate {
  x: number;
  y: number;
  /** Path tangent at this spot, in radians (direction of travel source → target). */
  angle: number;
  /**
   * Unit direction to push the label off the line so its near edge touches it
   * (0,0 = centre the label on the line).
   */
  pushX: number;
  pushY: number;
}

/** Resolved label centre. */
export interface LabelPlacement {
  x: number;
  y: number;
  angle: number;
}

export interface LabelRequest {
  width: number;
  height: number;
  /** Ordered by preference; the first one clear of other labels and nodes wins. */
  candidates: LabelCandidate[];
}

/** Where an edge's label may sit relative to its own line. */
export const LabelSide = {
  /** On the line, else either side: an edge with no siblings. */
  Free: "free",
  /** Centred on the line only: an inner lane, with lanes on both sides. */
  OnLine: "on-line",
  /** Beside the line, left of the edge's direction of travel: an outermost lane. */
  Left: "left",
  /** Beside the line, right of the edge's direction of travel: an outermost lane. */
  Right: "right",
} as const;
export type LabelSide = (typeof LabelSide)[keyof typeof LabelSide];

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Clear space kept around each label. */
const LABEL_MARGIN = 4;
/** Gap between a pushed-off label and its line. */
const LINE_GAP = 3;
/** Upper bound on placement passes; stops early once no label moves. */
const REFINE_ROUNDS = 6;
/** Slack for path fractions, which pick up float rounding (0.5 - 0.4 < 0.1). */
const FRACTION_EPSILON = 1e-9;
/** Covering a node hides it; weigh that above covering another label. */
const NODE_OVERLAP_WEIGHT = 4;

function resolve(c: LabelCandidate, w: number, h: number): LabelPlacement {
  const reach = Math.abs(c.pushX) * (w / 2) + Math.abs(c.pushY) * (h / 2) + LINE_GAP;
  return { x: c.x + c.pushX * reach, y: c.y + c.pushY * reach, angle: c.angle };
}

function rectAt(p: LabelPlacement, w: number, h: number): Rect {
  return {
    x0: p.x - w / 2 - LABEL_MARGIN,
    y0: p.y - h / 2 - LABEL_MARGIN,
    x1: p.x + w / 2 + LABEL_MARGIN,
    y1: p.y + h / 2 + LABEL_MARGIN,
  };
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Places every edge label of one canvas so labels don't cover each other,
 * nodes or container headers. Edges register their label size and candidate
 * spots along their path; the store gives each label (in id order, so
 * results are stable) its first candidate clear of all of those, falling
 * back to the least-covering one.
 */
export class LabelLayoutStore {
  private requests = new Map<string, LabelRequest>();
  private obstacles: Rect[] = [];
  private placements = new Map<string, LabelPlacement>();
  private listeners = new Set<() => void>();
  private scheduled = false;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getPlacement(id: string): LabelPlacement | undefined {
    return this.placements.get(id);
  }

  register(id: string, request: LabelRequest): void {
    this.requests.set(id, request);
    this.schedule();
  }

  unregister(id: string): void {
    if (this.requests.delete(id)) this.schedule();
  }

  /** Boxes labels should stay off, in flow coordinates. */
  setObstacles(rects: Rect[]): void {
    this.obstacles = rects;
    this.schedule();
  }

  /** Batches registrations from one render pass into a single solve. */
  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.solve();
    });
  }

  private solve(): void {
    const ids = [...this.requests.keys()].sort();
    const chosen = new Map<string, { p: LabelPlacement; r: Rect }>();

    // Each round, every label takes its first lowest-cost spot, in preference
    // order, against the others' current spots. Round one is a greedy pass;
    // later rounds let a label step aside for a later one, or return to a
    // preferred spot once whatever pushed it aside has moved.
    for (let round = 0; round < REFINE_ROUNDS; round++) {
      let moved = false;
      for (const id of ids) {
        const { width, height, candidates } = this.requests.get(id)!;
        let best: { p: LabelPlacement; r: Rect } | undefined;
        let bestCost = Infinity;
        for (const c of candidates) {
          const p = resolve(c, width, height);
          const r = rectAt(p, width, height);
          const cost = this.cost(id, r, chosen);
          if (cost < bestCost) {
            best = { p, r };
            bestCost = cost;
            if (cost === 0) break;
          }
        }
        if (!best) continue;
        const current = chosen.get(id);
        if (!current || current.p.x !== best.p.x || current.p.y !== best.p.y) {
          chosen.set(id, best);
          moved = true;
        }
      }
      if (!moved) break;
    }

    // Keep unchanged placements by identity so their edges skip re-rendering.
    const next = new Map<string, LabelPlacement>();
    let changed = chosen.size !== this.placements.size;
    for (const [id, { p }] of chosen) {
      const prev = this.placements.get(id);
      if (prev && prev.x === p.x && prev.y === p.y && prev.angle === p.angle) {
        next.set(id, prev);
      } else {
        next.set(id, p);
        changed = true;
      }
    }
    this.placements = next;
    if (changed) for (const l of this.listeners) l();
  }

  /** Area of `r` covering other labels' current spots and (weighted) obstacles. */
  private cost(id: string, r: Rect, chosen: Map<string, { r: Rect }>): number {
    let cost = 0;
    for (const [other, o] of chosen) if (other !== id) cost += overlapArea(r, o.r);
    for (const o of this.obstacles) cost += NODE_OVERLAP_WEIGHT * overlapArea(r, o);
    return cost;
  }
}

export const LabelLayoutContext = createContext<LabelLayoutStore | null>(null);

export function useLabelLayoutStore(): LabelLayoutStore | null {
  return useContext(LabelLayoutContext);
}

/** Subscribes to the resolved spot for one edge's label. */
export function useLabelPlacement(
  store: LabelLayoutStore | null,
  id: string,
): LabelPlacement | undefined {
  return useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    () => store?.getPlacement(id),
  );
}

const noopSubscribe = () => () => {};

/**
 * Path fractions to try for a label, most preferred first. Edges that share a
 * node pair get distinct home spots measured along the pair's canonical
 * direction, so A→B and B→A labels start apart.
 */
export function candidateFractions(
  parallelIndex: number,
  parallelCount: number,
  reversed: boolean,
): number[] {
  const home =
    parallelCount > 1 ? (parallelIndex + 1) / (parallelCount + 1) : 0.5;
  const steps = [0, -0.1, 0.1, -0.2, 0.2, -0.3, 0.3, -0.4, 0.4];
  const out: number[] = [];
  for (const s of steps) {
    const f = home + s;
    if (f < 0.1 - FRACTION_EPSILON || f > 0.9 + FRACTION_EPSILON) continue;
    out.push(reversed ? 1 - f : f);
  }
  return out;
}

/**
 * Candidate spots at one path point. Sides are relative to the direction of
 * travel, so a lane's label keeps to its own side of the line through every
 * turn, including the backwards middle run of an S-shaped route.
 */
export function candidatesAt(
  x: number,
  y: number,
  angle: number,
  side: LabelSide,
): LabelCandidate[] {
  // Unit vector to the right of the direction of travel (y down), snapped to
  // the segment's axis.
  const horizontal = Math.abs(Math.cos(angle)) >= Math.abs(Math.sin(angle));
  const rightX = horizontal ? 0 : -Math.sign(Math.sin(angle));
  const rightY = horizontal ? Math.sign(Math.cos(angle)) : 0;
  const at = (s: number): LabelCandidate => ({
    x,
    y,
    angle,
    pushX: rightX * s,
    pushY: rightY * s,
  });
  switch (side) {
    case LabelSide.Free:
      return [at(0), at(-1), at(1)];
    case LabelSide.OnLine:
      return [at(0)];
    case LabelSide.Left:
      return [at(-1)];
    case LabelSide.Right:
      return [at(1)];
  }
}

/**
 * Boxes labels should stay off: every node, except that a container only
 * blocks its header band. Its body is where labels of edges between its
 * children belong.
 */
export function obstacleRects(state: ReactFlowState): Rect[] {
  const out: Rect[] = [];
  for (const n of state.nodeLookup.values()) {
    const { x, y } = n.internals.positionAbsolute;
    const width = n.measured.width ?? 0;
    const height = n.measured.height ?? 0;
    const isContainer = n.data.isContainer === true;
    out.push({
      x0: x,
      y0: y,
      x1: x + width,
      y1: y + (isContainer ? Math.min(CONTAINER_HEADER, height) : height),
    });
  }
  return out;
}

function sameRects(a: Rect[], b: Rect[]): boolean {
  return (
    a.length === b.length &&
    a.every((r, i) => {
      const o = b[i]!;
      return r.x0 === o.x0 && r.y0 === o.y0 && r.x1 === o.x1 && r.y1 === o.y1;
    })
  );
}

/** Keeps the store's obstacles in sync with the nodes; render inside `<ReactFlow>`. */
export function LabelObstacleSync({ store }: { store: LabelLayoutStore }) {
  const rects = useStore(obstacleRects, sameRects);
  useEffect(() => store.setObstacles(rects), [store, rects]);
  return null;
}

/** Arrow glyph pointing along `angle` (screen coordinates, y down). */
export function directionGlyph(angle: number): string {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "→" : "←";
  return dy >= 0 ? "↓" : "↑";
}
