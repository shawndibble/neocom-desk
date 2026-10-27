import { cx } from '@/lib/cx';
import {
  disabledClassName,
  focusRingInsetClassName,
  interactiveClassName,
} from '@/components/ui/controlStyles';

/**
 * A Charge row that is itself the control. Loaded is a toggle, so it takes
 * the accent tint (DESIGN.md §6c), with a status word beside it: no accent
 * left bar, which is the selected-row cue and not "in use". Hover is the
 * `panel-2` fill and no other.
 */
export function chargeRowClassName(loaded: boolean, extra = ''): string {
  return cx(
    loaded
      ? 'bg-accent/15 hover:bg-accent/22 active:bg-accent/28'
      : 'hover:bg-panel-2 active:bg-panel',
    interactiveClassName,
    focusRingInsetClassName,
    disabledClassName,
    extra
  );
}
