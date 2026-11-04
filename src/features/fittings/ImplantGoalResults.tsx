import { useContext, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Button,
  IconButton,
  IskAmount,
  SegmentedControl,
  Spinner,
  TypeIcon,
} from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
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
import {
  IMPLANT_SORTS,
  costPerGain,
  orderBy,
  savingBetween,
  type ImplantSort,
} from '@/engine/fittings/implantCost';
import { alternativeSource, type Source } from '@/engine/fittings/implantSources';
import type { FittingStats } from '@/engine/fittings/types';
import { marketLinkParams } from '@/engine/market/urlState';
import { lpStorePath } from '@/features/loyalty/lpStorePath';
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
  /** What an item would displace in the set right now; null when its slot is empty. */
  replacesOf: (typeId: number) => number | null;
  sort: ImplantSort;
  onSort: (sort: ImplantSort) => void;
}

/** What an item (or a fix) does to the goal, and whether that's good news. */
interface Effect {
  text: string;
  fits: boolean;
  /** How much it moves the goal: percent for a figure, units of budget freed for CPU / powergrid. */
  gain: number;
  /** What `gain` is counted in, for a cost per gain. */
  gainUnit: 'pct' | 'unit';
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
  replacesOf,
  sort,
  onSort,
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
      const freed = Math.max(0, goal.read(baseline).used - budget.used);
      return over > 0
        ? {
            text: t('fittings.implantFinder.stillOver', { value: n(over), unit }),
            fits: false,
            gain: freed,
            gainUnit: 'unit',
          }
        : {
            text: t('fittings.implantFinder.fitsSpare', { value: n(headroom(budget)), unit }),
            fits: true,
            gain: freed,
            gainUnit: 'unit',
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
      gain: pct,
      gainUnit: 'pct',
    };
  }

  const budget = goal.kind === 'budget' ? goal.read(baseline) : null;
  const over = budget ? shortfall(budget) : 0;
  const firstFix = fixes[0];
  const implants = (results ?? []).filter((r) => r.family.kind === 'implant');
  const boosters = (results ?? []).filter((r) => r.family.kind === 'booster');

  /** What it costs the pilot to get a grade: the source shown for it, else nothing known. */
  const costOf = (row: GradeResult) => (row.best ?? row.sources?.[0] ?? null)?.cost ?? null;
  const perGainOf = (row: GradeResult) => {
    const e = effect(row.stats);
    return costPerGain(costOf(row), e.gain);
  };
  const lowest = (values: (number | null)[]) =>
    values.reduce<number | null>(
      (min, v) => (v === null || (min !== null && min <= v) ? min : v),
      null
    );
  const sorted = (list: FamilyResult[]) =>
    sort === 'gain'
      ? list
      : orderBy(list, ({ grades }) =>
          lowest(grades.filter((g) => !g.inSet).map(sort === 'cost' ? costOf : perGainOf))
        );

  const familyList = (unsorted: FamilyResult[]) => (
    <ul className="grid items-start gap-2 @3xl:grid-cols-2">
      {sorted(unsorted).map(({ family, grades }) => {
        const highest = family.grades[family.grades.length - 1]!;
        // Every grade usually displaces the same item: say so once, not on each row.
        const displaced = new Set(
          grades.filter((row) => row.replaces !== null && !row.inSet).map((row) => row.replaces)
        );
        const sharedReplaces = displaced.size === 1 ? [...displaced][0]! : null;
        // One grade: its action sits in the header, so the row below gets the whole width.
        const single = grades.length === 1 ? grades[0]! : null;
        return (
          <li key={family.key} className="space-y-1 rounded-xs border border-line bg-panel-2 p-2.5">
            <div className="flex items-start gap-2">
              <TypeIcon typeId={highest.typeId} size={32} width={28} height={28} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{family.name}</p>
                <p className="flex flex-wrap items-baseline gap-x-1.5 text-xs text-text-dim">
                  <span>
                    {t(
                      family.kind === 'booster'
                        ? 'fittings.implantFinder.boosterSlotLong'
                        : 'fittings.implantFinder.slot',
                      { slot: family.slot }
                    )}
                  </span>
                  {sharedReplaces !== null && (
                    <ReplacesLine
                      typeId={sharedReplaces}
                      name={nameOf(sharedReplaces)}
                      onInfo={onInfo}
                    />
                  )}
                </p>
              </div>
              {single && (
                <GradeAction
                  row={single}
                  name={nameOf(single.grade.typeId)}
                  busy={busy}
                  onAdd={(id) => onAdd([id])}
                  onRemove={onRemove}
                />
              )}
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
                    replacesName={
                      row.replaces === null || sharedReplaces !== null ? null : nameOf(row.replaces)
                    }
                    inHeader={single !== null}
                    perGain={perGainOf(row)}
                    gainUnit={rowEffect.gainUnit}
                    unit={unit}
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

  /** ↑ / ↓ walk the Replace / Add buttons down the list, so a pilot can run it from the keyboard. */
  function moveBetweenActions(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const from = (event.target as HTMLElement).closest<HTMLElement>('[data-implant-action]');
    if (!from) return;
    const all = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-implant-action]')];
    const next = all[all.indexOf(from) + (event.key === 'ArrowDown' ? 1 : -1)];
    if (!next) return;
    event.preventDefault();
    next.focus();
    next.scrollIntoView({ block: 'nearest' });
  }

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
          <ul className="space-y-3">
            {fixes.map((fix, i) => (
              <li
                key={fix.typeIds.join('+')}
                className={cx(
                  'relative rounded-xs border bg-panel-2 p-2.5',
                  i === 0 ? 'mt-3 border-success/60' : 'border-line'
                )}
              >
                {i === 0 && (
                  // Opaque under the badge, so the card's border does not show through it.
                  <span className="absolute -top-2 left-2 rounded-xs bg-panel-2">
                    <SuccessBadge>{t('fittings.implantFinder.cheapest')}</SuccessBadge>
                  </span>
                )}
                <ul className="space-y-2">
                  {fix.typeIds.map((id, k) => (
                    <li key={id} className="flex items-start gap-2.5">
                      <TypeIcon typeId={id} size={32} width={32} height={32} />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{nameOf(id)}</p>
                        <div className="text-xs text-text-dim">
                          <SourceRow source={fix.sources[k]!} />
                          {replacesOf(id) !== null && (
                            <p className="mt-0.5">
                              <ReplacesLine
                                typeId={replacesOf(id)!}
                                name={nameOf(replacesOf(id)!)}
                                onInfo={onInfo}
                              />
                            </p>
                          )}
                          <SourceLinks typeId={id} sources={[fix.sources[k]!]} />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-line pt-2">
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-medium text-success tabular-nums">
                      {effect(fix.stats).text}
                    </p>
                    {i > 0 && (
                      <p className="text-xs text-text-dim">
                        <Trans
                          i18nKey="fittings.implantFinder.moreHeadroom"
                          values={{ value: n(fix.headroom - firstFix.headroom), unit }}
                          components={{
                            cost: <IskAmount value={fix.cost - firstFix.cost} />,
                          }}
                        />
                      </p>
                    )}
                  </div>
                  <div className="ml-auto flex items-center gap-3">
                    <span className="font-semibold whitespace-nowrap tabular-nums">
                      <Trans
                        i18nKey="fittings.implantFinder.isk"
                        components={{ value: <IskAmount value={fix.cost} /> }}
                      />
                    </span>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={busy}
                      onClick={() => onAdd(fix.typeIds)}
                    >
                      {fix.typeIds.length > 1
                        ? t('fittings.implantFinder.addAll')
                        : t('fittings.implantFinder.add')}
                    </Button>
                  </div>
                </div>
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

      <div className="space-y-3" onKeyDown={moveBetweenActions}>
        {!off && (implants.length > 1 || boosters.length + implants.length > 1) && (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <SegmentedControl<ImplantSort>
              label={t('fittings.implantFinder.sortLabel')}
              size="sm"
              uppercase={false}
              value={sort}
              onChange={onSort}
              options={IMPLANT_SORTS.map((value) => ({
                value,
                label: t(`fittings.implantFinder.sort${value[0]!.toUpperCase()}${value.slice(1)}`),
              }))}
            />
            <span className="hidden text-xs text-text-dim md:inline">
              {t('fittings.implantFinder.keyHint')}
            </span>
          </div>
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
            <p className="text-xs text-text-dim">
              {t('fittings.implantFinder.boosterSideEffects')}
            </p>
            {familyList(boosters)}
          </div>
        )}
      </div>

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

/** "Replaces <item>": the item's name opens its details, so the pilot can judge what they'd lose. */
function ReplacesLine({
  typeId,
  name,
  onInfo,
}: {
  typeId: number;
  name: string;
  onInfo: (typeId: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <span>
      {t('fittings.implantFinder.replacesLabel')}{' '}
      <button
        type="button"
        aria-label={t('fittings.implantFinder.info', { name })}
        onClick={() => onInfo(typeId)}
        className={inlineLinkClassName}
      >
        {name}
      </button>
    </span>
  );
}

/** The one action a grade offers: Replace or Add (primary) or Remove (ghost). */
function GradeAction({
  row,
  name,
  busy,
  onAdd,
  onRemove,
}: {
  row: GradeResult;
  name: string;
  busy: boolean;
  onAdd: (typeId: number) => void;
  onRemove: (typeId: number) => void;
}) {
  const { t } = useTranslation();
  const action = row.inSet
    ? t('fittings.implantFinder.remove')
    : row.replaces !== null
      ? t('fittings.implantFinder.replace')
      : t('fittings.implantFinder.add');
  return (
    <Button
      variant={row.inSet ? 'ghost' : 'primary'}
      size="sm"
      disabled={busy}
      aria-label={t('fittings.implantFinder.actionLabel', { action, name })}
      data-implant-action=""
      onClick={() => (row.inSet ? onRemove(row.grade.typeId) : onAdd(row.grade.typeId))}
      className="ml-auto min-w-20 shrink-0"
    >
      {action}
    </Button>
  );
}

/** One way to get an item. A market source is one line; an LP offer is a one-line price with its full breakdown a click away. */
function SourceRow({ source, badge }: { source: Source; badge?: ReactNode }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (source.kind === 'market') {
    return (
      <span className="block">
        <ImplantSourceLine source={source} /> {badge}
      </span>
    );
  }
  const short =
    source.lpShort > 0 ? t('fittings.implantFinder.lpShort', { lp: fmt(source.lpShort, 0) }) : null;
  return (
    <span className="block">
      <span className="flex flex-wrap items-baseline gap-x-2">
        {source.cost === null ? (
          t('fittings.implantFinder.sourceLpSummaryUnpriced', { corp: source.corpName })
        ) : (
          <Trans
            i18nKey="fittings.implantFinder.sourceLpSummary"
            values={{ corp: source.corpName }}
            components={{ total: <IskAmount value={source.cost} decimals={0} /> }}
          />
        )}
        {short && (
          <span className={cx('inline-flex items-center gap-1', source.blocked && 'text-warning')}>
            {source.blocked && <Icon.Warn aria-hidden className="shrink-0" />}
            {short}
          </span>
        )}
        {badge}
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={cx(inlineLinkClassName, 'text-[0.6875rem]')}
        >
          {open
            ? t('fittings.implantFinder.lpBreakdownHide')
            : t('fittings.implantFinder.lpBreakdown')}
        </button>
      </span>
      {open && (
        <span className="mt-0.5 block border-l-2 border-line pl-2 text-[0.6875rem] text-text-dim">
          <ImplantSourceLine source={source} />
        </span>
      )}
    </span>
  );
}

/** "Saves X": on the cheaper of two sources, in warning tone when the pilot can't redeem it yet. */
function SavingBadge({ saving, blocked }: { saving: number; blocked: boolean }) {
  return (
    <span
      className={cx(
        'rounded-xs border px-1 text-[0.625rem] font-semibold tabular-nums',
        blocked ? 'border-warning/60 text-warning' : 'border-success/60 text-success'
      )}
    >
      <Trans
        i18nKey={blocked ? 'fittings.implantFinder.savesIfLp' : 'fittings.implantFinder.saves'}
        components={{ isk: <IskAmount value={saving} decimals={0} /> }}
      />
    </span>
  );
}

/** Where to see an item's sources: the market on the hub the shown price is from, each LP Store on its offer. */
function SourceLinks({ typeId, sources }: { typeId: number; sources: readonly (Source | null)[] }) {
  const { t } = useTranslation();
  const market = sources.find((source) => source?.kind === 'market');
  const lpStores = sources.filter(
    (source): source is Extract<Source, { kind: 'lp' }> => source?.kind === 'lp'
  );
  if (!market && lpStores.length === 0) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-x-3 text-xs">
      {market && (
        <Link
          to={`/market/browser?${new URLSearchParams(
            marketLinkParams(typeId, '', market.kind === 'market' ? market.hubId : undefined)
          ).toString()}`}
          className={inlineLinkClassName}
        >
          {t('fittings.implantFinder.openMarket')}
        </Link>
      )}
      {lpStores.map((source) => (
        <Link
          key={`${source.corporationId}-${source.offerId ?? ''}`}
          to={lpStorePath(source.corporationId, source.offerId)}
          className={inlineLinkClassName}
        >
          {t('fittings.implantFinder.openLpStore', { corp: source.corpName })}
        </Link>
      ))}
    </span>
  );
}

function GradeRow({
  row,
  name,
  effect,
  fixesIt,
  replacesName,
  inHeader,
  perGain,
  gainUnit,
  unit,
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
  /** The card's header already carries this grade's action. */
  inHeader: boolean;
  /** ISK per unit of gain; null without a price. */
  perGain: number | null;
  gainUnit: 'pct' | 'unit';
  unit: string;
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
  const saving = shown && alt ? savingBetween(shown, alt.source) : null;
  const badgeFor = (source: Source) =>
    saving?.cheaper === source ? (
      <SavingBadge saving={saving.saving} blocked={source.kind === 'lp' && source.blocked} />
    ) : undefined;
  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-1 border-t border-line py-1.5">
      <span className="flex min-w-44 items-start gap-1 md:w-52 md:shrink-0 md:flex-col md:gap-0.5">
        <span className="flex items-center gap-1">
          <IconButton
            variant="plain"
            size="row"
            icon={<Icon.Info />}
            label={t('fittings.implantFinder.info', { name })}
            onClick={() => onInfo(row.grade.typeId)}
          />
          {!inHeader && <span className="font-semibold tabular-nums">{row.grade.code}</span>}
          <span
            className={cx('text-xs tabular-nums', effect.fits ? 'text-success' : 'text-warning')}
          >
            {effect.text}
          </span>
        </span>
        {perGain !== null && !row.inSet && (
          <span className="pl-1 text-[0.6875rem] text-text-dim tabular-nums">
            <Trans
              i18nKey={
                gainUnit === 'pct'
                  ? 'fittings.implantFinder.perPercent'
                  : 'fittings.implantFinder.perUnit'
              }
              values={{ unit }}
              components={{ isk: <IskAmount value={perGain} decimals={0} /> }}
            />
          </span>
        )}
        {fixesIt && <SuccessBadge>{t('fittings.implantFinder.fixesIt')}</SuccessBadge>}
      </span>
      <span
        className={cx(
          'min-w-0 flex-1 basis-full space-y-0.5 text-xs tabular-nums sm:basis-72',
          shown?.kind === 'market' && !shown.atSelectedHub ? 'text-warning' : 'text-text'
        )}
      >
        {sources === null ? (
          <span className="text-text-dim">{t('fittings.implantFinder.findingSources')}</span>
        ) : shown ? (
          <SourceRow source={shown} badge={badgeFor(shown)} />
        ) : (
          <span className="text-text-dim">{t('fittings.implantFinder.noSource')}</span>
        )}
        {alt && (
          <span className="block text-text-dim">
            {t('fittings.implantFinder.also')}:{' '}
            <SourceRow source={alt.source} badge={badgeFor(alt.source)} />
          </span>
        )}
        {replacesName && !row.inSet && row.replaces !== null && (
          <span className="block text-text-dim">
            <ReplacesLine typeId={row.replaces} name={replacesName} onInfo={onInfo} />
          </span>
        )}
        <SourceLinks typeId={row.grade.typeId} sources={[shown, alt?.source ?? null]} />
      </span>
      {!inHeader && (
        <GradeAction row={row} name={name} busy={busy} onAdd={onAdd} onRemove={onRemove} />
      )}
    </li>
  );
}
