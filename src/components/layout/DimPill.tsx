import DimTooltip from "@/components/ui/DimTooltip";
import { DIM_NAMES } from "@/lib/constants";
import type { DimKey } from "@/types/domain";

interface Props {
  dim: DimKey;
}

export default function DimPill({ dim }: Props) {
  return (
    <DimTooltip dim={dim}>
      <span className={`dimension-pill dim-${dim}`}>
        {dim}・{DIM_NAMES[dim]}
      </span>
    </DimTooltip>
  );
}
