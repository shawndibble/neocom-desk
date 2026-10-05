import { Tooltip, TypeIcon } from '@/components/ui';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';

interface ImplantChipProps {
  typeId: number;
  name: string;
  description?: string | null;
}

/**
 * One fitted implant: icon + name, a Market item link (#405, DESIGN.md §6c:
 * item -> Market) preserving the page's region/hub. A real anchor, so Tab and
 * middle-click work; the tooltip carries the item's description.
 */
export function ImplantChip({ typeId, name, description }: ImplantChipProps) {
  const link = (
    <MarketItemLink typeId={typeId} className={entityLinkClassName('flex items-center gap-1.5')}>
      <TypeIcon typeId={typeId} size={32} width={16} height={16} className="size-4 shrink-0" />
      {name}
    </MarketItemLink>
  );

  return description ? <Tooltip content={description}>{link}</Tooltip> : link;
}
