import { getMasteryLevel } from "@/lib/srs";
import { DIM_NAMES, DIM_DESCRIPTIONS } from "@/lib/constants";
import type { DimKey, SrsData } from "@/types/domain";

interface Props {
  dimStates: Record<DimKey, SrsData | null>;
}

export default function DimBars({ dimStates }: Props) {
  return (
    <div className="dim-bars">
      {(["R", "P", "U"] as DimKey[]).map((dim) => {
        const s = dimStates[dim];
        const level = getMasteryLevel(s);
        const locked = s === null;
        const fillClass = locked ? "locked" : level === 2 ? "mastered" : level === 1 ? "learning" : "";
        const fillWidth = locked ? "100%" : level === 2 ? "100%" : level === 1 ? "50%" : "0%";

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
