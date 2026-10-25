/**
 * "Find by goal": the pilot says what they want better — CPU, missiles,
 * speed — and every implant and booster that moves it on this Fitting is
 * listed with what each grade does and where to get it: a Trade Hub, or an
 * LP Store with the pilot's LP and tags checked. When the Fitting is over
 * CPU or powergrid, the cheapest ways back under budget come first.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton, SearchInput, Spinner, TypeIcon } from '@/components/ui';
import {
  focusRingInsetClassName,
  rowInteractiveClassName,
  selectedRowClassName,
} from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { ItemInfoLink } from '@/features/entities';
import { cx } from '@/lib/cx';
import {
  goalById,
  headroom,
  placeAllInSet,
  shortfall,
  type GoalGroup,
  type ImplantGoal,
  type ImplantGoalId,
  type ImplantKind,
} from '@/engine/fittings/implantFinder';
import { withBoosters } from '@/engine/fittings/boosterSideEffects';
import type { ImplantBasis } from '@/engine/fittings/implantBasis';
import type {
  Fitting,
  FittingImplantSet,
  FittingStats,
  PilotProfile,
} from '@/engine/fittings/types';
import { useMarketHub } from '@/features/market/hub';
import { ItemDetailModal } from '@/features/market/ItemDetailModal';
import { getTradeHub } from '@/market/hubs';
import { useActiveCharacter } from '@/stores/activeCharacter';
import type { ImplantPurchase } from './implantPurchase';
import { PriceHubSelect } from './PriceHubSelect';
import { useTargetProfiles } from './targetProfiles';
import { implantNames, slotKey, useImplantFinder, type GoalSummary } from './useImplantFinder';
import { fmt } from './implantFinderFormat';
import { SectionHeading } from './implantFinderBits';
import { GoalResults } from './ImplantGoalResults';
import { SourceNames } from './implantSourceNames';
import { SetStrip } from './ImplantSetStrip';
import { occupantOf, parseSlotKey, slotName } from './implantSlots';

const GROUPS: readonly GoalGroup[] = ['fitting', 'weapons', 'mining', 'tank', 'navigation'];
const EMPTY_SET: FittingImplantSet = { implants: [], boosters: [] };

interface ImplantFinderProps {
  open: boolean;
  fitting: Fitting;
  profile: PilotProfile;
  /** Which implants the page's own numbers use; the finder always works on the Fitting's set. */
  basis: ImplantBasis;
  implantSet: FittingImplantSet | undefined;
  onChange: (implantSet: FittingImplantSet | undefined) => void;
}

