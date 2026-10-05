/**
 * "Find the best thing to build": the planet-type toggles, the controls and
 * the ranked recipe cards, drawn from `FindBestView`. No figure is computed
 * here; components format and translate what the view model hands them.
 *
 * Cues follow DESIGN.md §6c: item names are Market links; the planet-type
 * chips toggle with `aria-pressed`; "Show me how" expands in place with a
 * caret and `aria-expanded`; what a what-if planet unlocks is labelled, never
 * colour alone.
 */
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, FilterChip, IskAmount, Panel, SegmentedControl, TypeIcon } from '@/components/ui';
import { Caret } from '@/components/ui/Disclosure';
import * as Icon from '@/components/ui/icons';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { HintText } from '@/components/ui/HintText';
import type { PlanetType } from '@/engine/pi/goalTypes';
import type { RecipeFilter } from '@/engine/pi/planRecipes';
import { formatIskCompact } from '@/lib/isk';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { cx } from '@/lib/cx';
import { EstimateBadge, TierChip } from './DirectiveRow';
import { setupParts } from './findBestHowTo';
import type { RecipeCardView, TypeState, WhatIfChip, TypeToggle } from './findBestView';
import { PlanetImage } from './PlanetImage';

const MD_UP = '(min-width: 48rem)';
const EU_GUIDE = 'https://wiki.eveuniversity.org/Planetary_Industry';
const DAYS_PER_WEEK = 7;

function useTypeName() {
  const { t } = useTranslation();
  return (type: PlanetType) => t(`pi.planetType.${type}`);
}

// --- Planet types ----------------------------------------------------------------------

export function PlanetTypesPanel({
  hasColonies,
  colonyCount,
  toggles,
  chips,
  hubName,
  onToggle,
  onWhatIf,
}: {
  hasColonies: boolean;
  colonyCount: number;
  toggles: readonly TypeToggle[];
  chips: readonly WhatIfChip[];
  hubName: string;
  onToggle: (type: PlanetType) => void;
  onWhatIf: (type: PlanetType) => void;
}) {
  const { t } = useTranslation();
  const typeName = useTypeName();
  const title = hasColonies ? t('piPlan.find.typesTitle') : t('piPlan.find.typesTitleNone');
  return (
    <Panel
      title={title}
      meta={
        <span className="text-[0.6875rem] whitespace-nowrap text-text-dim">
          {hasColonies
            ? t('piPlan.find.typesFrom', { count: colonyCount })
            : t('piPlan.find.typesAll')}
        </span>
      }
    >
      <div className="space-y-3">
        <div role="group" aria-label={title} className="flex flex-wrap gap-2">
          {toggles.map((toggle) => (
            <FilterChip
              key={toggle.type}
              size="md"
              selected={toggle.on}
              onToggle={() => onToggle(toggle.type)}
              icon={<PlanetImage type={toggle.type} px={20} />}
              label={typeName(toggle.type)}
            />
          ))}
        </div>
        {hasColonies && chips.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('piPlan.find.whatIfTitle')}
            </p>
            <div
              role="group"
              aria-label={t('piPlan.find.whatIfTitle')}
              className="flex flex-wrap gap-2"
            >
              {chips.map((chip) => (
                <FilterChip
                  key={chip.type}
                  size="md"
                  selected={chip.on}
                  onToggle={() => onWhatIf(chip.type)}
                  icon={<PlanetImage type={chip.type} px={20} />}
                  label={t('piPlan.find.whatIfChip', {
                    type: typeName(chip.type),
                    context: chip.on ? 'on' : chip.unlocks > 0 ? 'unlocks' : 'nothing',
                    count: chip.unlocks,
                  })}
                />
              ))}
            </div>
          </div>
        )}
        <div className="space-y-0.5 text-xs text-text-dim">
          <p>{hasColonies ? t('piPlan.find.guideColonies') : t('piPlan.find.guideNone')}</p>
          <p>
            {t('piPlan.find.guideRanked', { hub: hubName })}{' '}
            <ExternalLink href={EU_GUIDE}>{t('piPlan.find.euGuide')}</ExternalLink>
          </p>
        </div>
      </div>
    </Panel>
  );
}

// --- Controls ---------------------------------------------------------------------------

export type FindBestMode = 'picks' | 'all';

