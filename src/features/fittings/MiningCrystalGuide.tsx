import { Fragment, useId, useMemo, useState, type ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Caret, IconButton, Modal, TypeIcon } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { formatSeconds } from '@/lib/duration';
import { groupCrystals, type CrystalChoice } from '@/engine/fittings/crystalChoice';
import { formatIsk } from './chargeFormat';
import type { WeaponChargeGroup } from './useChargeChoices';

interface Props {
  group: WeaponChargeGroup;
  /** Loads the crystal into every fitted miner of the group. */
  onLoad?: (chargeTypeId: number) => void;
  /** Wraps a loadable row in the Add panel's drag and right-click menu (Show info). */
  wrapRow?: (chargeTypeId: number, row: ReactNode) => ReactNode;
  pricesLoading: boolean;
}

const COLUMNS = 'grid-cols-[minmax(0,1fr)_3.2rem_2.4rem_3.2rem_2.8rem]';
const HELP_KEYS = ['a', 'b', 'c', 'tech2'] as const;

const m3s = (value: number) =>
  value.toLocaleString('en-US', { maximumFractionDigits: value < 100 ? 1 : 0 });

function rowLabel(t: TFunction, { choice }: CrystalChoice): string {
  const mining = choice.mining!;
  return [
    choice.name,
    t('fittings.crystalGuide.m3PerSecond', { value: m3s(mining.m3PerSecond) }),
    t('fittings.crystalGuide.cycle', { time: formatSeconds(mining.cycleSeconds) }),
    t('fittings.crystalGuide.residue', {
      value: m3s(mining.residueM3s),
      pct: Math.round(mining.residueChance * 100),
      multiplier: m3s(mining.residueMultiplier),
    }),
    choice.price === null
      ? t('fittings.capGuide.noPrice')
      : t('fittings.chargePicker.isk', { isk: formatIsk(choice.price) }),
    ...(choice.skillMissing ? [t('fittings.chargePicker.needsSkill')] : []),
  ].join(', ');
}

/**
 * A mining laser group's Charge Picker: one line on how to pick (what A,
 * B and C are for sits behind its ? in a modal, out of the panel's way),
 * then one section per ore family (its ores named), each family's six
 * crystals side by side with this Fitting's yield, cycle and residue
 * (`engine/fittings/crystalChoice.ts`, `mining.ts`). The loaded crystal's
 * family starts open; the rest open on their header.
 */
