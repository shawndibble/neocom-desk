import { useContext } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Button, IconButton, IskAmount, Spinner, TypeIcon } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import {
  displayValue,
  headroom,
  shortfall,
  type GoalContext,
  type ImplantGoal,
  type ImplantKind,
} from '@/engine/fittings/implantFinder';
import { alternativeSource, type Source } from '@/engine/fittings/implantSources';
import type { FittingStats } from '@/engine/fittings/types';
import { getTradeHub } from '@/market/hubs';
import { type FamilyResult, type FixResult, type GradeResult } from './useImplantFinder';
import { SourceNames } from './implantSourceNames';
import { fmt } from './implantFinderFormat';
import { SectionHeading, SuccessBadge } from './implantFinderBits';

interface GoalResultsProps {
  goal: ImplantGoal;
  /** Nothing on this Fitting uses the goal, so no item moves it. */
  off: boolean;
  baseline: FittingStats;
  context: GoalContext;
  results: FamilyResult[] | null;
  fixes: FixResult[];
  /** The slot picked on the strip, when `results` and `fixes` are narrowed to it. */
  slot: { kind: ImplantKind; label: string } | null;
  hubId: string;
  nameOf: (typeId: number) => string;
  /** The shown results are from before the last change; their buttons wait for the new ones. */
  busy: boolean;
  onBack: () => void;
  onAdd: (typeIds: readonly number[]) => void;
  onRemove: (typeId: number) => void;
  onInfo: (typeId: number) => void;
}

/** What an item (or a fix) does to the goal, and whether that's good news. */
interface Effect {
  text: string;
  fits: boolean;
}

