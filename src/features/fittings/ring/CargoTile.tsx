import { useTranslation } from 'react-i18next';
import { Tooltip, TypeIcon } from '@/components/ui';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { formatCompactNumber } from '@/lib/compactNumber';
import { endFittingDrag, startFittingDrag } from '../fittingDrag';
import { CargoMenuItems, FittingItemMenu } from '../FittingItemMenu';
import {
  cargoDragPayload,
  openItemMenu,
  useFittingItemActions,
  type FittingItemActions,
} from '../fittingItemActions';
import { useOverBudgetFlash } from '../useOverBudgetFlash';

/**
 * A cargo item beneath the ring: its icon, a count, and a tooltip naming it.
 * With the editor's actions, a click (or Enter) opens its menu — load it,
 * change its count, remove it — and on a pointer it drags onto the modules
 * that take it.
 */
export function CargoTile({
  typeId,
  count,
  tooltip,
}: {
  typeId: number;
  count: number;
  tooltip: string;
}) {
  const actions = useFittingItemActions();
  const shown = formatCompactNumber(count);
  // The badge's count is visible text, so it belongs in the name (WCAG 2.5.3).
  const name = shown === String(count) ? tooltip : `${tooltip} (${shown})`;
  const draggable = actions?.dropHandlers.loadCharge ?? false;
  const tile = (
    <button
      type="button"
      aria-label={name}
      aria-haspopup={actions ? 'menu' : undefined}
      className={`relative h-11 w-11 shrink-0 border border-line-bright bg-bg ${interactiveClassName} ${focusRingClassName} ${actions ? 'cursor-pointer hover:border-accent' : ''}`}
      onClick={actions ? openItemMenu : undefined}
      draggable={draggable}
      onDragStart={
        draggable && actions
          ? (event) => startFittingDrag(event, cargoDragPayload(actions, typeId))
          : undefined
      }
      onDragEnd={draggable ? endFittingDrag : undefined}
    >
      <TypeIcon typeId={typeId} size={64} className="h-full w-full" />
      <span className="absolute right-0 bottom-0 bg-bg/85 px-0.5 text-[0.625rem] leading-tight font-semibold text-text tabular-nums">
        {shown}
      </span>
    </button>
  );
  if (actions === null) {
    return (
      <Tooltip content={tooltip} openOnTap>
        {tile}
      </Tooltip>
    );
  }
  return (
    <FittingItemMenu name={tooltip} tooltip={tooltip} items={<CargoMenuItems typeId={typeId} />}>
      {tile}
    </FittingItemMenu>
  );
}

/** The hold's m3 used of what it takes, flashing once as it goes over — as the drone bay's bar does. */
export function CargoHoldReadout({ actions }: { actions: FittingItemActions }) {
  const { t } = useTranslation();
  const { cargoUsed: used, cargoCapacity: total } = actions;
  const { overBudget, flashKey, overage } = useOverBudgetFlash(used, total);
  if (used === null || total === null) return null;
  return (
    <p
      key={flashKey}
      role="meter"
      aria-label={t('fittings.list.cargoHold')}
      aria-valuenow={used}
      aria-valuemax={total}
      className={`rounded-xs text-xs tabular-nums ${overBudget ? 'font-semibold text-danger' : 'text-text-dim'} ${flashKey > 0 && overBudget ? 'flash-danger' : ''}`}
    >
      {t('fittings.item.cargoHold', { used: used.toFixed(1), total: total.toFixed(1) })}
      {overBudget && ` · ${t('fittings.list.overBy', { amount: overage.toFixed(1) })}`}
    </p>
  );
}
