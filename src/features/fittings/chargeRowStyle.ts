import { cx } from '@/lib/cx';
import {
  disabledClassName,
  focusRingInsetClassName,
  interactiveClassName,
} from '@/components/ui/controlStyles';

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
