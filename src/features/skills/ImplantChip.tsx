import { Tooltip } from '@/components/ui';
import { typeIconUrl } from '@/lib/eveImages';

interface ImplantChipProps {
  typeId: number;
  name: string;
  description?: string | null;
}

/**
 * One fitted implant: icon + name, with a keyboard-accessible tooltip (shown
 * on hover or focus) carrying the item's description. The trigger is a real
 * <button> so Tab reaches it and :focus-within reveals the tooltip without JS.
 */
export function ImplantChip({ typeId, name, description }: ImplantChipProps) {
  const trigger = (
    <button
      type="button"
      className="flex items-center gap-1.5 rounded-xs border border-line bg-panel-2 px-2 py-0.5 text-xs focus-visible:outline-2 focus-visible:outline-accent"
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
