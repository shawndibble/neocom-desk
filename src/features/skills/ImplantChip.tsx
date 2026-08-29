import { typeIconUrl } from './typeDisplay';

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
  return (
    <span className="group relative inline-block">
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
      {description && (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-0 z-10 mb-1 hidden w-56 rounded-xs border border-line bg-panel p-2 text-[11px] text-text-dim shadow-lg shadow-black/50 group-hover:block group-focus-within:block"
        >
          {description}
        </span>
      )}
    </span>
  );
}