export function GoalResults({
  goal,
  off,
  baseline,
  context,
  results,
  fixes,
  slot,
  hubId,
  nameOf,
  busy,
  onBack,
  onAdd,
  onRemove,
  onInfo,
}: GoalResultsProps) {
  const { t } = useTranslation();
  const { decimals } = goal.display;
  const unit = t(`fittings.implantFinder.unit.${goal.id}`);
  const label = t(`fittings.implantFinder.goals.${goal.id}`);
  const hubName = (id: string) => getTradeHub(id)?.systemName ?? id;
  const n = (value: number) => fmt(value, decimals);

  function effect(after: FittingStats): Effect {
    if (goal.kind === 'budget') {
      const budget = goal.read(after);
      const over = shortfall(budget);
      return over > 0
        ? { text: t('fittings.implantFinder.stillOver', { value: n(over), unit }), fits: false }
        : {
            text: t('fittings.implantFinder.fitsSpare', { value: n(headroom(budget)), unit }),
            fits: true,
          };
    }
    const before = displayValue(goal, baseline, context);
    const now = displayValue(goal, after, context);
    const pct = before === 0 ? 0 : ((now - before) / Math.abs(before)) * 100;
    return {
      text: t('fittings.implantFinder.delta', {
        before: n(before),
        after: n(now),
        unit,
        pct: `${pct >= 0 ? '+' : '−'}${fmt(Math.abs(pct), 1)}%`,
      }),
      fits: true,
    };
  }

  const budget = goal.kind === 'budget' ? goal.read(baseline) : null;
  const over = budget ? shortfall(budget) : 0;
  const firstFix = fixes[0];
  const implants = (results ?? []).filter((r) => r.family.kind === 'implant');
  const boosters = (results ?? []).filter((r) => r.family.kind === 'booster');

  const familyList = (list: FamilyResult[]) => (
    <ul className="space-y-2">
      {list.map(({ family, grades }) => {
        const lowest = family.grades[0]!;
        const highest = family.grades[family.grades.length - 1]!;
        return (
          <li key={family.key} className="space-y-1 rounded-xs border border-line bg-panel-2 p-2.5">
            <div className="flex items-start gap-2">
              <TypeIcon typeId={highest.typeId} size={32} width={28} height={28} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{family.name}</p>
                <p className="text-xs text-text-dim">
                  {family.grades.length > 1
                    ? t(
                        family.kind === 'booster'
                          ? 'fittings.implantFinder.boosterSlotGrades'
                          : 'fittings.implantFinder.slotGrades',
                        { slot: family.slot, low: lowest.code, high: highest.code }
                      )
                    : t(
                        family.kind === 'booster'
                          ? 'fittings.implantFinder.boosterSlotLong'
                          : 'fittings.implantFinder.slot',
                        { slot: family.slot }
                      )}
                </p>
              </div>
            </div>
            <ul>
              {grades.map((row) => {
                const rowEffect = effect(row.stats);
                return (
                  <GradeRow
                    key={row.grade.typeId}
                    row={row}
                    name={nameOf(row.grade.typeId)}
                    effect={rowEffect}
                    fixesIt={over > 0 && rowEffect.fits && !row.inSet}
                    replacesName={row.replaces === null ? null : nameOf(row.replaces)}
                    busy={busy}
                    onAdd={(id) => onAdd([id])}
                    onRemove={onRemove}
                    onInfo={onInfo}
                  />
                );
              })}
            </ul>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      <div className="space-y-1">
        <Button variant="ghost" size="sm" onClick={onBack} className="md:hidden">
          <Icon.Back aria-hidden />
          {t('fittings.implantFinder.back')}
        </Button>
        <h3 className="text-base font-semibold">{label}</h3>
        {!off && (
          <p className="text-sm text-text-dim tabular-nums">
            {budget
              ? t(
                  over > 0
                    ? 'fittings.implantFinder.budgetOver'
                    : 'fittings.implantFinder.budgetSpare',
                  {
                    used: n(budget.used),
                    total: n(budget.total),
                    value: n(over > 0 ? over : headroom(budget)),
                    unit,
                  }
                )
              : `${n(displayValue(goal, baseline, context))} ${unit}`}
          </p>
        )}
        {budget && (
          <div className="relative h-2.5 rounded-xs border border-line bg-panel-2" aria-hidden>
            <div
              className={cx('absolute inset-y-0 left-0', over > 0 ? 'bg-danger' : 'bg-success')}
              style={{
                width: `${(budget.used / Math.max(budget.used, budget.total) / 1.08) * 100}%`,
              }}
            />
            <div
              className="absolute -inset-y-1 w-0.5 bg-text"
              style={{
                left: `${(budget.total / Math.max(budget.used, budget.total) / 1.08) * 100}%`,
              }}
            />
          </div>
        )}
      </div>

      {off && (
        <p className="rounded-xs border border-dashed border-line p-4 text-sm text-text-dim">
          {t('fittings.implantFinder.offGoal', { goal: label.toLowerCase() })}
        </p>
      )}

      {firstFix && (
        <div className="space-y-1.5">
          <SectionHeading>{t('fittings.implantFinder.fixesHeading')}</SectionHeading>
          <ul className="space-y-1.5">
            {fixes.map((fix, i) => (
              <li
                key={fix.typeIds.join('+')}
                className={cx(
                  'flex flex-col gap-2 rounded-xs border p-2.5 sm:flex-row sm:items-center',
                  i === 0 ? 'border-success/50 bg-success/5' : 'border-line bg-panel-2'
                )}
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">
                      {fix.typeIds.map((id) => nameOf(id)).join(' + ')}
                    </span>
                    {i === 0 ? (
                      <SuccessBadge>{t('fittings.implantFinder.cheapest')}</SuccessBadge>
                    ) : (
                      <span className="text-xs text-text-dim">
                        <Trans
                          i18nKey="fittings.implantFinder.moreHeadroom"
                          values={{ value: n(fix.headroom - firstFix.headroom), unit }}
                          components={{
                            cost: <IskAmount value={fix.cost - firstFix.cost} />,
                          }}
                        />
                      </span>
                    )}
                  </p>
                  <ul className="space-y-0.5">
                    {fix.sources.map((source, k) => (
                      <li key={fix.typeIds[k]} className="text-xs text-text-dim">
                        <span className="text-text">{nameOf(fix.typeIds[k]!)}:</span>{' '}
                        <ImplantSourceLine source={source} />
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-success tabular-nums">{effect(fix.stats).text}</p>
                </div>
                <span className="font-semibold whitespace-nowrap tabular-nums">
                  <Trans
                    i18nKey="fittings.implantFinder.isk"
                    components={{ value: <IskAmount value={fix.cost} /> }}
                  />
                </span>
                <Button variant="primary" disabled={busy} onClick={() => onAdd(fix.typeIds)}>
                  {fix.typeIds.length > 1
                    ? t('fittings.implantFinder.addAll')
                    : t('fittings.implantFinder.add')}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!off && slot && results?.length === 0 && (
        <p className="text-sm text-text-dim">
          {t('fittings.implantFinder.slotNoHelpersForGoal', { slot: slot.label, goal: label })}
        </p>
      )}

      {/* A booster slot has no implants to list; still loading (null) shows the spinner. */}
      {!off && (!slot || (slot.kind === 'implant' && results?.length !== 0)) && (
        <div className="space-y-1.5">
          <SectionHeading>{t('fittings.implantFinder.helpersHeading')}</SectionHeading>
          {results === null ? (
            <p className="flex items-center gap-2 text-sm text-text-dim">
              <Spinner size="sm" />
              {t('fittings.implantFinder.loadingGrades')}
            </p>
          ) : implants.length === 0 ? (
            <p className="text-sm text-text-dim">{t('fittings.implantFinder.nothingHelps')}</p>
          ) : (
            familyList(implants)
          )}
        </div>
      )}

      {boosters.length > 0 && (
        <div className="space-y-1.5">
          <SectionHeading>{t('fittings.implantFinder.boostersHeading')}</SectionHeading>
          <p className="text-xs text-text-dim">{t('fittings.implantFinder.boosterSideEffects')}</p>
          {familyList(boosters)}
        </div>
      )}

      <p className="text-xs text-text-dim">
        {t('fittings.implantFinder.pricedAt', { hub: hubName(hubId) })}
      </p>
    </>
  );
}

/** How a source line names a Trade Hub and a turn-in — resolved once for the whole window. */

/** Where one item comes from, in a line: a hub's sell orders, or an LP Store offer and what it takes. */
function ImplantSourceLine({ source }: { source: Source }) {
  const { t } = useTranslation();
  const { hubName, itemName } = useContext(SourceNames);

  if (source.kind === 'market') {
    return (
      <Trans
        i18nKey={
          source.atSelectedHub
            ? 'fittings.implantFinder.sourceHub'
            : 'fittings.implantFinder.sourceOther'
        }
        count={source.volume}
        values={{ hub: hubName(source.hubId) }}
        components={{ price: <IskAmount value={source.price} decimals={0} /> }}
      />
    );
  }
  const tags = source.turnIns
    .map((ti) =>
      t('fittings.implantFinder.turnIn', { count: ti.quantity, name: itemName(ti.typeId) })
    )
    .join(', ');
  const status: string[] = [];
  if (source.lpShort > 0) {
    status.push(t('fittings.implantFinder.lpShort', { lp: fmt(source.lpShort, 0) }));
  }
  for (const ti of source.unbuyable) {
    status.push(
      t('fittings.implantFinder.turnInUnbuyable', { count: ti.toBuy, name: itemName(ti.typeId) })
    );
  }
  for (const ti of source.turnIns.filter((x) => x.toBuy > 0 && x.unitPrice !== null)) {
    status.push(
      t('fittings.implantFinder.turnInToBuy', {
        count: ti.toBuy,
        name: itemName(ti.typeId),
        isk: fmt(ti.toBuy * ti.unitPrice!, 0),
      })
    );
  }
  // An unreadable LP balance is said once, in the toolbar — not on every offer.
  return (
    <>
      <Trans
        i18nKey={
          tags ? 'fittings.implantFinder.sourceLpWithTags' : 'fittings.implantFinder.sourceLp'
        }
        values={{ corp: source.corpName, lp: fmt(source.lpCost, 0), tags }}
        components={{ isk: <IskAmount value={source.iskCost} decimals={0} /> }}
      />{' '}
      {source.cost === null ? (
        t('fittings.implantFinder.lpUnpriced')
      ) : (
        <Trans
          i18nKey="fittings.implantFinder.lpTotal"
          values={{ rate: fmt(source.lpRate ?? 0, 0) }}
          components={{ total: <IskAmount value={source.cost} decimals={0} /> }}
        />
      )}
      {status.length > 0 && (
        <span
          className={cx(
            'mt-0.5 flex items-center gap-1',
            source.blocked ? 'text-warning' : 'text-text-dim'
          )}
        >
          {source.blocked && <Icon.Warn aria-hidden className="shrink-0" />}
          {status.join(' · ')}
        </span>
      )}
    </>
  );
}

function GradeRow({
  row,
  name,
  effect,
  fixesIt,
  replacesName,
  busy,
  onAdd,
  onRemove,
  onInfo,
}: {
  row: GradeResult;
  name: string;
  effect: Effect;
  fixesIt: boolean;
  replacesName: string | null;
  busy: boolean;
  onAdd: (typeId: number) => void;
  onRemove: (typeId: number) => void;
  onInfo: (typeId: number) => void;
}) {
  const { t } = useTranslation();
  const { best, sources } = row;
  // What the pilot can buy now; failing that, the best way there is, warnings and all.
  const shown = best ?? sources?.[0] ?? null;
  const alt = sources && shown ? alternativeSource(sources, shown) : null;
  const action = row.inSet
    ? t('fittings.implantFinder.remove')
    : row.replaces !== null
      ? t('fittings.implantFinder.replace')
      : t('fittings.implantFinder.add');
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-1.5">
      <span className="flex w-28 items-center gap-1">
        <IconButton
          variant="plain"
          size="row"
          icon={<Icon.Info />}
          label={t('fittings.implantFinder.info', { name })}
          onClick={() => onInfo(row.grade.typeId)}
        />
        <span className="font-semibold tabular-nums">{row.grade.code}</span>
      </span>
      {fixesIt && <SuccessBadge>{t('fittings.implantFinder.fixesIt')}</SuccessBadge>}
      <span
        className={cx(
          'min-w-40 flex-1 text-xs tabular-nums',
          effect.fits ? 'text-success' : 'text-warning'
        )}
      >
        {effect.text}
      </span>
      <span
        className={cx(
          'basis-full text-xs tabular-nums sm:basis-72',
          shown?.kind === 'market' && !shown.atSelectedHub ? 'text-warning' : 'text-text'
        )}
      >
        {sources === null ? (
          <span className="text-text-dim">{t('fittings.implantFinder.findingSources')}</span>
        ) : shown ? (
          <ImplantSourceLine source={shown} />
        ) : (
          <span className="text-text-dim">{t('fittings.implantFinder.noSource')}</span>
        )}
        {alt && (
          <span className="mt-0.5 block text-[0.6875rem] text-text-dim">
            {alt.cheaperIfYouCould
              ? t('fittings.implantFinder.cheaperIfYouCould')
              : t('fittings.implantFinder.or')}{' '}
            <ImplantSourceLine source={alt.source} />
          </span>
        )}
        {replacesName && !row.inSet && (
          <span className="block text-text-dim">
            {t('fittings.implantFinder.replaces', { name: replacesName })}
          </span>
        )}
      </span>
      <Button
        variant={row.inSet ? 'ghost' : 'primary'}
        disabled={busy}
        aria-label={t('fittings.implantFinder.actionLabel', { action, name })}
        onClick={() => (row.inSet ? onRemove(row.grade.typeId) : onAdd(row.grade.typeId))}
        className="ml-auto min-w-20"
      >
        {action}
      </Button>
    </li>
  );
}
