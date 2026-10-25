import { useLayoutEffect, useMemo, useRef } from "react";
import {
  EdgeLabelRenderer,
  getSmoothStepPath,
  useInternalNode,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import { getEdgeParams } from "./utils";
import { laneOffset, lanePath, laneSpread } from "./lanePath";
import {
  candidateFractions,
  candidatesAt,
  directionGlyph,
  LabelSide,
  useLabelLayoutStore,
  useLabelPlacement,
  type LabelCandidate,
} from "./labelLayout";
import type { ArchEdgeData } from "../transform";

const CORNER_RADIUS = 8;

let measurePath: SVGPathElement | null = null;

/** Label candidates at `fractions` of the way along path `d`. */
function sampleCandidates(
  d: string,
  fractions: number[],
  side: LabelSide,
): LabelCandidate[] {
  if (typeof document === "undefined") return [];
  measurePath ??= document.createElementNS("http://www.w3.org/2000/svg", "path");
  measurePath.setAttribute("d", d);
  const total = measurePath.getTotalLength();
  if (!Number.isFinite(total) || total === 0) return [];
  return fractions.flatMap((f) => {
    const at = total * f;
    const p = measurePath!.getPointAtLength(at);
    const a = measurePath!.getPointAtLength(Math.max(0, at - 1));
    const b = measurePath!.getPointAtLength(Math.min(total, at + 1));
    return candidatesAt(p.x, p.y, Math.atan2(b.y - a.y, b.x - a.x), side);
  });
}

export function FloatingEdge({
  id,
  source,
  target,
  markerEnd,
  style,
  label,
  labelStyle,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
  animated,
  data,
}: EdgeProps<Edge<ArchEdgeData>>) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const labelStore = useLabelLayoutStore();
  const placement = useLabelPlacement(labelStore, id);
  const labelRef = useRef<HTMLDivElement>(null);

  const params =
    sourceNode && targetNode ? getEdgeParams(sourceNode, targetNode) : null;
  const parallelIndex = data?.parallelIndex ?? 0;
  const parallelCount = data?.parallelCount ?? 1;
  // Orderings within a pair run along its canonical direction (lower id → higher id).
  const reversed = source > target;
  // Edges sharing a node pair each take their own lane beside one centre
  // line. A self-loop has both ends on one side and keeps the plain route.
  const inLane =
    parallelCount > 1 && params !== null && params.sourcePos !== params.targetPos;
  const offset = laneOffset(parallelIndex, parallelCount, reversed);
  const spread = laneSpread(parallelCount);

  let edgePath = "";
  let labelX = 0;
  let labelY = 0;
  if (params) {
    const { sx, sy, tx, ty, sourcePos, targetPos } = params;
    [edgePath, labelX, labelY] = inLane
      ? lanePath(
          { x: sx, y: sy },
          { x: tx, y: ty },
          sourcePos,
          offset,
          spread,
          CORNER_RADIUS,
        )
      : getSmoothStepPath({
          sourceX: sx,
          sourceY: sy,
          sourcePosition: sourcePos,
          targetPosition: targetPos,
          targetX: tx,
          targetY: ty,
          borderRadius: CORNER_RADIUS,
        });
  }

  // An outermost lane keeps its label on its outer side. An inner lane has a
  // lane on each side, so its label stays on its own line.
  let side: LabelSide = LabelSide.Free;
  if (inLane) {
    if (Math.abs(offset) < spread) side = LabelSide.OnLine;
    else side = offset > 0 ? LabelSide.Right : LabelSide.Left;
  }
  const showLabel = Boolean(label) && params !== null;
  const candidates = useMemo(
    () =>
      showLabel
        ? sampleCandidates(
            edgePath,
            candidateFractions(parallelIndex, parallelCount, reversed),
            side,
          )
        : [],
    [showLabel, edgePath, parallelIndex, parallelCount, reversed, side],
  );

  useLayoutEffect(() => {
    if (!labelStore) return;
    const el = labelRef.current;
    if (!el || candidates.length === 0) {
      labelStore.unregister(id);
      return;
    }
    const register = () =>
      labelStore.register(id, {
        width: el.offsetWidth,
        height: el.offsetHeight,
        candidates,
      });
    register();
    // The label's box also changes without a re-render: text set in a web
    // font that finishes loading later, or a restyle.
    const observer = new ResizeObserver(register);
    observer.observe(el);
    return () => observer.disconnect();
  }, [labelStore, id, candidates]);

  useLayoutEffect(() => () => labelStore?.unregister(id), [labelStore, id]);

  if (!params) return null;

  const spot = placement ?? {
    x: labelX,
    y: labelY,
    angle: candidates[0]?.angle ?? 0,
  };
  // Edges sharing a node pair say which way they point.
  const glyph = parallelCount > 1 ? directionGlyph(spot.angle) : null;

  return (
    <>
      <path
        id={id}
        className={`react-flow__edge-path${animated ? " react-flow__edge-path--animated" : ""}`}
        d={edgePath}
        markerEnd={markerEnd}
        style={style}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            ref={labelRef}
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${spot.x}px, ${spot.y}px)`,
              pointerEvents: "all",
              ...(labelBgStyle
                ? {
                    background: resolveLabelBg(labelBgStyle),
                    borderRadius: labelBgBorderRadius ?? 4,
                    padding: labelBgPadding
                      ? `${(labelBgPadding as [number, number])[1]}px ${(labelBgPadding as [number, number])[0]}px`
                      : "4px 6px",
                  }
                : {}),
            }}
          >
            <span style={labelStyle as React.CSSProperties}>
              {glyph && (
                <span aria-hidden style={{ color: style?.stroke, marginRight: "0.5ch" }}>
                  {glyph}
                </span>
              )}
              {label}
            </span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

function resolveLabelBg(labelBgStyle: unknown): string {
  const s = labelBgStyle as { fill?: string; fillOpacity?: number };
  const fill = s.fill ?? "#0a0f1a";
  const alpha = s.fillOpacity ?? 1;
  if (alpha >= 1) return fill;
  const hex = fill.replace("#", "");
  if (hex.length !== 3 && hex.length !== 6) return fill;
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
