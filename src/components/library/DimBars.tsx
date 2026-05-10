import { getMasteryTier } from "@/lib/srs";
import { DIM_NAMES, DIM_DESCRIPTIONS } from "@/lib/constants";
import type { DimKey, SrsData } from "@/types/domain";

interface Props {
  dimStates: Record<DimKey, SrsData | null>;
}

const TIER_WIDTHS = ["0%", "50%", "100%"] as const;

export default function DimBars({ dimStates }: Props) {
  return (
    <div className="dim-bars">
      {(["R", "P", "U"] as DimKey[]).map((dim) => {
        const s = dimStates[dim];
        const locked = s === null;
        const tier = getMasteryTier(s);
        const fillClass = locked
          ? "locked"
          : tier === 0
            ? ""
            : tier === 2
              ? "mastered"
              : "learning";
        const fillWidth = locked ? "100%" : TIER_WIDTHS[tier];

        return (
          <div
            key={dim}
            className="dim-bar"
            title={`${dim}・${DIM_NAMES[dim]}：${DIM_DESCRIPTIONS[dim]}`}
          >
            <span className="dim-bar-name">{dim}</span>
            <div className="dim-bar-track">
              <div
                className={`dim-bar-fill ${fillClass}`}
                style={!locked ? { width: fillWidth } : undefined}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
