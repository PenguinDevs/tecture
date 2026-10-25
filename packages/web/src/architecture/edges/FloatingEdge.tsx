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
import { getEdgeStyleDef } from "../edgeStyles";
import { useAppearance, withAlpha } from "../AppearanceContext";
import type { ArchEdgeData } from "../transform";

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
  label,
  data,
}: EdgeProps<Edge<ArchEdgeData>>) {
  const appearance = useAppearance();
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
          appearance.edge.cornerRadius,
        )
      : getSmoothStepPath({
          sourceX: sx,
          sourceY: sy,
          sourcePosition: sourcePos,
          targetPosition: targetPos,
          targetX: tx,
          targetY: ty,
          borderRadius: appearance.edge.cornerRadius,
        });
  }

  // An outermost lane keeps its label on its outer side. An inner lane has a
  // lane on each side, so its label stays on its own line.
  let side: LabelSide = LabelSide.Free;
  if (inLane) {
    if (Math.abs(offset) < spread) side = LabelSide.OnLine;
    else side = offset > 0 ? LabelSide.Right : LabelSide.Left;
  }
  const showLabel = Boolean(label) && appearance.edgeLabel.visible && params !== null;
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

  const def = getEdgeStyleDef(appearance, data?.edgeType);
  const { edgeLabel } = appearance;
  const markerId = `arrow-${id}`;
  const arrow = appearance.edge.arrowSize;

  return (
    <>
      <defs>
        <marker
          id={markerId}
          viewBox="-10 -10 20 20"
          refX="0"
          refY="0"
          markerWidth={arrow}
          markerHeight={arrow}
          markerUnits="strokeWidth"
          orient="auto-start-reverse"
        >
          <polyline
            points="-5,-4 0,0 -5,4 -5,-4"
            fill={def.color}
            stroke={def.color}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1}
          />
        </marker>
      </defs>
      <path
        id={id}
        className={`react-flow__edge-path${def.animated ? " react-flow__edge-path--animated" : ""}`}
        d={edgePath}
        markerEnd={`url(#${markerId})`}
        style={{
          stroke: def.color,
          strokeWidth: appearance.edge.strokeWidth,
          strokeDasharray: def.dashArray,
        }}
      />
      {label && edgeLabel.visible && (
        <EdgeLabelRenderer>
          <div
            ref={labelRef}
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${spot.x}px, ${spot.y}px)`,
              pointerEvents: "all",
              background: withAlpha(
                edgeLabel.backgroundColor,
                edgeLabel.backgroundOpacity,
              ),
              border: edgeLabel.borderColor
                ? `1px solid ${edgeLabel.borderColor}`
                : undefined,
              borderRadius: edgeLabel.borderRadius,
              padding: `${edgeLabel.paddingY}px ${edgeLabel.paddingX}px`,
            }}
          >
            <span
              style={{
                display: "block",
                fontSize: edgeLabel.fontSize,
                color: edgeLabel.textColor,
                fontWeight: edgeLabel.fontWeight,
                letterSpacing: "0.04em",
                fontFamily: "var(--font-mono)",
                textAlign: "center",
                ...(edgeLabel.wrap
                  ? {
                      // Mono font: 1ch = one character; add the per-char letter-spacing.
                      maxWidth: `calc(${edgeLabel.wrapAt}ch + ${edgeLabel.wrapAt * 0.04}em)`,
                      whiteSpace: "normal",
                      overflowWrap: "anywhere",
                    }
                  : { whiteSpace: "nowrap" }),
              }}
            >
              {glyph && (
                <span aria-hidden style={{ color: def.color, marginRight: "0.5ch" }}>
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