export function MiningCrystalGuide({ group, onLoad, wrapRow, pricesLoading }: Props) {
  const { t } = useTranslation();
  const sectionId = useId();
  const families = useMemo(
    () => groupCrystals(group.choices.filter((c) => c.mining !== undefined)),
    [group.choices]
  );
  const loaded = group.choices.find((c) => group.loaded.has(c.typeId) && c.mining) ?? null;
  const [open, setOpen] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        families
          .filter((f) => f.crystals.some((c) => group.loaded.has(c.choice.typeId)))
          .map((f) => f.family)
      )
  );
  const toggle = (family: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(family)) next.add(family);
      return next;
    });
  const [helpOpen, setHelpOpen] = useState(false);
  const wrap = (typeId: number, row: ReactNode) => (wrapRow ? wrapRow(typeId, row) : row);

  return (
    <div className="space-y-2">
      <div className="flex min-w-0 items-center gap-2 bg-panel-2 px-2 py-1.5 text-xs">
        {loaded?.mining ? (
          <>
            <TypeIcon typeId={loaded.typeId} size={32} width={20} height={20} />
            <span className="min-w-0 truncate">
              {t('fittings.chargePicker.loaded')}{' '}
              <span className="font-semibold text-accent">{loaded.name}</span>
            </span>
            <span className="ml-auto shrink-0 text-text-dim tabular-nums">
              {t('fittings.crystalGuide.m3PerSecond', { value: m3s(loaded.mining.m3PerSecond) })}
            </span>
          </>
        ) : (
          <span className="text-text-dim">{t('fittings.chargePicker.nothingLoaded')}</span>
        )}
      </div>

      <div className="flex items-center gap-1 px-2 text-[0.6875rem] text-text-dim">
        <span className="min-w-0 flex-1">{t('fittings.crystalGuide.pickHint')}</span>
        <IconButton
          icon={<Icon.NavHelp />}
          size="sm"
          label={t('fittings.crystalGuide.helpButton')}
          onClick={() => setHelpOpen(true)}
        />
      </div>
      <Modal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title={t('fittings.crystalGuide.helpTitle')}
      >
        <div className="space-y-3 text-sm">
          <p className="text-text-dim">{t('fittings.crystalGuide.help.intro')}</p>
          <dl className="space-y-2">
            {HELP_KEYS.map((key) => (
              <div key={key}>
                <dt className="font-semibold">{t(`fittings.crystalGuide.help.${key}Label`)}</dt>
                <dd className="text-text-dim">{t(`fittings.crystalGuide.help.${key}`)}</dd>
              </div>
            ))}
          </dl>
          <p className="text-text-dim">{t('fittings.crystalGuide.help.table')}</p>
        </div>
      </Modal>

      {families.map((family, index) => {
        const isOpen = open.has(family.family);
        // Family names have spaces; an id (and aria-controls' list of them) can't.
        const bodyId = `${sectionId}-family-${index}`;
        const holdsLoaded = family.crystals.some((c) => group.loaded.has(c.choice.typeId));
        return (
          <section key={family.family}>
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={bodyId}
              aria-label={[
                family.ores.length > 0
                  ? `${family.family}: ${family.ores.join(', ')}`
                  : family.family,
                ...(holdsLoaded ? [t('fittings.crystalGuide.familyLoaded')] : []),
              ].join(', ')}
              onClick={() => toggle(family.family)}
              className="flex min-h-11 w-full items-center gap-2 px-2 text-left text-xs hover:bg-panel-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent md:min-h-9"
            >
              <Caret expanded={isOpen} />
              <span className={cx('shrink-0 font-semibold', holdsLoaded && 'text-accent')}>
                {holdsLoaded && <span aria-hidden="true">● </span>}
                {family.family}
              </span>
              <span className="min-w-0 flex-1 truncate text-[0.6875rem] text-text-dim">
                {family.ores.join(', ')}
              </span>
            </button>
            <div id={bodyId} hidden={!isOpen} className="pb-1 pl-6 text-[0.6875rem]">
              {family.ores.length > 0 && (
                <p className="px-1 pb-1 text-text-dim">
                  {t('fittings.crystalGuide.cutFor', { ores: family.ores.join(', ') })}
                </p>
              )}
              <div className={cx('grid gap-1 px-1 pb-1 text-text-dim', COLUMNS)}>
                <span>{t('fittings.crystalGuide.colCrystal')}</span>
                <span className="text-right">{t('fittings.crystalGuide.colYield')}</span>
                <span className="text-right">{t('fittings.crystalGuide.colCycle')}</span>
                <span className="text-right" title={t('fittings.crystalGuide.colResidueTitle')}>
                  {t('fittings.crystalGuide.colResidue')}
                </span>
                <span className="text-right">{t('fittings.capGuide.colIsk')}</span>
              </div>
              {family.crystals.map((crystal) => {
                const { choice } = crystal;
                const mining = choice.mining!;
                const isLoaded = group.loaded.has(choice.typeId);
                return (
                  <Fragment key={choice.typeId}>
                    {wrap(
                      choice.typeId,
                      <button
                        type="button"
                        disabled={!onLoad || choice.skillMissing}
                        onClick={() => onLoad?.(choice.typeId)}
                        aria-pressed={isLoaded}
                        aria-label={rowLabel(t, crystal)}
                        className={cx(
                          'grid w-full gap-1 border-t border-line px-1 py-1 text-left tabular-nums hover:bg-panel-2 disabled:cursor-not-allowed',
                          COLUMNS,
                          choice.skillMissing && 'opacity-50'
                        )}
                      >
                        <span className={cx('truncate', isLoaded && 'text-accent')}>
                          {isLoaded && '● '}
                          {t('fittings.crystalGuide.typeName', {
                            letter: crystal.letter,
                            tier: crystal.techLevel === 2 ? 'II' : 'I',
                          })}
                        </span>
                        <span className="text-right">{m3s(mining.m3PerSecond)}</span>
                        <span className="text-right">{formatSeconds(mining.cycleSeconds)}</span>
                        <span className="text-right">{m3s(mining.residueM3s)}</span>
                        <span className="text-right">
                          {choice.price === null ? '—' : formatIsk(choice.price)}
                        </span>
                        {choice.skillMissing && (
                          <span className="col-span-full text-text-dim">
                            {t('fittings.chargePicker.needsSkill')}
                          </span>
                        )}
                      </button>
                    )}
                  </Fragment>
                );
              })}
            </div>
          </section>
        );
      })}

      <p className="text-[0.6875rem] text-text-dim">
        {t('fittings.crystalGuide.hint', { count: group.count })}
        {pricesLoading && ` ${t('fittings.chargePicker.pricesLoading')}`}
      </p>
    </div>
  );
}