export function FindBestControls({
  mode,
  onMode,
  filter,
  onFilter,
}: {
  mode: FindBestMode;
  onMode: (mode: FindBestMode) => void;
  filter: RecipeFilter;
  onFilter: (filter: RecipeFilter) => void;
}) {
  const { t } = useTranslation();
  const mdUp = useMediaQuery(MD_UP);
  const size = mdUp ? 'sm' : 'md';
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <SegmentedControl<FindBestMode>
        label={t('piPlan.find.modeLabel')}
        size={size}
        value={mode}
        onChange={onMode}
        options={[
          { value: 'picks', label: t('piPlan.find.modePicks') },
          { value: 'all', label: t('piPlan.find.modeAll') },
        ]}
      />
      {mode === 'picks' && (
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            {t('piPlan.find.make')}
          </span>
          <SegmentedControl<RecipeFilter>
            label={t('piPlan.find.make')}
            size={size}
            value={filter}
            onChange={onFilter}
            options={[
              { value: 'any', label: t('piPlan.find.makeAny') },
              { value: 'p1', label: t('piPlan.find.makeP1') },
              { value: 'p2', label: t('piPlan.find.makeP2') },
            ]}
          />
          <span className="text-[0.6875rem] text-text-dim">{t('piPlan.find.makeHint')}</span>
        </span>
      )}
    </div>
  );
}

// --- Recipe cards -----------------------------------------------------------------------

const STATE_TEXT: Record<TypeState, string> = {
  have: 'text-success',
  whatif: 'text-warning',
  find: 'text-danger',
};

function HostMark({ state }: { state: TypeState }) {
  const { t } = useTranslation();
  const Glyph = state === 'find' ? Icon.Close : Icon.Done;
  return (
    <span className={cx('inline-flex items-center gap-0.5 text-[0.6875rem]', STATE_TEXT[state])}>
      <Glyph size={Icon.ICON_SIZE.sm} aria-hidden="true" />
      {t(`piPlan.find.state.${state}`)}
    </span>
  );
}

const CHAIN_ARROW = (
  <Icon.Descend size={Icon.ICON_SIZE.sm} aria-hidden="true" className="shrink-0 text-text-faint" />
);

function IconStrip({ ids }: { ids: readonly number[] }) {
  return (
    <>
      {ids.map((id) => (
        <TypeIcon key={id} typeId={id} size={32} width={24} height={24} />
      ))}
    </>
  );
}

function Chain({ card }: { card: RecipeCardView }) {
  const { t } = useTranslation();
  const layout = card.recipe.layout;
  if (!layout) return null;
  const processed = layout.makes.slice(0, -1).map((make) => make.typeId);
  return (
    <span
      role="img"
      aria-label={t('piPlan.find.chain', { item: card.recipe.name })}
      className="flex shrink-0 flex-wrap items-center gap-1"
    >
      <IconStrip ids={layout.extracts} />
      {CHAIN_ARROW}
      {processed.length > 0 && (
        <>
          <IconStrip ids={processed} />
          {CHAIN_ARROW}
        </>
      )}
      <TypeIcon typeId={card.recipe.typeId} size={32} width={24} height={24} />
    </span>
  );
}

function Comparison({ card }: { card: RecipeCardView }) {
  const { t } = useTranslation();
  const typeName = useTypeName();
  const { comparison } = card.recipe;
  if (!comparison) return null;
  const { verdict, isReference, versus } = comparison;
  const tone =
    isReference || verdict === 'same'
      ? 'text-text-dim'
      : verdict === 'better'
        ? 'text-success'
        : 'text-warning';
  const text = isReference
    ? t('piPlan.find.cmpReference', { type: typeName(versus.planetType) })
    : t(`piPlan.find.cmp.${verdict}`, { item: versus.name, type: typeName(versus.planetType) });
  return (
    <span className={cx('min-w-0 text-xs', tone)}>
      <HintText
        content={t('piPlan.find.cmpHint', {
          item: versus.name,
          isk: formatIskCompact(versus.iskPerDay),
          type: typeName(versus.planetType),
        })}
      >
        {text}
      </HintText>
    </span>
  );
}

