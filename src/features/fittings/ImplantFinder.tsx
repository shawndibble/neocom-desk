/**
 * "Find by goal": the pilot says what they want better — CPU, missiles,
 * speed — and every implant and booster that moves it on this Fitting is
 * listed with what each grade does and where to get it: a Trade Hub, or an
 * LP Store with the pilot's LP and tags checked. When the Fitting is over
 * CPU or powergrid, the cheapest ways back under budget come first.
 */
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  Button,
  Caret,
  IconButton,
  IskAmount,
  SearchInput,
  Spinner,
  Tooltip,
  TypeIcon,
} from '@/components/ui';
import {
  focusRingClassName,
  focusRingInsetClassName,
  interactiveClassName,
  rowInteractiveClassName,
  selectedRowClassName,
} from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { entityLinkClassName } from '@/components/ui';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import { cx } from '@/lib/cx';
import {
  displayValue,
  goalById,
  headroom,
  placeAllInSet,
  shortfall,
  type GoalContext,
  type GoalGroup,
  type ImplantGoal,
  type ImplantGoalId,
  type ImplantKind,
  type SlotOf,
} from '@/engine/fittings/implantFinder';
import { alternativeSource, type Source } from '@/engine/fittings/implantSources';
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
import { STAT_EYEBROW_TYPE } from './statKit';
import { useTargetProfiles } from './targetProfiles';
import {
  slotKey,
  useImplantFinder,
  type FamilyResult,
  type FixResult,
  type GoalSummary,
  type GradeResult,
} from './useImplantFinder';

const GROUPS: readonly GoalGroup[] = ['fitting', 'weapons', 'mining', 'tank', 'navigation'];
const IMPLANT_SLOTS = Array.from({ length: 10 }, (_, i) => i + 1);
/** Booster slots the strip shows at least; more when the set already fills a higher one. */
const MIN_BOOSTER_SLOTS = 3;
const EMPTY_SET: FittingImplantSet = { implants: [], boosters: [] };

function fmt(value: number, decimals: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function SectionHeading({ children, warning }: { children: ReactNode; warning?: boolean }) {
  return (
    <p className={cx(STAT_EYEBROW_TYPE, warning ? 'text-warning' : 'text-text-dim')}>{children}</p>
  );
}

function SuccessBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-xs bg-success px-1.5 text-[0.625rem] font-bold tracking-wider text-accent-contrast uppercase">
      {children}
    </span>
  );
}

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
  const names = useMemo(() => {
    const map = new Map<number, { full: string; short: string }>();
    for (const family of catalog?.families ?? []) {
      for (const grade of family.grades) {
        map.set(grade.typeId, {
          full: !grade.code
            ? family.name
            : family.kind === 'booster'
              ? `${grade.code} ${family.name}`
              : `${family.name} ${grade.code}`,
          short: grade.code ?? family.name,
        });
      }
    }
    return map;
  }, [catalog]);
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
          'flex min-h-11 w-full items-center gap-2 border-l-2 px-2 text-left text-sm md:min-h-9',
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

function parseSlotKey(key: string): { kind: ImplantKind; slot: number } {
  const [kind, slot] = key.split(':');
  return { kind: kind === 'booster' ? 'booster' : 'implant', slot: Number(slot) };
}

function slotName(t: TFunction, kind: ImplantKind, slot: number): string {
  return kind === 'booster'
    ? t('fittings.implantFinder.boosterSlot', { slot })
    : t('fittings.implantFinder.slotShort', { slot });
}

/** What the set has in one slot, if anything. */
function occupantOf(
  set: FittingImplantSet,
  slotOf: SlotOf,
  kind: ImplantKind,
  slot: number
): number | undefined {
  return [...set.implants, ...set.boosters].find((id) => {
    const at = slotOf(id);
    return at?.kind === kind && at.slot === slot;
  });
}

/**
 * "Your set": slots 1–10 and the booster slots, marking the ones that can help
 * the chosen goal. Each slot is a button: picking one narrows the goals and
 * results to what goes in it.
 */
