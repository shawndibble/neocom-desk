/**
 * The "Make more from my planets" panels, drawn from `PlanView`. No figure is
 * computed here: components format and translate what the view model hands them.
 *
 * Cues follow DESIGN.md §6c: item names open their PI Product Detail
 * (`PiProductLink`), a checkbox or a box
 * means "tick or click me", the "alternative" disclosure has a rotating leading
 * caret, and static facts are `StatChip`s and type, not boxes.
 */
import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Caret,
  Checkbox,
  IskAmount,
  Panel,
  SegmentedControl,
  StatChip,
  StatChips,
  TypeIcon,
  textActionClassName,
} from '@/components/ui';
import { tappableRowClassName, touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import type { RebuildPreference } from '@/engine/pi/planAdvice';
import { HAUL_SHIPS } from '@/engine/pi/planHaul';
import type { PiPinKind } from '@/sde/types';
import { PiProductLink } from './PiProductLink';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { cx } from '@/lib/cx';
import { LoadMeter, EstimateBadge, VerbTag } from './DirectiveRow';
import { PlanetImage } from './PlanetImage';
import { Gain, SlotNudge } from './PlanSlotNudge';
import { Sentence } from './sentence';
import type {
  AlternativeView,
  ChecklistColumn,
  ChecklistStep,
  HaulView,
  NamedItem,
  PlanView,
  QuickWinAction,
  QuickWinRow,
  RebuildCardView,
} from './planView';

const SM_UP = '(min-width: 40rem)';
const MD_UP = '(min-width: 48rem)';

/** The shared tick state: ids of ticked rows and a toggle. */
export interface Ticks {
  has: (id: string) => boolean;
  toggle: (id: string) => void;
}

function ItemLink({ item }: { item: NamedItem }) {
  return (
    <PiProductLink typeId={item.typeId}>
      <b className="font-semibold">{item.name}</b>
    </PiProductLink>
  );
}

function ItemList({ items }: { items: readonly NamedItem[] }) {
  return (
    <>
      {items.map((item, i) => (
        <span key={item.typeId}>
          {i > 0 && ', '}
          <ItemLink item={item} />
        </span>
      ))}
    </>
  );
}

function Minutes({ value }: { value: number }) {
  const { t } = useTranslation();
  return (
    <span className="shrink-0 text-[0.6875rem] text-text-dim tabular-nums">
      {t('piPlan.make.minutes', { count: value })}
    </span>
  );
}

// --- Your planets ----------------------------------------------------------------

function Hero({ value, caption }: { value: number; caption: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span
        className={cx(
          'text-3xl font-semibold tabular-nums',
          value < 0 ? 'text-isk-neg' : 'text-isk-pos'
        )}
      >
        {value < 0 ? '−' : '+'}
        <IskAmount value={Math.abs(value)} decimals={0} />
      </span>
      <span className="max-w-60 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {caption}
      </span>
    </div>
  );
}

export function YourPlanetsPanel({
  view,
  preference,
  onPreference,
  onFindBest,
  priceSource,
}: {
  view: PlanView;
  preference: RebuildPreference;
  onPreference: (value: RebuildPreference) => void;
  onFindBest: () => void;
  priceSource: string;
}) {
  const { t } = useTranslation();
  const mdUp = useMediaQuery(MD_UP);
  const smUp = useMediaQuery(SM_UP);
  const { headline, stats } = view;
  // Beside the title from `sm`; on its own row under it below, where the
  // header has no room and the label printed over the "Your planets" title.
  const mattersToggle = (
    <span className="flex flex-wrap items-center justify-end gap-2">
      <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {t('piPlan.make.matters')}
      </span>
      <SegmentedControl<RebuildPreference>
        label={t('piPlan.make.matters')}
        size={mdUp ? 'sm' : 'md'}
        value={preference}
        onChange={onPreference}
        options={[
          { value: 'isk', label: t('piPlan.make.mostIsk') },
          { value: 'haul', label: t('piPlan.make.leastHauling') },
        ]}
      />
    </span>
  );
  return (
    <Panel
      title={t('piPlan.make.planetsTitle')}
      meta={
        <span className="text-[0.6875rem] whitespace-nowrap text-text-dim tabular-nums">
          {t('piPlan.make.planetsCount', {
            used: view.slots.used,
            allowed: Math.max(view.slots.allowed, view.slots.used),
          })}
        </span>
      }
      actions={smUp ? mattersToggle : undefined}
      padded={false}
    >
      <div className="space-y-3 p-3">
        {!smUp && <div data-testid="pi-matters-row">{mattersToggle}</div>}
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          {headline.quickWinPerDay > 0 || view.quickWins.length > 0 ? (
            <Hero
              value={headline.quickWinPerDay}
              caption={t('piPlan.make.heroQuickWins', { count: headline.quickWinMinutes })}
            />
          ) : (
            <p className="text-sm text-text-dim">{t('piPlan.make.noQuickWins')}</p>
          )}
          {headline.rebuildCount > 0 ? (
            <Hero
              value={headline.rebuildGainPerDay}
              caption={t(
                preference === 'haul' ? 'piPlan.make.heroRebuildHaul' : 'piPlan.make.heroRebuild',
                { count: headline.rebuildCount }
              )}
            />
          ) : (
            <p className="text-sm text-text-dim">{t('piPlan.make.noRebuild')}</p>
          )}
        </div>
        <StatChips>
          <StatChip
            label={t('piPlan.make.statNow')}
            value={stats.todayPerDay === null ? '—' : <PerDay value={stats.todayPerDay} />}
          />
          <StatChip
            label={t('piPlan.make.statAfterQuick')}
            value={
              stats.afterQuickWinsPerDay === null ? (
                '—'
              ) : (
                <PerDay value={stats.afterQuickWinsPerDay} />
              )
            }
          />
          <StatChip
            label={t('piPlan.make.statAfterRebuild')}
            value={
              stats.afterRebuildPerDay === null ? '—' : <PerDay value={stats.afterRebuildPerDay} />
            }
          />
          <StatChip
            label={t('piPlan.make.statHaul')}
            value={
              stats.m3PerWeek === null
                ? '—'
                : t('piPlan.make.m3PerWeek', {
                    value: Math.round(stats.m3PerWeek).toLocaleString('en'),
                  })
            }
          />
          <EstimateBadge />
        </StatChips>
        <p className="text-[0.6875rem] text-text-dim">
          {t('piPlan.make.basis', { source: priceSource })}
        </p>
      </div>
      <ul className="grid grid-cols-2 border-t border-line md:grid-cols-3 xl:grid-cols-6">
        {view.strips.map((strip) => (
          <li
            key={strip.planetId}
            className="flex min-w-0 items-center gap-2.5 border-b border-line p-3 md:border-r"
          >
            <PlanetImage type={strip.planetType} size={36} />
            <div className="min-w-0 text-[0.6875rem]">
              <div className="truncate text-xs font-semibold text-text">{strip.name}</div>
              {strip.quickWinGainPerDay !== null && (
                <div className="text-isk-pos">
                  <Gain value={strip.quickWinGainPerDay} />{' '}
                  <span className="text-text-dim">{t('piPlan.make.stripQuickWin')}</span>
                </div>
              )}
              <div className="font-semibold tracking-widest uppercase">
                {strip.rebuild.kind === 'change' ? (
                  <span className="text-text-dim">
                    {t('piPlan.make.stripRebuild')}{' '}
                    <span className="normal-case">
                      <Gain value={strip.rebuild.gainPerDay} className="tracking-normal" />
                    </span>
                  </span>
                ) : strip.rebuild.kind === 'keep' ? (
                  <span className="text-text-dim">{t('piPlan.make.stripKeep')}</span>
                ) : (
                  <span className="text-text-dim">{t('piPlan.make.stripUnknown')}</span>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {view.excluded.length > 0 && (
        <p className="border-t border-line px-3 py-2 text-[0.6875rem] text-text-dim">
          {t('piPlan.make.excluded', {
            count: view.excluded.length,
            names: view.excluded
              .map((colony) => colony.name ?? t('pi.planetLabel', { id: colony.planetId }))
              .join(', '),
          })}
        </p>
      )}
      <SlotNudge slots={view.slots} onFindBest={onFindBest} />
    </Panel>
  );
}

function PerDay({ value }: { value: number }) {
  const { t } = useTranslation();
  return (
    <>
      <IskAmount value={value} decimals={0} />
      {t('piPlan.make.perDay')}
    </>
  );
}

// --- Quick wins ------------------------------------------------------------------

const ACTION_BADGE: Record<QuickWinAction, ReactNode> = {
  restart: <Icon.Refresh size={10} />,
  storage: <Icon.Container size={10} />,
  idle: <Icon.PiFactory size={10} />,
  extractors: <Icon.PiExtractor size={10} />,
  factories: <Icon.PiFactory size={10} />,
};

function QuickWinSentence({ win, names }: { win: QuickWinRow; names: Map<number, string> }) {
  const { t } = useTranslation();
  const planet = <b className="font-semibold">{win.planetName}</b>;
  const item = win.iconTypeId !== null && win.subject !== null && (
    <ItemLink item={{ typeId: win.iconTypeId, name: win.subject }} />
  );
  const { detail } = win;
  switch (detail.kind) {
    case 'restart':
      return (
        <Sentence
          text={t(`piPlan.make.win.restart_${detail.reason}`, {
            count: detail.extractors,
            planet: '{planet}',
            item: '{item}',
          })}
          slots={{ planet, item }}
        />
      );
    case 'storage':
      return (
        <Sentence
          text={t('piPlan.make.win.storage', {
            hours: Math.max(1, Math.round(detail.hoursToFull)),
            count: Math.max(1, Math.round(detail.haulHours / 24)),
            planet: '{planet}',
          })}
          slots={{ planet }}
        />
      );
    case 'idle-factories':
      return (
        <Sentence
          text={t(
            detail.headsToAdd !== null && win.subject !== null
              ? 'piPlan.make.win.idleFeed'
              : 'piPlan.make.win.idle',
            {
              count: detail.pinCount,
              heads: detail.headsToAdd ?? 0,
              planet: '{planet}',
              item: '{item}',
            }
          )}
          slots={{ planet, item }}
        />
      );
    case 'spare-room':
      if (detail.what === 'extractors') {
        return (
          <Sentence
            text={t('piPlan.make.win.extractors', {
              count: detail.extraEcus,
              planet: '{planet}',
              item: '{item}',
            })}
            slots={{ planet, item }}
          />
        );
      }
      return (
        <>
          <Sentence
            text={t('piPlan.make.win.factories', {
              count: detail.factories,
              planet: '{planet}',
              item: '{item}',
            })}
            slots={{ planet, item }}
          />
          {detail.routedFrom.length > 0 && (
            <>
              {' '}
              {t('piPlan.make.win.factoriesFrom', {
                planets: detail.routedFrom
                  .map((id) => names.get(id) ?? t('pi.planetLabel', { id }))
                  .join(', '),
              })}
            </>
          )}
          {detail.needsRemoval && <> {t('piPlan.make.win.factoriesRemoveFirst')}</>}
        </>
      );
  }
}

export function QuickWinsPanel({
  view,
  ticks,
  pricesDown = false,
}: {
  view: PlanView;
  ticks: Ticks;
  /** Hub prices unreadable: the wins shown need none, so no gain is drawn, not even "No ISK figure". */
  pricesDown?: boolean;
}) {
  const { t } = useTranslation();
  const baseId = useId();
  const names = new Map(view.strips.map((strip) => [strip.planetId, strip.name]));
  const { headline } = view;
  return (
    <Panel
      title={t('piPlan.make.quickTitle')}
      meta={
        <span className="text-[0.6875rem] text-text-dim tabular-nums">
          {t('piPlan.make.minutesTotal', { count: headline.quickWinMinutes })}
          {!pricesDown && (
            <>
              {' · '}
              <Gain value={headline.quickWinPerDay} />
            </>
          )}
        </span>
      }
      padded={false}
    >
      <ul className="divide-y divide-line">
        {view.quickWins.map((win) => {
          const ticked = ticks.has(win.id);
          const sentenceId = `${baseId}-${win.id}`;
          return (
            <li key={win.id} className="flex items-center gap-3 px-3 py-2">
              <label className={cx(touchCheckboxLabelClassName, 'max-md:size-11')}>
                <Checkbox
                  checked={ticked}
                  onChange={() => ticks.toggle(win.id)}
                  aria-labelledby={sentenceId}
                />
              </label>
              <PlanetImage type={win.planetType} size={36} badge={ACTION_BADGE[win.action]} />
              {win.iconTypeId !== null && (
                <TypeIcon typeId={win.iconTypeId} size={32} width={24} height={24} />
              )}
              <p
                id={sentenceId}
                className={cx(
                  'min-w-0 flex-1 text-xs text-text',
                  ticked && 'text-text-dim line-through'
                )}
              >
                <QuickWinSentence win={win} names={names} />
              </p>
              <span className="flex shrink-0 flex-col items-end gap-0.5 text-xs sm:flex-row sm:items-center sm:gap-3">
                {pricesDown ? null : win.gainPerDay === null ? (
                  <span className="text-text-dim">{t('piPlan.make.unpriced')}</span>
                ) : win.gainKind === 'saves' ? (
                  <span className="tabular-nums text-warning">
                    {t('piPlan.make.saves')} <IskAmount value={win.gainPerDay} decimals={0} />
                    {t('piPlan.make.perDay')}
                  </span>
                ) : (
                  <Gain value={win.gainPerDay} />
                )}
                <Minutes value={win.minutes} />
              </span>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-line px-3 py-2 text-[0.6875rem] text-text-dim">
        {t(pricesDown ? 'piPlan.make.quickFootNoPrices' : 'piPlan.make.quickFoot')}
        {!pricesDown &&
          view.quickWins.some((win) => win.gainKind === 'saves') &&
          ` ${t('piPlan.make.quickFootSaves')}`}
      </p>
    </Panel>
  );
}

// --- Rebuild ---------------------------------------------------------------------

function haulClause(t: ReturnType<typeof useTranslation>['t'], haulDays: number): string {
  if (haulDays === 1) return t('piPlan.make.haulDaily');
  if (haulDays === 7) return t('piPlan.make.haulWeekly');
  return t('piPlan.make.haulEvery', { count: haulDays });
}

function RebuildSentence({
  card,
  haulDays,
  upgradeFrom,
}: {
  card: RebuildCardView;
  haulDays: number;
  upgradeFrom: number | null;
}) {
  const { t } = useTranslation();
  const planet = <b className="font-semibold">{card.name}</b>;
  const type = <span className="text-text-dim">({t(`pi.planetType.${card.planetType}`)})</span>;
  if (card.status === 'change' && card.target && card.gainPerDay !== null) {
    return (
      <>
        <Sentence
          text={t('piPlan.make.rebuild.change', {
            planet: '{planet}',
            type: '{type}',
            item: '{item}',
            gain: '{gain}',
            context: card.hasQuickWin ? 'ontop' : undefined,
            minutes: card.minutes ?? 0,
            haul: haulClause(t, haulDays),
          })}
          slots={{
            planet,
            type,
            item: <ItemLink item={card.target} />,
            gain: <Gain value={card.gainPerDay} />,
          }}
        />
        {upgradeFrom !== null && <> {t('piPlan.make.rebuild.upgradeFirst')}</>}
      </>
    );
  }
  if (card.status === 'keep') {
    const reason = card.keepReason ?? 'already-best';
    // Never "keep on" raw ore: the recommendation ends at P1 or above.
    if (card.sellsRaw) {
      return (
        <Sentence
          text={t(
            card.hasRefineWin ? 'piPlan.make.rebuild.rawQuickWin' : 'piPlan.make.rebuild.raw',
            {
              planet: '{planet}',
              type: '{type}',
              items: '{items}',
            }
          )}
          slots={{ planet, type, items: <ItemList items={card.sells} /> }}
        />
      );
    }
    return (
      <Sentence
        text={t(
          card.sells.length > 0 ? 'piPlan.make.rebuild.keep' : 'piPlan.make.rebuild.keepAsIs',
          {
            planet: '{planet}',
            type: '{type}',
            items: '{items}',
            reason: t(`piPlan.make.rebuild.keepReason.${reason}`),
          }
        )}
        slots={{ planet, type, items: <ItemList items={card.sells} /> }}
      />
    );
  }
  return (
    <Sentence
      text={t('piPlan.make.rebuild.unknown', { planet: '{planet}', type: '{type}' })}
      slots={{ planet, type }}
    />
  );
}

function AlternativeBody({ alt }: { alt: AlternativeView }) {
  const { t } = useTranslation();
  const delta = alt.iskPerDayDelta;
  const same = Math.round(Math.abs(delta)) === 0;
  const hauls =
    alt.haulRatio === null
      ? null
      : Math.abs(alt.haulRatio - 1) < 0.1
        ? t('piPlan.make.altHaulSame')
        : alt.haulRatio > 1
          ? t('piPlan.make.altHaulLess', { x: formatTimes(alt.haulRatio) })
          : t('piPlan.make.altHaulMore', { x: formatTimes(1 / alt.haulRatio) });
  return (
    <div className="flex items-start gap-2 text-[0.6875rem] text-text-dim">
      <TypeIcon typeId={alt.typeId} size={32} width={20} height={20} />
      <span>
        <Sentence
          text={t(alt.tier === 2 ? 'piPlan.make.altP2' : 'piPlan.make.altP1', {
            item: '{item}',
            delta: '{delta}',
            hauls: hauls ?? '',
            context: hauls === null ? 'nohaul' : undefined,
          })}
          slots={{
            item: <ItemLink item={alt} />,
            delta: same ? (
              t('piPlan.make.altSame')
            ) : (
              <>
                <b className={delta >= 0 ? 'text-isk-pos' : 'text-isk-neg'}>
                  <IskAmount value={Math.abs(delta)} decimals={0} />
                  {t('piPlan.make.perDay')}
                </b>{' '}
                {delta >= 0 ? t('piPlan.make.altMore') : t('piPlan.make.altLess')}
              </>
            ),
          }}
        />
      </span>
    </div>
  );
}

function formatTimes(ratio: number): string {
  return ratio >= 10 ? String(Math.round(ratio)) : (Math.round(ratio * 10) / 10).toString();
}

function RebuildCard({
  card,
  haulDays,
  upgradeFrom,
}: {
  card: RebuildCardView;
  haulDays: number;
  upgradeFrom: number | null;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const altId = useId();
  const nowItem = card.sells[0];
  return (
    <li id={card.anchor} tabIndex={-1} className="scroll-mt-4 px-3 py-3 outline-none">
      <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap">
        <PlanetImage type={card.planetType} size={44} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-text">
            <RebuildSentence card={card} haulDays={haulDays} upgradeFrom={upgradeFrom} />
          </p>
          {card.alternative && (
            <>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={altId}
                onClick={() => setOpen(!open)}
                className={textActionClassName('mt-1 gap-1 whitespace-nowrap')}
              >
                <Caret expanded={open} />
                {t('piPlan.make.alternative', { count: 1 })}
              </button>
              {open && (
                <div id={altId} className="mt-1.5">
                  <AlternativeBody alt={card.alternative} />
                </div>
              )}
            </>
          )}
        </div>
        {card.status !== 'unknown' && (
          <div className="flex shrink-0 items-center gap-3 max-sm:order-last max-sm:basis-full max-sm:pl-14">
            <span className="flex items-center gap-1.5 text-xs text-text-dim tabular-nums">
              {card.status === 'change' && card.fromPerDay !== null && (
                <>
                  {nowItem && <TypeIcon typeId={nowItem.typeId} size={32} width={20} height={20} />}
                  <IskAmount value={card.fromPerDay} decimals={0} />
                  <span aria-label={t('piPlan.make.to')}>→</span>
                  {card.target && (
                    <TypeIcon typeId={card.target.typeId} size={32} width={20} height={20} />
                  )}
                </>
              )}
              {card.status === 'keep' && nowItem && (
                <TypeIcon typeId={nowItem.typeId} size={32} width={20} height={20} />
              )}
              {card.toPerDay !== null && (
                <span className="text-sm font-semibold text-text">
                  <IskAmount value={card.toPerDay} decimals={0} />
                  <span className="ml-1 text-[0.6875rem] font-normal text-text-dim">
                    {t('piPlan.make.perDay')}
                  </span>
                </span>
              )}
            </span>
            <VerbTag
              verb={card.status === 'change' ? 'rebuild' : 'asIs'}
              label={t(card.status === 'change' ? 'piPlan.make.tagRebuild' : 'piPlan.make.tagAsIs')}
            />
          </div>
        )}
      </div>
    </li>
  );
}

export function RebuildPanel({ view }: { view: PlanView }) {
  const { t } = useTranslation();
  const upgradeFrom = new Map(
    view.checklist.map((column) => [column.planetId, column.fit?.upgradeFromLevel ?? null])
  );
  return (
    <Panel
      title={t(
        view.quickWins.length > 0 ? 'piPlan.make.rebuildTitleThen' : 'piPlan.make.rebuildTitle'
      )}
      meta={
        <span className="text-[0.6875rem] text-text-dim tabular-nums">
          {t('piPlan.make.rebuildCount', {
            changed: view.headline.rebuildCount,
            total: view.headline.colonyCount,
          })}
        </span>
      }
      padded={false}
    >
      <ul className="divide-y divide-line">
        {view.rebuilds.map((card) => (
          <RebuildCard
            key={card.planetId}
            card={card}
            haulDays={view.hauling.haulDays}
            upgradeFrom={upgradeFrom.get(card.planetId) ?? null}
          />
        ))}
      </ul>
    </Panel>
  );
}

// --- Hauling and upkeep ------------------------------------------------------------

function formatTrips(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function HaulingPanel({ hauling, hubName }: { hauling: HaulView; hubName: string }) {
  const { t } = useTranslation();
  const { route, fit } = hauling;
  const m3 = (value: number | null) =>
    value === null
      ? '—'
      : t('piPlan.make.m3PerTrip', { value: Math.round(value).toLocaleString('en') });
  const fitKey =
    fit.kind === 'unknown'
      ? 'piPlan.make.fitUnknown'
      : fit.smallest === 'frigate'
        ? 'piPlan.make.fitFrigate'
        : fit.smallest === 'industrial'
          ? 'piPlan.make.fitIndustrial'
          : fit.smallest === 'epithal'
            ? 'piPlan.make.fitEpithal'
            : 'piPlan.make.fitTooBig';
  return (
    <Panel title={t('piPlan.make.haulTitle')} padded={false}>
      <div className="space-y-2 p-3">
        <StatChips>
          <StatChip label={t('piPlan.make.haulChip')} value={m3(hauling.m3PerTrip)} />
          <StatChip label={t('piPlan.make.todayChip')} value={m3(hauling.todayM3PerTrip)} />
          <StatChip
            label={t('piPlan.make.tripsChip')}
            value={t('piPlan.make.tripsPerWeek', { value: formatTrips(hauling.tripsPerWeek) })}
          />
          <StatChip
            label={t('piPlan.make.routeChip')}
            value={
              route.kind === 'local'
                ? t('piPlan.make.routeLocal')
                : route.kind === 'route'
                  ? t('piPlan.strip.jumps', { count: route.jumps, hub: hubName })
                  : t('piPlan.make.routeUnknown')
            }
          />
          {route.kind === 'route' && route.lowsec !== null && route.lowsec > 0 && (
            <StatChip
              label={t('piPlan.make.lowsecChip')}
              tone="warning"
              value={t('piPlan.make.jumps', { count: route.lowsec })}
            />
          )}
          {route.kind === 'route' && route.nullsec !== null && route.nullsec > 0 && (
            <StatChip
              label={t('piPlan.make.nullsecChip')}
              tone="danger"
              value={t('piPlan.make.jumps', { count: route.nullsec })}
            />
          )}
          <StatChip
            label={t('piPlan.make.resetChip')}
            value={t('piPlan.make.resetEvery', { count: hauling.restartDays })}
          />
          {hauling.rebuildMinutes > 0 && (
            <StatChip
              label={t('piPlan.make.rebuildChip')}
              value={t('piPlan.make.rebuildOnce', { count: hauling.rebuildMinutes })}
            />
          )}
        </StatChips>
        <p className="text-sm text-text">
          {t(fitKey, { trips: fit.industrialTrips })}
          {!hauling.complete && <> {t('piPlan.make.haulPartial')}</>}
        </p>
        {fit.ships.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[0.6875rem]">
            {fit.ships.map((ship) => {
              const spec = HAUL_SHIPS.find((s) => s.id === ship.id)!;
              return (
                <li key={ship.id} className={ship.fits ? 'text-success' : 'text-text-dim'}>
                  <span aria-hidden="true">{ship.fits ? '✓' : '✕'}</span>{' '}
                  {t(`piPlan.make.ship.${ship.id}`, { m3: spec.m3.toLocaleString('en') })}
                  <span className="sr-only">
                    {' '}
                    {ship.fits ? t('piPlan.make.shipFits') : t('piPlan.make.shipNoFit')}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Panel>
  );
}

// --- What to do in-game --------------------------------------------------------------

const PIN_KEY: Record<PiPinKind, string> = {
  extractorControlUnit: 'extractor',
  basic: 'basic',
  advanced: 'advanced',
  highTech: 'highTech',
  storage: 'storage',
  launchpad: 'launchpad',
};

const PIN_ICON: Record<PiPinKind, ReactNode> = {
  extractorControlUnit: <Icon.PiExtractor size={Icon.ICON_SIZE.md} />,
  basic: <Icon.PiFactory size={Icon.ICON_SIZE.md} />,
  advanced: <Icon.PiFactory size={Icon.ICON_SIZE.md} />,
  highTech: <Icon.PiFactory size={Icon.ICON_SIZE.md} />,
  storage: <Icon.Container size={Icon.ICON_SIZE.md} />,
  launchpad: <Icon.PiLaunchpad size={Icon.ICON_SIZE.md} />,
};

function StepText({ step }: { step: ChecklistStep }) {
  const { t } = useTranslation();
  const rawPin = step.pin
    ? t(`piPlan.make.pin.${PIN_KEY[step.pin]}`, { count: step.count ?? 1 })
    : '';
  const pin = rawPin.charAt(0).toUpperCase() + rawPin.slice(1);
  switch (step.verb) {
    case 'upgrade':
      return <>{t('piPlan.make.step.upgrade', { level: step.toLevel })}</>;
    case 'remove':
      return <>{t('piPlan.make.step.remove', { count: step.count ?? 1, pin })}</>;
    case 'place':
      return (
        <>
          {t(
            step.pin === 'extractorControlUnit'
              ? 'piPlan.make.step.placeExtractor'
              : 'piPlan.make.step.place',
            { count: step.count ?? 1, pin }
          )}
        </>
      );
    case 'set':
      return (
        <Sentence
          text={t('piPlan.make.step.set', { pin, item: '{item}', count: 1 })}
          slots={{
            item:
              step.typeId !== null && step.subject !== null ? (
                <ItemLink item={{ typeId: step.typeId, name: step.subject }} />
              ) : null,
          }}
        />
      );
    case 'route':
      return (
        <>
          <Sentence
            text={t('piPlan.make.step.route', { item: '{item}' })}
            slots={{ item: <b className="font-semibold">{step.carries}</b> }}
          />
        </>
      );
  }
}

/** Which of the shared tag looks a step takes; its label is the step's own. */
const STEP_TAG = {
  upgrade: 'build',
  remove: 'remove',
  place: 'add',
  set: 'start',
  route: 'rebuild',
} as const;

function StepIcon({ step }: { step: ChecklistStep }) {
  if (step.verb === 'upgrade') return <Icon.PiCommandCenter size={Icon.ICON_SIZE.md} />;
  if (step.verb === 'route') return <Icon.PiLaunchpad size={Icon.ICON_SIZE.md} />;
  if (step.verb === 'set' && step.typeId !== null)
    return <TypeIcon typeId={step.typeId} size={32} width={20} height={20} />;
  return step.pin ? PIN_ICON[step.pin] : null;
}

function StepVerb({ verb }: { verb: ChecklistStep['verb'] }) {
  const { t } = useTranslation();
  return <VerbTag verb={STEP_TAG[verb]} label={t(`piPlan.make.verb.${verb}`)} />;
}

function ChecklistColumnView({ column, ticks }: { column: ChecklistColumn; ticks: Ticks }) {
  const { t } = useTranslation();
  const baseId = useId();
  const { fit } = column;
  return (
    <section
      aria-label={t('piPlan.make.columnLabel', { index: column.index, name: column.name })}
      className="flex min-w-0 flex-col border-line md:border-r md:last:border-r-0"
    >
      <header className="flex items-center gap-3 border-b border-line px-3 py-2.5">
        <PlanetImage type={column.planetType} size={36} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-xs font-semibold text-text">
            {column.index}. {column.name}
          </h3>
          <p className="truncate text-[0.6875rem] text-text-dim">
            {column.change.from.length > 0 && (
              <>
                <ItemList items={column.change.from} />
                {' → '}
              </>
            )}
            <ItemLink item={column.change.to} />
          </p>
        </div>
        <Minutes value={column.minutes} />
      </header>
      <ul className="divide-y divide-line">
        {column.steps.map((step) => {
          const ticked = ticks.has(step.id);
          const textId = `${baseId}-${step.id}`;
          return (
            <li
              key={step.id}
              className={cx(tappableRowClassName, 'flex items-center gap-2 px-3 py-1.5')}
            >
              <label className={cx(touchCheckboxLabelClassName, 'max-md:size-11')}>
                <Checkbox
                  checked={ticked}
                  onChange={() => ticks.toggle(step.id)}
                  aria-labelledby={textId}
                />
              </label>
              <StepVerb verb={step.verb} />
              <span className="inline-flex shrink-0 text-text-dim">
                <StepIcon step={step} />
              </span>
              <span
                id={textId}
                className={cx('min-w-0 flex-1 text-xs', ticked && 'text-text-dim line-through')}
              >
                <StepText step={step} />
              </span>
              <span className="max-sm:hidden">
                <Minutes value={Math.max(1, Math.round(step.minutes))} />
              </span>
            </li>
          );
        })}
      </ul>
      {fit && (
        <div className="mt-auto space-y-1 px-3 py-3">
          <p
            className={cx(
              'text-[0.6875rem]',
              fit.upgradeFromLevel !== null ? 'text-warning' : 'text-text-dim'
            )}
          >
            {fit.upgradeFromLevel !== null
              ? t('piPlan.make.fitNeedsUpgrade', {
                  level: fit.level,
                  count: fit.level - fit.upgradeFromLevel,
                  steps: fit.level - fit.upgradeFromLevel,
                })
              : t('piPlan.make.fitsCc', { level: fit.level })}
          </p>
          <LoadMeter label={t('piPlan.make.cpu')} used={fit.cpuPercent} budget={100} />
          <LoadMeter label={t('piPlan.make.power')} used={fit.powerPercent} budget={100} />
        </div>
      )}
    </section>
  );
}

export function ChecklistPanel({ view, ticks }: { view: PlanView; ticks: Ticks }) {
  const { t } = useTranslation();
  if (view.checklist.length === 0) return null;
  return (
    <Panel
      title={t('piPlan.make.checklistTitle')}
      meta={
        <span className="text-[0.6875rem] text-text-dim">{t('piPlan.make.checklistHint')}</span>
      }
      padded={false}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {view.checklist.map((column) => (
          <ChecklistColumnView key={column.planetId} column={column} ticks={ticks} />
        ))}
      </div>
    </Panel>
  );
}
