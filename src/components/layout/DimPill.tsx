import { DIM_NAMES, DIM_DESCRIPTIONS } from "@/lib/constants";
import type { DimKey } from "@/types/domain";

interface Props {
  dim: DimKey;
  showTooltip?: boolean;
}

export default function DimPill({ dim, showTooltip = true }: Props) {
  const title = showTooltip ? `${DIM_NAMES[dim]}：${DIM_DESCRIPTIONS[dim]}` : undefined;
  return (
    <span
      className={`dimension-pill dim-${dim}`}
      title={title}
    >
      {dim}・{DIM_NAMES[dim]}
    </span>
  );
}