function RecipeCard({
  card,
  open,
  panelId,
  onToggle,
}: {
  card: RecipeCardView;
  open: boolean;
  panelId: string;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const typeName = useTypeName();
  const mdUp = useMediaQuery(MD_UP);
  const { recipe } = card;
  const parts = recipe.layout ? setupParts(recipe.layout.pins) : null;
  const setup = parts
    ? [
        parts.extractors > 0 && t('piPlan.find.setupExtractors', { count: parts.extractors }),
        parts.basic > 0 && t('piPlan.find.setupBasic', { count: parts.basic }),
        parts.advanced > 0 && t('piPlan.find.setupAdvanced', { count: parts.advanced }),
        parts.highTech > 0 && t('piPlan.find.setupHighTech', { count: parts.highTech }),
      ]
        .filter(Boolean)
        .join(' + ')
    : null;
  return (
    <div
      className={cx(
        'grid gap-x-4 gap-y-2 border-l-2 px-3 py-3 md:items-center',
        'md:grid-cols-[1.5rem_minmax(0,1.3fr)_minmax(0,1.1fr)_auto_7rem_minmax(0,1.1fr)_auto]',
        card.isNew ? 'border-l-warning bg-panel-2/40' : 'border-l-transparent'
      )}
    >
      <span className="hidden text-sm text-text-dim tabular-nums md:block">{card.rank}</span>
      <div className="flex min-w-0 items-center gap-3">
        <TypeIcon typeId={recipe.typeId} size={32} width={32} height={32} />
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-text-dim tabular-nums md:hidden">{card.rank}.</span>
            <MarketItemLink typeId={recipe.typeId}>
              <b className="text-sm font-semibold">{recipe.name}</b>
            </MarketItemLink>
            <TierChip tier={recipe.tier} />
            {card.isNew && (
              <span className="inline-flex h-[1.125rem] items-center rounded-xs border border-warning/60 px-1.5 text-[0.6875rem] font-semibold tracking-widest text-warning uppercase">
                {t('piPlan.find.newWithPlanet')}
              </span>
            )}
          </div>
          {setup && (
            <p className="text-[0.6875rem] text-text-dim">
              {t('piPlan.find.setup', { parts: setup })}
            </p>
          )}
        </div>
      </div>
      <div className="min-w-0 space-y-1">
        <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('piPlan.find.youNeed', { count: card.hosts.length })}
        </p>
        <ul className="space-y-0.5">
          {card.hosts.map((host) => (
            <li key={host.type} className="flex items-center gap-1.5 text-xs">
              <PlanetImage type={host.type} px={20} />
              <b className="font-semibold">{typeName(host.type)}</b>
              <HostMark state={host.state} />
            </li>
          ))}
        </ul>
      </div>
      <Chain card={card} />
      <div className="md:text-right">
        <div className="text-base font-semibold tabular-nums">
          <IskAmount value={recipe.iskPerDay} decimals={0} />
        </div>
        <div className="text-[0.6875rem] text-text-dim">
          {t('piPlan.find.perDayVolume', {
            m3: Math.round(recipe.m3PerDay * DAYS_PER_WEEK).toLocaleString('en'),
          })}
        </div>
      </div>
      <Comparison card={card} />
      <Button
        size={mdUp ? 'sm' : 'md'}
        variant={open ? 'ghost' : 'accent'}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="max-md:w-full max-md:justify-center"
      >
        <Caret expanded={open} />
        {open ? t('piPlan.find.hideSteps') : t('piPlan.find.showHow')}
        <span className="sr-only"> · {recipe.name}</span>
      </Button>
    </div>
  );
}

export function RecipeListPanel({
  cards,
  hubName,
  estimate,
  openId,
  onToggle,
  renderOpen,
  banner,
  unpricedCount,
  emptyHint,
}: {
  cards: readonly RecipeCardView[];
  hubName: string;
  estimate: boolean;
  openId: number | null;
  onToggle: (typeId: number) => void;
  renderOpen: (card: RecipeCardView, panelId: string) => ReactNode;
  banner: ReactNode;
  unpricedCount: number;
  /** Why nothing ranks, when the pilot's own toggles are not the reason. */
  emptyHint: string;
}) {
  const { t } = useTranslation();
  return (
    <>
      {banner}
      <Panel
        title={t('piPlan.find.picksTitle')}
        meta={
          <span className="text-[0.6875rem] whitespace-nowrap text-text-dim">
            {t('piPlan.find.picksMeta', { hub: hubName })}
          </span>
        }
        actions={estimate ? <EstimateBadge /> : undefined}
        padded={false}
      >
        {cards.length === 0 ? (
          <p className="p-3 text-sm text-text-dim">{emptyHint}</p>
        ) : (
          <ol className="divide-y divide-line">
            {cards.map((card) => {
              const open = openId === card.recipe.typeId;
              const panelId = `find-how-${card.recipe.typeId}`;
              return (
                <li key={card.recipe.typeId}>
                  <RecipeCard
                    card={card}
                    open={open}
                    panelId={panelId}
                    onToggle={() => onToggle(card.recipe.typeId)}
                  />
                  {open && renderOpen(card, panelId)}
                </li>
              );
            })}
          </ol>
        )}
        {unpricedCount > 0 && (
          <p className="border-t border-line px-3 py-2 text-[0.6875rem] text-text-dim">
            {t('piPlan.find.unpriced', { count: unpricedCount, hub: hubName })}
          </p>
        )}
      </Panel>
    </>
  );
}
