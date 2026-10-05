import { useTranslation } from 'react-i18next';
import { MenuItem, MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger } from '@/components/ui';
import { cx } from '@/lib/cx';
import { formatCompactNumber } from '@/lib/compactNumber';
import {
  chargeLabel,
  chargeShortName,
  groupByType,
  quickPicks,
  sortGroups,
  strictlyWorseThan,
  type ChargeChoice,
} from '@/engine/fittings/chargeChoice';
import type { FittingModule, FittingSlotKind } from '@/engine/fittings/types';
import type { FittingItemActions } from './fittingItemActions';
import { formatIsk } from './chargeFormat';
import { useChargeChoices } from './useChargeChoices';

/**
 * "Change charge" as the Charge Picker, sized for a menu (a Ring tile,
 * a List row, an Offense row): the quick picks, then one submenu per type —
 * long range down to most damage — holding its Tech I and faction versions
 * with damage and price. Each loads into `at` only, out of the cargo when it
 * holds some. Falls back to `fallback` (the plain list) for a module whose
 * charges don't shoot, or before the figures are ready.
 */
export function ChargePickerMenuItems({
  actions,
  module,
  at,
  fallback,
}: {
  actions: FittingItemActions;
  module: FittingModule;
  at: readonly { slot: FittingSlotKind; slotIndex: number }[];
  fallback: React.ReactNode;
}) {
  const { t } = useTranslation();
  const input = actions.chargePickerInput?.() ?? null;
  const { groups } = useChargeChoices({
    fitting: input?.fitting ?? null,
    context: input?.context ?? null,
    moduleResults: input?.moduleResults ?? null,
    moduleTypeId: module.typeId,
  });
  const group = groups?.[0];
  if (!group || !group.isWeapon) return <>{fallback}</>;

  const load = (c: ChargeChoice) =>
    actions.charges.load(c.typeId, { fromCargo: c.cargo > 0, only: at });
  const picks = quickPicks(group.choices, null);
  const types = groupByType(group.choices);
  const ladder = [
    ...sortGroups(
      types.filter((g) => g.tier === 'tech1'),
      'range',
      null
    ),
    ...types.filter((g) => g.tier === 'tech2'),
  ];
  const loaded = module.chargeTypeId;

  return (
    <>
      {picks &&
        (
          [
            ['maxDamage', picks.maxDamage],
            ['maxRange', picks.maxRange],
            ['bestValue', picks.bestValue],
          ] as const
        ).map(([key, choice]) =>
          choice ? (
            <MenuItem key={key} onSelect={() => load(choice)}>
              <span className="flex w-full min-w-0 items-baseline justify-between gap-4">
                <span>{t(`fittings.chargePicker.${key}`)}</span>
                <span className="truncate text-[0.6875rem] text-text-dim">
                  {chargeShortName(choice)}
                </span>
              </span>
            </MenuItem>
          ) : null
        )}
      <MenuSeparator />
      <div
        role="presentation"
        className="flex justify-between gap-4 px-2 py-1 text-[0.6875rem] text-text-dim"
      >
        <span>{t('fittings.chargePicker.ladderHint')}</span>
        <span>{t('fittings.chargePicker.dpsUnit')}</span>
      </div>
      {ladder.map((g) => {
        const rep = g.representative;
        const holds = g.choices.some((c) => c.typeId === loaded);
        return (
          <MenuSub key={g.baseTypeId}>
            <MenuSubTrigger>
              <span
                className={cx(
                  'flex w-full min-w-0 items-baseline justify-between gap-4',
                  holds && 'font-semibold'
                )}
              >
                <span className="truncate">
                  {holds && '● '}
                  {chargeLabel(g.name)}
                  {rep.falloff > 0 && (
                    <span className="ml-1.5 text-[0.6875rem] text-text-dim">
                      {t('fittings.chargePicker.km', {
                        km: Math.round((rep.optimal + rep.falloff) / 1000),
                      })}
                    </span>
                  )}
                </span>
                <span className="tabular-nums">{Math.round(rep.dps)}</span>
              </span>
            </MenuSubTrigger>
            <MenuSubContent className="max-h-80 overflow-y-auto">
              {g.choices.map((c) => {
                const worse = strictlyWorseThan(c, group.choices);
                return (
                  <MenuItem
                    key={c.typeId}
                    disabled={c.skillMissing}
                    onSelect={() => load(c)}
                    className={cx(worse !== null && 'opacity-60')}
                  >
                    <span className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-3">
                      <span className={cx('truncate', c.typeId === loaded && 'font-semibold')}>
                        {c.typeId === loaded && '● '}
                        {c.tier === 'faction'
                          ? c.faction
                          : t(`fittings.chargePicker.${c.tier === 'tech2' ? 'tech2' : 'tech1'}`)}
                        {c.cargo > 0 && (
                          <span className="ml-1.5 text-[0.6875rem] text-text-dim">
                            {t('fittings.chargePicker.inCargo', {
                              count: formatCompactNumber(c.cargo),
                            })}
                          </span>
                        )}
                      </span>
                      <span className="text-right text-[0.6875rem] text-text-dim tabular-nums">
                        {t('fittings.chargePicker.dps', { value: Math.round(c.dps) })}
                      </span>
                      <span className="text-right text-[0.6875rem] text-text-dim tabular-nums">
                        {c.skillMissing
                          ? t('fittings.chargePicker.skillTag')
                          : c.price === null
                            ? t('fittings.chargePicker.noPrice')
                            : t('fittings.chargePicker.isk', { isk: formatIsk(c.price) })}
                      </span>
                    </span>
                  </MenuItem>
                );
              })}
            </MenuSubContent>
          </MenuSub>
        );
      })}
    </>
  );
}
