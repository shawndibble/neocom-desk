import { createContext } from 'react';

/**
 * The default for `Tooltip`'s `holdToReveal` below a provider. A row menu
 * (`RowActionsMenu`) sets it false: Radix opens a context menu on a
 * touch-and-hold, so every tooltip-bearing control inside the row — its ⋮,
 * a remove button — would otherwise open its bubble and the menu at once.
 * A trigger that passes `holdToReveal` itself wins over this; `true` inside
 * a row claims the hold from the menu (`IskAmount`'s exact figure).
 */
export const TooltipHoldContext = createContext(true);
