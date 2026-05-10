import { getMasteryTier } from "@/lib/srs";
import DimTooltip, { type DimTooltipState } from "@/components/ui/DimTooltip";
import type { DimKey, SrsData } from "@/types/domain";

interface Props {
  dimStates: Record<DimKey, SrsData | null>;
}

const TIER_WIDTHS = ["0%", "50%", "100%"] as const;

function deriveState(srs: SrsData | null, locked: boolean): DimTooltipState {
  if (locked) return "locked";
  const tier = getMasteryTier(srs);
  if (tier === 0) return "new";
  if (tier === 1) return "learning";
  return "mastered";
}

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
          <DimTooltip key={dim} dim={dim} state={deriveState(s, locked)}>
            <span className="dim-bar">
              <span className="dim-bar-name">{dim}</span>
              <span className="dim-bar-track">
                <span
                  className={`dim-bar-fill ${fillClass}`}
                  style={!locked ? { width: fillWidth } : undefined}
                />
              </span>
            </span>
          </DimTooltip>
        );
      })}
    </div>
  );
}
