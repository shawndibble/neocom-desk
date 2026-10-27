import type { ReactNode } from 'react';
import { Tooltip as TooltipPrimitive } from 'radix-ui';
import { usePortalContainer } from './portalContainer';

/**
 * A bubble the caller opens and moves itself, for a readout that follows a
 * pointer along a chart rather than belonging to one focusable trigger (that
 * is `Tooltip`). `anchor` is the element to sit above, usually an
 * absolutely-positioned empty `span` the caller slides to the point being read;
 * the bubble flips and shifts to stay on screen and portals like `Tooltip`'s.
 * Fill it with `ChartTooltipShell`. Pointer-only: it is never reachable by
 * keyboard, so whatever it says must also be in the view's table or summary.
 */
export function PointTooltip({
  open,
  onClose,
  anchor,
  children,
}: {
  open: boolean;
  /** Radix closes it on Escape, a scroll and the like; clear the caller's state. */
  onClose: () => void;
  /** The element the bubble points at. It needs a ref, so a plain DOM element. */
  anchor: ReactNode;
  children: ReactNode;
}) {
  const container = usePortalContainer();
  return (
    <TooltipPrimitive.Provider delayDuration={0}>
      <TooltipPrimitive.Root
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <TooltipPrimitive.Trigger asChild>{anchor}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal container={container}>
          <TooltipPrimitive.Content
            side="top"
            sideOffset={6}
            collisionPadding={8}
            className="pointer-events-none z-50"
          >
            {children}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