export function ImplantFinder({
  open,
  fitting,
  profile,
  basis,
  implantSet,
  onChange,
}: ImplantFinderProps) {
  const { t } = useTranslation();
  const hubId = useMarketHub((state) => state.value);
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const { selected: target } = useTargetProfiles();
  const [goalId, setGoalId] = useState<ImplantGoalId | null>(null);
  /** The slot picked on the strip (`slotKey`): goals and results narrow to what goes in it. */
  const [slot, setSlot] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [infoTypeId, setInfoTypeId] = useState<number | null>(null);
  const finder = useImplantFinder({
    open,
    fitting,
    profile,
    goalId,
    hubId,
    characterId,
    target,
  });
  const { baseline, catalog } = finder;
  const set = implantSet ?? EMPTY_SET;

  const label = (id: ImplantGoalId) => t(`fittings.implantFinder.goals.${id}`);

  /** Every item's full name with its grade, for fix options, the set strip and button labels. */
  const names = useMemo(() => implantNames(catalog?.families ?? []), [catalog]);
  const nameOf = (id: number) => names.get(id)?.full ?? `#${id}`;

  function addAll(typeIds: readonly number[]) {
    if (catalog) onChange(placeAllInSet(set, catalog.slotOf, typeIds));
  }
  function remove(typeId: number) {
    onChange(
      set.boosters.includes(typeId)
        ? withBoosters(
            set,
            set.boosters.filter((id) => id !== typeId)
          )
        : { ...set, implants: set.implants.filter((id) => id !== typeId) }
    );
  }

  const q = query.trim().toLowerCase();
  const visible = finder.goals.filter(
    ({ goal, slots }) =>
      (!q || label(goal.id).toLowerCase().includes(q)) &&
      // The open goal stays put, so picking a slot never pulls it out from under the pilot.
      (slot === null || slots.has(slot) || goal.id === goalId)
  );
  /** How far over budget a goal is; 0 for one that fits or isn't a budget. */
  const overBy = (g: ImplantGoal) =>
    baseline && g.kind === 'budget' ? shortfall(g.read(baseline)) : 0;
  const problems = visible.filter(({ goal }) => overBy(goal) > 0);
  const offered = visible.filter(({ goal, used }) => overBy(goal) === 0 && used);
  const notOnFit = visible.filter(({ used }) => !used);
  const goal = goalId ? goalById(goalId) : null;
  const goalIsOff = finder.goals.some((g) => g.goal.id === goalId && !g.used);

  /** Slots an item that helps the selected goal could go in, for the set strip. */
  const helpfulSlots = useMemo(() => {
    const slots = new Set<string>();
    for (const r of finder.results ?? []) slots.add(slotKey(r.family.kind, r.family.slot));
    return slots;
  }, [finder.results]);

  const inSlot = (kind: ImplantKind, at: number) => slot === null || slotKey(kind, at) === slot;
  const slotResults = finder.results?.filter((r) => inSlot(r.family.kind, r.family.slot)) ?? null;
  // A fix for another slot isn't what the pilot is looking at here.
  const slotFixes = finder.fixes.filter((fix) =>
    fix.typeIds.some((id) => {
      const at = catalog?.slotOf(id);
      return at !== undefined && inSlot(at.kind, at.slot);
    })
  );

  if (finder.status === 'error') {
    return <p className="p-3 text-sm text-danger">{t('fittings.implantFinder.error')}</p>;
  }
  if (finder.status === 'loading' || !baseline || !catalog) {
    return (
      <div className="flex items-center gap-2 p-3 text-sm text-text-dim">
        <Spinner size="sm" />
        {finder.progress.total > 0
          ? t('fittings.implantFinder.loading', finder.progress)
          : t('fittings.implantFinder.loadingCatalog')}
      </div>
    );
  }

  const goalButton = ({ goal: g }: GoalSummary, tone: 'normal' | 'problem' | 'off' = 'normal') => (
    <li key={g.id}>
      <button
        type="button"
        aria-pressed={goalId === g.id}
        onClick={() => setGoalId(g.id)}
        aria-current={goalId === g.id ? 'true' : undefined}
        className={cx(
          'flex min-h-9 w-full items-center gap-2 border-l-2 px-2 text-left text-sm',
          rowInteractiveClassName,
          focusRingInsetClassName,
          goalId === g.id ? `${selectedRowClassName} text-accent` : 'border-l-transparent',
          tone === 'off' && goalId !== g.id && 'text-text-dim'
        )}
      >
        {tone === 'problem' && <Icon.Warn aria-hidden className="shrink-0 text-warning" />}
        <span className="flex-1">{label(g.id)}</span>
        {tone === 'problem' && (
          <span className="text-xs text-warning tabular-nums">
            {t('fittings.implantFinder.over', {
              value: fmt(overBy(g), g.display.decimals),
              unit: t(`fittings.implantFinder.unit.${g.id}`),
            })}
          </span>
        )}
        <Icon.Descend aria-hidden className="text-text-dim md:hidden" />
      </button>
    </li>
  );

  const budgetGoal = goal?.kind === 'budget' ? goal : null;
  const slotPlace = slot === null ? null : parseSlotKey(slot);
  const slotLabel = slotPlace === null ? null : slotName(t, slotPlace.kind, slotPlace.slot);

  return (
    <SourceNames.Provider
      value={{
        hubName: (id) => getTradeHub(id)?.systemName ?? id,
        itemName: finder.purchase?.itemName ?? ((id) => `#${id}`),
      }}
    >
      <div className="space-y-3">
        <SetStrip
          set={set}
          slotOf={catalog.slotOf}
          names={names}
          helpfulSlots={helpfulSlots}
          goalLabel={goal ? label(goal.id) : null}
          selected={slot}
          onSelect={(key) => setSlot((current) => (current === key ? null : key))}
          onRemove={remove}
        />

        {slotPlace && slotLabel && (
          <SlotBar
            label={slotLabel}
            occupant={occupantOf(set, catalog.slotOf, slotPlace.kind, slotPlace.slot)}
            nameOf={nameOf}
            onInfo={setInfoTypeId}
            onRemove={remove}
            onClear={() => setSlot(null)}
          />
        )}

        <Toolbar
          purchase={finder.purchase}
          updating={finder.updating}
          storeProgress={finder.storeProgress}
          cloneBasis={basis === 'clone'}
        />

        <div className="flex flex-col gap-4 md:flex-row">
          <nav
            aria-label={t('fittings.implantFinder.goalsLabel')}
            className={cx('space-y-3 md:block md:w-56 md:shrink-0', goal !== null && 'hidden')}
          >
            <SearchInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('fittings.implantFinder.searchPlaceholder')}
              aria-label={t('fittings.implantFinder.searchLabel')}
            />
            {problems.length > 0 && (
              <div className="space-y-1">
                <SectionHeading warning>{t('fittings.implantFinder.fixHeading')}</SectionHeading>
                <ul className="space-y-0.5">{problems.map((g) => goalButton(g, 'problem'))}</ul>
              </div>
            )}
            {GROUPS.map((group) => {
              const inGroup = offered.filter((g) => g.goal.group === group);
              if (inGroup.length === 0) return null;
              return (
                <div key={group} className="space-y-1">
                  <SectionHeading>{t(`fittings.implantFinder.group.${group}`)}</SectionHeading>
                  <ul className="space-y-0.5">{inGroup.map((g) => goalButton(g))}</ul>
                </div>
              );
            })}
            {notOnFit.length > 0 && (
              <div className="space-y-1 border-t border-line pt-2">
                <SectionHeading>{t('fittings.implantFinder.notOnFit')}</SectionHeading>
                <ul className="space-y-0.5">{notOnFit.map((g) => goalButton(g, 'off'))}</ul>
              </div>
            )}
            {visible.length === 0 && (
              <p className="text-sm text-text-dim">
                {slotLabel && !q
                  ? t('fittings.implantFinder.slotNoGoals', { slot: slotLabel })
                  : t('fittings.implantFinder.noGoalMatch')}
              </p>
            )}
          </nav>

          <section className={cx('min-w-0 flex-1 space-y-3', !goal && 'hidden md:block')}>
            {!goal ? (
              <p className="text-sm text-text-dim">
                {slotLabel
                  ? t('fittings.implantFinder.pickGoalForSlot', { slot: slotLabel })
                  : t('fittings.implantFinder.pickGoal')}
              </p>
            ) : (
              <GoalResults
                goal={goal}
                off={goalIsOff}
                baseline={baseline}
                context={finder.context}
                results={slotResults}
                fixes={slotFixes}
                slot={slotPlace && slotLabel ? { kind: slotPlace.kind, label: slotLabel } : null}
                hubId={hubId}
                nameOf={nameOf}
                busy={finder.updating}
                onBack={() => setGoalId(null)}
                onAdd={addAll}
                onRemove={remove}
                onInfo={setInfoTypeId}
              />
            )}
          </section>
        </div>

        {budgetGoal && !goalIsOff && <BudgetDock goal={budgetGoal} stats={baseline} />}

        {infoTypeId !== null && (
          <ItemDetailModal
            typeId={infoTypeId}
            itemName={nameOf(infoTypeId)}
            onClose={() => setInfoTypeId(null)}
            showOpenInMarket
          />
        )}
      </div>
    </SourceNames.Provider>
  );
}

