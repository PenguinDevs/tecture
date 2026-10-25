import {
  EdgeLabelRenderer,
  getSmoothStepPath,
  useInternalNode,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import { getEdgeParams } from "./utils";
import { laneOffset, lanePath, laneSpread } from "./lanePath";
import type { ArchEdgeData } from "../transform";

const CORNER_RADIUS = 8;

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
  const parallelIndex = data?.parallelIndex ?? 0;
  const parallelCount = data?.parallelCount ?? 1;

  // Edges sharing a node pair each take their own lane beside one centre
  // line. A self-loop has both ends on one side and keeps the plain route.
  const [edgePath, labelX, labelY] =
    parallelCount > 1 && sourcePos !== targetPos
      ? lanePath(
          { x: sx, y: sy },
          { x: tx, y: ty },
          sourcePos,
          laneOffset(parallelIndex, parallelCount, source > target),
          laneSpread(parallelCount),
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
