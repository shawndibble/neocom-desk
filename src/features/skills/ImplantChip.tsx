import { useLocation, useNavigate } from 'react-router-dom';
import { Tooltip } from '@/components/ui';
import { marketLinkParams } from '@/engine/market/urlState';
import { typeIconUrl } from '@/lib/eveImages';

interface ImplantChipProps {
  typeId: number;
  name: string;
  description?: string | null;
}

/**
 * One fitted implant: icon + name, clicking through to Market filtered to
 * that implant (#405) — the same target Market Browser cross-link used
 * elsewhere (`ItemContextMenu`'s "View in Market"), but a plain click here
 * rather than a right-click menu: an implant fitted to a character has
 * exactly one useful action (look it up), not the Quickbar/Compare/Build
 * Plan set a tradeable item's full context menu offers. Keyboard-accessible
 * tooltip (shown on hover or focus) carries the item's description. The
 * trigger is a real <button> so Tab reaches it and :focus-within reveals the
 * tooltip without JS.
 */
export function ImplantChip({ typeId, name, description }: ImplantChipProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const trigger = (
    <button
      type="button"
      onClick={() => {
        const params = marketLinkParams(typeId, location.search);
        navigate(`/market?${new URLSearchParams(params).toString()}`);
      }}
      className="flex items-center gap-1.5 rounded-xs border border-line bg-panel-2 px-2 py-0.5 text-xs hover:border-line-bright focus-visible:outline-2 focus-visible:outline-accent"
    >
      <img
        src={typeIconUrl(typeId, 32)}
        alt=""
        width={16}
        height={16}
        className="size-4 shrink-0"
      />
      {name}
    </button>
  );

  return description ? <Tooltip content={description}>{trigger}</Tooltip> : trigger;
}