/**
 * The slot picked on the strip: what's in it, in full, with its details and
 * Remove — and the way back to every slot. Kept outside the strip so it stays
 * in view on a phone, where the strip folds away.
 */
function SlotBar({
  label,
  occupant,
  nameOf,
  onInfo,
  onRemove,
  onClear,
}: {
  label: string;
  occupant: number | undefined;
  nameOf: (typeId: number) => string;
  onInfo: (typeId: number) => void;
  onRemove: (typeId: number) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const name = occupant === undefined ? null : nameOf(occupant);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xs border border-accent-dim bg-panel-2 px-2.5 py-1.5 text-sm">
      {occupant !== undefined && <TypeIcon typeId={occupant} size={32} width={24} height={24} />}
      <span className="min-w-0 flex-1">
        <span className="text-text-dim">
          {t('fittings.implantFinder.showingSlot', { slot: label })}
        </span>{' '}
        {occupant !== undefined && name !== null ? (
          <ItemInfoLink typeId={occupant} className="font-semibold">
            {name}
          </ItemInfoLink>
        ) : (
          <span className="text-text-dim">{t('fittings.implantFinder.empty')}</span>
        )}
      </span>
      {occupant !== undefined && name !== null && (
        <>
          <IconButton
            variant="plain"
            size="sm"
            icon={<Icon.Info />}
            label={t('fittings.implantFinder.info', { name })}
            onClick={() => onInfo(occupant)}
          />
          <Button
            size="sm"
            variant="ghost"
            aria-label={t('fittings.implantFinder.removeItem', { name })}
            onClick={() => onRemove(occupant)}
          >
            {t('fittings.implantFinder.remove')}
          </Button>
        </>
      )}
      <Button size="sm" variant="ghost" onClick={onClear}>
        {t('fittings.implantFinder.allSlots')}
      </Button>
    </div>
  );
}

