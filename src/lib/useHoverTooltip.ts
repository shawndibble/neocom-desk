import { useId, useState } from 'react';

export interface HoverTooltip {
  tooltipOpen: boolean;
  tooltipId: string;
  /** Spread onto the trigger element. */
  triggerHandlers: {
    'aria-describedby': string | undefined;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onFocus: () => void;
    onBlur: () => void;
  };
}

/**
 * Mount-only-while-hovered/focused tooltip trigger state, shared by
 * `AssetItemRow` and `StationPinButton` (src/routes/Assets.tsx). Deliberately
 * not the shared `Tooltip` component's pure-CSS always-mounted-but-hidden
 * bubble: with many rows/stations rendered at once, an always-mounted bubble
 * per trigger would leave several `role="tooltip"` nodes in the DOM
 * regardless of hover state.
 */
export function useHoverTooltip(): HoverTooltip {
  const tooltipId = useId();
  const [tooltipOpen, setTooltipOpen] = useState(false);
  return {
    tooltipOpen,
    tooltipId,
    triggerHandlers: {
      'aria-describedby': tooltipOpen ? tooltipId : undefined,
      onMouseEnter: () => setTooltipOpen(true),
      onMouseLeave: () => setTooltipOpen(false),
      onFocus: () => setTooltipOpen(true),
      onBlur: () => setTooltipOpen(false),
    },
  };
}