function SetStrip({
  set,
  slotOf,
  names,
  helpfulSlots,
  goalLabel,
  selected,
  onSelect,
  onRemove,
}: {
  set: FittingImplantSet;
  slotOf: SlotOf;
  names: Map<number, { full: string; short: string }>;
  helpfulSlots: Set<string>;
  goalLabel: string | null;
  selected: string | null;
  onSelect: (key: string) => void;
  onRemove: (typeId: number) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const boosterSlots = Array.from(
    { length: Math.max(MIN_BOOSTER_SLOTS, ...set.boosters.map((id) => slotOf(id)?.slot ?? 0)) },
    (_, i) => i + 1
  );
  const cells = [
    ...IMPLANT_SLOTS.map((slot) => ({ kind: 'implant' as const, slot })),
    ...boosterSlots.map((slot) => ({ kind: 'booster' as const, slot })),
  ];
  const filled = cells.filter((c) => occupantOf(set, slotOf, c.kind, c.slot) !== undefined).length;

  const cell = ({ kind, slot }: { kind: ImplantKind; slot: number }) => {
    const key = slotKey(kind, slot);
    const id = occupantOf(set, slotOf, kind, slot);
    const helps = helpfulSlots.has(key);
    const picked = selected === key;
    const name = id === undefined ? undefined : names.get(id);
    const label = slotName(t, kind, slot);
    // The short name truncates; the full one is a tooltip (hold on touch).
    const withLabel = (button: ReactElement<{ className?: string }>) =>
      name === undefined ? button : <Tooltip content={name.full}>{button}</Tooltip>;
    return (
      <li key={key} className="relative min-w-0">
        {withLabel(
          <button
            type="button"
            aria-pressed={picked}
            aria-label={t('fittings.implantFinder.pickSlot', {
              slot: label,
              item: name?.full ?? (id === undefined ? t('fittings.implantFinder.empty') : `#${id}`),
            })}
            onClick={() => onSelect(key)}
            className={cx(
              'flex min-h-11 w-full min-w-0 flex-col justify-between rounded-xs border px-1.5 py-1 text-left md:min-h-0',
              interactiveClassName,
              focusRingClassName,
              picked
                ? 'border-accent bg-panel-2 ring-1 ring-accent'
                : helps
                  ? 'border-dashed border-accent bg-accent/10 hover:bg-accent/20 active:bg-accent/28'
                  : 'border-line bg-panel-2 hover:border-line-bright active:bg-panel'
            )}
          >
            <span
              className={cx(
                'text-[0.625rem] tracking-wider uppercase',
                picked ? 'text-accent' : 'text-text-dim',
                id !== undefined && 'pr-5'
              )}
            >
              {label}
            </span>
            {id === undefined ? (
              <span className="text-xs text-text-dim">{t('fittings.implantFinder.empty')}</span>
            ) : (
              <span className="truncate text-xs font-semibold">{name?.short ?? `#${id}`}</span>
            )}
          </button>
        )}
        {id !== undefined && (
          <span className="absolute top-0.5 right-0.5">
            <IconButton
              variant="plain"
              size="row"
              icon={<Icon.Close />}
              label={t('fittings.implantFinder.removeItem', { name: name?.full ?? id })}
              onClick={() => onRemove(id)}
            />
          </span>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className={cx(
          'flex min-h-11 w-full items-center gap-2 rounded-xs text-left md:hidden',
          interactiveClassName,
          focusRingClassName
        )}
      >
        <Caret expanded={expanded} />
        <SectionHeading>{t('fittings.implantFinder.yourSet')}</SectionHeading>
        <span className="flex flex-1 gap-0.5" aria-hidden>
          {cells.map((c) => (
            <span
              key={slotKey(c.kind, c.slot)}
              className={cx(
                'size-2',
                occupantOf(set, slotOf, c.kind, c.slot) !== undefined
                  ? 'bg-accent'
                  : 'border border-line-bright'
              )}
            />
          ))}
        </span>
        <span className="text-xs text-text-dim tabular-nums">
          {t('fittings.implantFinder.setCount', { filled, total: cells.length })}
        </span>
      </button>
      <div className={cx('space-y-1', !expanded && 'hidden md:block')}>
        <div className="hidden items-baseline gap-2 md:flex">
          <SectionHeading>{t('fittings.implantFinder.yourSet')}</SectionHeading>
          <span className="text-xs text-text-dim">
            {goalLabel && helpfulSlots.size > 0
              ? t('fittings.implantFinder.helpfulSlots', { goal: goalLabel })
              : t('fittings.implantFinder.slotHint')}
          </span>
        </div>
        <ul
          style={{ '--booster-slots': boosterSlots.length } as CSSProperties}
          className="grid grid-cols-5 gap-1 md:grid-cols-[repeat(10,minmax(0,1fr))_0.5rem_repeat(var(--booster-slots),minmax(0,1fr))]"
        >
          {cells.slice(0, 10).map(cell)}
          <li aria-hidden className="hidden md:block" />
          {cells.slice(10).map(cell)}
        </ul>
      </div>
    </div>
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
          <MarketItemLink typeId={occupant} className={entityLinkClassName('font-semibold')}>
            {name}
          </MarketItemLink>
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

function GoalResults({
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
                        <SourceLine source={source} />
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
const SourceNames = createContext<{
  hubName: (hubId: string) => string;
  itemName: (typeId: number) => string;
}>({ hubName: (id) => id, itemName: (id) => `#${id}` });

/** Where one item comes from, in a line: a hub's sell orders, or an LP Store offer and what it takes. */
function SourceLine({ source }: { source: Source }) {
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
          <SourceLine source={shown} />
        ) : (
          <span className="text-text-dim">{t('fittings.implantFinder.noSource')}</span>
        )}
        {alt && (
          <span className="mt-0.5 block text-[0.6875rem] text-text-dim">
            {alt.cheaperIfYouCould
              ? t('fittings.implantFinder.cheaperIfYouCould')
              : t('fittings.implantFinder.or')}{' '}
            <SourceLine source={alt.source} />
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