function Toolbar({
  purchase,
  updating,
  storeProgress,
  cloneBasis,
}: {
  purchase: ImplantPurchase | null;
  updating: boolean;
  storeProgress: { done: number; total: number } | null;
  cloneBasis: boolean;
}) {
  const { t } = useTranslation();
  const stores = purchase?.stores ?? [];
  const ownRate = stores.find((s) => s.rate.source === 'yours')?.rate.rate ?? null;
  const balancesUnknown = stores.length > 0 && stores.every((s) => s.balance === null);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xs border border-line bg-bg px-2.5 py-2 text-xs text-text-dim">
      <PriceHubSelect />
      {stores.length > 0 && (
        <span>
          {ownRate !== null
            ? t('fittings.implantFinder.lpValueYours', { rate: fmt(ownRate, 0) })
            : t('fittings.implantFinder.lpValueMarket')}
        </span>
      )}
      {balancesUnknown && <span>{t('fittings.implantFinder.lpUnknown')}</span>}
      {storeProgress && (
        <span className="flex items-center gap-1.5">
          <Spinner size="sm" />
          {t('fittings.implantFinder.searchingStores', storeProgress)}
        </span>
      )}
      {updating && !storeProgress && (
        <span className="flex items-center gap-1.5">
          <Spinner size="sm" />
          {t('fittings.implantFinder.updating')}
        </span>
      )}
      {cloneBasis && <span>{t('fittings.implantFinder.cloneBasisNote')}</span>}
    </div>
  );
}

/** On a phone, where the budget's live status scrolls away with the list. */
function BudgetDock({
  goal,
  stats,
}: {
  goal: ImplantGoal & { kind: 'budget' };
  stats: FittingStats;
}) {
  const { t } = useTranslation();
  const budget = goal.read(stats);
  const over = shortfall(budget);
  const unit = t(`fittings.implantFinder.unit.${goal.id}`);
  const n = (v: number) => fmt(v, goal.display.decimals);
  return (
    <div className="sticky bottom-0 -mx-3 flex min-h-12 items-center gap-2 border-t border-line-bright bg-panel-2 px-3 text-sm tabular-nums md:hidden">
      <span
        aria-hidden
        className={cx('size-2.5 shrink-0', over > 0 ? 'bg-danger' : 'bg-success')}
      />
      <span className="flex-1 font-semibold">
        {t(over > 0 ? 'fittings.implantFinder.budgetOver' : 'fittings.implantFinder.budgetSpare', {
          used: n(budget.used),
          total: n(budget.total),
          value: n(over > 0 ? over : headroom(budget)),
          unit,
        })}
      </span>
    </div>
  );
}
