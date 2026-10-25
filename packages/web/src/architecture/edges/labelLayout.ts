import { createContext, useContext, useSyncExternalStore } from "react";

/** A point on an edge path, in flow coordinates. */
export interface LabelCandidate {
  x: number;
  y: number;
  /** Path tangent at this spot, in radians (direction of travel source → target). */
  angle: number;
  /**
   * Unit direction to push the label off the line so its near edge touches it
   * (0,0 = centre the label on the line). Parallel edges push away from their
   * sibling so each label visibly belongs to its own line.
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
  /** Ordered by preference; the first one clear of other labels wins. */
  candidates: LabelCandidate[];
}

interface Rect {
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
 * Places every edge label of one canvas so labels don't cover each other.
 * Edges register their label size and candidate spots along their path; the
 * store assigns each label (in id order, so results are stable) the first
 * candidate clear of the others, falling back to the least-covering one.
 */
export class LabelLayoutStore {
  private requests = new Map<string, LabelRequest>();
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

    // Greedy first pass, then a few rounds where each label re-picks its best
    // spot against all others, so an early label can step aside for a later one.
    for (let round = 0; round < REFINE_ROUNDS; round++) {
      let moved = false;
      for (const id of ids) {
        const { width, height, candidates } = this.requests.get(id)!;
        const current = chosen.get(id);
        let best = current;
        let bestCost = current ? this.cost(id, current.r, chosen) : Infinity;
        for (const c of candidates) {
          if (bestCost === 0) break;
          const p = resolve(c, width, height);
          const r = rectAt(p, width, height);
          const cost = this.cost(id, r, chosen);
          if (cost < bestCost) {
            best = { p, r };
            bestCost = cost;
          }
        }
        if (best && best !== current) {
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

  /** Area of `r` covering the other labels' current spots. */
  private cost(id: string, r: Rect, chosen: Map<string, { r: Rect }>): number {
    let cost = 0;
    for (const [other, o] of chosen) if (other !== id) cost += overlapArea(r, o.r);
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
    if (f < 0.1 || f > 0.9) continue;
    out.push(reversed ? 1 - f : f);
  }
  return out;
}

/**
 * Candidate spots at one path point. `sideX`/`sideY` give the sign of the
 * edge's parallel offset on vertical/horizontal segments: a parallel edge
 * keeps its label on its own outer side of the pair; a lone edge (sides 0)
 * prefers the line itself, then either side.
 */
export function candidatesAt(
  x: number,
  y: number,
  angle: number,
  sideX: number,
  sideY: number,
): LabelCandidate[] {
  const horizontal = Math.abs(Math.cos(angle)) >= Math.abs(Math.sin(angle));
  const side = Math.sign(horizontal ? sideY : sideX);
  const at = (s: number): LabelCandidate => ({
    x,
    y,
    angle,
    pushX: horizontal ? 0 : s,
    pushY: horizontal ? s : 0,
  });
  return side === 0 ? [at(0), at(-1), at(1)] : [at(side)];
}
