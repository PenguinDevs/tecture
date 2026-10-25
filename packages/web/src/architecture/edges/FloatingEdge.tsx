import {
  EdgeLabelRenderer,
  getSmoothStepPath,
  Position,
  useInternalNode,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import { getEdgeParams } from "./utils";
import type { ArchEdgeData } from "../transform";

/** Distance between the lines of edges that join the same two nodes. */
const PARALLEL_SPACING = 14;

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

  if (!sourceNode || !targetNode) return null;

  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(
    sourceNode,
    targetNode,
  );

  // Same absolute shift on both ends for every edge of the pair, whichever
  // way it points, so A→B and B→A run on separate lines. The middle segment
  // of the step moves perpendicular to the turn so the lines never cross.
  const parallelIndex = data?.parallelIndex ?? 0;
  const parallelCount = data?.parallelCount ?? 1;
  const shift = (parallelIndex - (parallelCount - 1) / 2) * PARALLEL_SPACING;
  const midShift = -shift * Math.sign((tx - sx) * (ty - sy));
  const horizontal =
    sourcePos === Position.Left || sourcePos === Position.Right;
  const [dx, dy] = horizontal ? [0, shift] : [shift, 0];
  const sX = sx + dx;
  const sY = sy + dy;
  const tX = tx + dx;
  const tY = ty + dy;

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX: sX,
    sourceY: sY,
    sourcePosition: sourcePos,
    targetPosition: targetPos,
    targetX: tX,
    targetY: tY,
    borderRadius: 8,
    ...(horizontal
      ? { centerX: (sX + tX) / 2 + midShift }
      : { centerY: (sY + tY) / 2 + midShift }),
  });

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
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
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
            <span style={labelStyle as React.CSSProperties}>{label}</span>
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
