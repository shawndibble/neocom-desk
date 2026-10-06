/**
 * Plan's "Bigger chains" panel: draws `biggerChainsModel`'s view, computes no
 * figure. Its "What if I add a planet?" part, and the Map's add-planet panel,
 * draw a what-if planet's chains with `WhatIfChainCards`.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Disclosure,
  IskAmount,
  Panel,
  Spinner,
  StatChip,
  StatChips,
  TypeIcon,
} from '@/components/ui';
import { HintText } from '@/components/ui/HintText';
import { cx } from '@/lib/cx';
import type { PiData } from '@/sde/types';
import { piTier } from '@/engine/pi/chain';
import type { PlanetType } from '@/engine/pi/goalTypes';
import { withArticle } from './article';
import {
  biggerChainsView,
  whatIfChainsOf,
  WHAT_IF_PLANET_ID,
  type BiggerChainCard,
} from './biggerChainsModel';
import { chainAssumptions, planetTypeList } from './chainEstimateText';
import { EstimateBadge, TierChip } from './DirectiveRow';
import { PiProductLink } from './PiProductLink';
import type { PlanAdvice } from './planAdviceModel';
import { Sentence } from './sentence';
import { planetTypesOf } from './productPlanets';
import { NO_TYPES, useBiggerChains, useWhatIfChains } from './useBiggerChains';

const listFormat = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' });
const m3 = (value: number) => Math.round(value).toLocaleString('en');

interface Names {
  of: (planetId: number) => string;
  type: (type: string) => string;
  product: (typeId: number) => string;
}

function ChainSentence({
  card,
  names,
  free,
}: {
  card: BiggerChainCard;
  names: Names;
  free: number;
}) {
  const { t } = useTranslation();
  const item = <PiProductLink typeId={card.typeId}>{names.product(card.typeId)}</PiProductLink>;
  if (card.kind === 'colonies') {
    return (
      <Sentence
        text={t('piPlan.chains.onColonies', {
          item: '{item}',
          planets: '{planets}',
          host: '{host}',
        })}
        slots={{
          item,
          planets: (
            <b className="font-semibold">
              {/* A what-if planet reads last: "Gas I, Gas II and a new Lava planet". */}
              {listFormat.format(
                [...card.planetIds]
                  .sort((a, b) => Number(a === WHAT_IF_PLANET_ID) - Number(b === WHAT_IF_PLANET_ID))
                  .map(names.of)
              )}
            </b>
          ),
          host: <b className="font-semibold">{names.of(card.hostId)}</b>,
        }}
      />
    );
  }
  const { planets, hostType } = card.estimate;
  const types = planetTypeList(t, planets);
  return (
    <Sentence
      text={t('piPlan.chains.onNewPlanets', {
        item: '{item}',
        count: planets.length,
        types,
        host: names.type(hostType),
        free,
      })}
      slots={{ item }}
    />
  );
}

function Verdict({ card }: { card: BiggerChainCard }) {
  const { t } = useTranslation();
  const where = card.kind === 'colonies' ? 'Colonies' : 'New';
  if (card.verdict === 'unknown' || card.gainPerDay === null || card.versusPerDay === null) {
    return <>{t(`piPlan.chains.unknown${where}`)}</>;
  }
  const gain = (
    <b className={card.gainPerDay > 0 ? 'text-isk-pos' : 'text-isk-neg'}>
      <IskAmount value={Math.abs(card.gainPerDay)} decimals={0} />
      {t('piPlan.make.perDay')}
    </b>
  );
  const versus = (
    <>
      <IskAmount value={card.versusPerDay} decimals={0} />
      {t('piPlan.make.perDay')}
    </>
  );
  const count = card.kind === 'colonies' ? card.planetIds.length : card.estimate.planets.length;
  return (
    <Sentence
      text={t(`piPlan.chains.${card.verdict === 'beats' ? 'beats' : 'short'}${where}`, {
        gain: '{gain}',
        versus: '{versus}',
        count,
      })}
      slots={{ gain, versus }}
    />
  );
}

function Legs({ card, names }: { card: BiggerChainCard; names: Names }) {
  const { t } = useTranslation();
  if (card.kind === 'new-planets') return <>{t('piPlan.chains.jumpsNew')}</>;
  if (card.legs.length === 0 || card.legs.every((leg) => leg.jumps === 0)) {
    return <>{t('piPlan.chains.jumpsOneSystem')}</>;
  }
  return (
    <>
      {card.legs
        .map((leg) =>
          t(
            leg.from === WHAT_IF_PLANET_ID || leg.to === WHAT_IF_PLANET_ID
              ? 'piPlan.chains.legNew'
              : leg.jumps === null
                ? 'piPlan.chains.legUnknown'
                : leg.jumps === 0
                  ? 'piPlan.chains.legSameSystem'
                  : 'piPlan.chains.leg',
            {
              from: names.of(leg.from),
              to: names.of(leg.to),
              jumps: leg.jumps ?? 0,
            }
          )
        )
        .join(' · ')}
    </>
  );
}

function ChainCard({
  card,
  names,
  free,
  pi,
  assumptions,
  stacked = false,
}: {
  card: BiggerChainCard;
  names: Names;
  free: number;
  pi: PiData;
  assumptions: string;
  /** The figure on its own line at every width: a narrow panel, such as the Map's. */
  stacked?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <li className={stacked ? 'py-3' : 'px-3 py-3'}>
      <div className={cx('flex flex-wrap items-start gap-3', !stacked && 'sm:flex-nowrap')}>
        <TypeIcon typeId={card.typeId} size={64} width={36} height={36} />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm text-text">
            <ChainSentence card={card} names={names} free={free} />
          </p>
          <p className="text-xs text-text-dim">
            <Verdict card={card} />
          </p>
          <StatChips>
            <StatChip
              label={t('piPlan.chains.haul')}
              value={t('piPlan.make.m3PerWeek', { value: m3(card.m3PerWeek) })}
            />
            <StatChip
              label={t('piPlan.chains.perTrip')}
              value={t('piPlan.chains.m3', { value: m3(card.m3PerHaul) })}
            />
          </StatChips>
          <p className="text-[0.6875rem] text-text-dim">
            <span className="font-semibold tracking-widest uppercase">
              {t('piPlan.chains.jumps')}
            </span>{' '}
            <Legs card={card} names={names} />
          </p>
        </div>
        <div
          className={cx(
            'flex shrink-0 items-center gap-2',
            stacked
              ? 'order-last basis-full pl-12'
              : 'max-sm:order-last max-sm:basis-full max-sm:pl-12'
          )}
        >
          <TierChip tier={piTier(card.typeId, pi)} />
          <span className="text-sm font-semibold text-text tabular-nums">
            <IskAmount value={card.iskPerDay} decimals={0} />
            <span className="ml-1 text-[0.6875rem] font-normal text-text-dim">
              {t('piPlan.make.perDay')}
            </span>
          </span>
          <HintText content={assumptions}>
            <EstimateBadge />
          </HintText>
        </div>
      </div>
    </li>
  );
}

/** Planet and product names, a what-if planet included ("a new Barren planet"). */
function useNames(advice: PlanAdvice, pi: PiData, whatIfType: PlanetType | null): Names {
  const { t } = useTranslation();
  const byId = new Map(advice.colonies.map((colony) => [colony.planetId, colony]));
  const type = (planet: string) => t(`pi.planetType.${planet}`);
  return {
    of: (id) =>
      id === WHAT_IF_PLANET_ID && whatIfType
        ? t('piPlan.chains.newPlanet', { type: type(whatIfType) })
        : (byId.get(id)?.name ?? t('pi.planetLabel', { id })),
    type,
    product: (typeId) => pi.schematics[String(typeId)]?.name ?? `#${typeId}`,
  };
}

/** What a card's figure assumes, the what-if planet's own assumptions included. */
function useAssumptions(advice: PlanAdvice, whatIfType: PlanetType | null) {
  const { t } = useTranslation();
  const basis = advice.chainBasis;
  const onColonies = t('piPlan.chains.assumesColonies', { count: basis.haulDays });
  const added = whatIfType
    ? t('piPlan.chains.assumesWhatIf', {
        type: t(`pi.planetType.${whatIfType}`),
        level: basis.ccLevel,
        heads: basis.headsPerExtractor,
        rate: Math.round(basis.ratePerHour).toLocaleString('en'),
      })
    : null;
  return (card: BiggerChainCard) =>
    card.kind === 'new-planets'
      ? chainAssumptions(t, card.estimate)
      : added && card.planetIds.includes(WHAT_IF_PLANET_ID)
        ? `${onColonies} ${added}`
        : onColonies;
}

/** The chains one what-if planet type makes possible, drawn as Bigger chains cards. */
export function WhatIfChainCards({
  type,
  cards,
  advice,
  pi,
  stacked = false,
}: {
  type: PlanetType;
  cards: readonly BiggerChainCard[];
  advice: PlanAdvice;
  pi: PiData;
  stacked?: boolean;
}) {
  const names = useNames(advice, pi, type);
  const assumptionsOf = useAssumptions(advice, type);
  return (
    <ul className="divide-y divide-line">
      {cards.map((card) => (
        <ChainCard
          key={card.typeId}
          card={card}
          names={names}
          free={advice.slots.free}
          pi={pi}
          assumptions={assumptionsOf(card)}
          stacked={stacked}
        />
      ))}
    </ul>
  );
}

/** Plan's "What if I add a planet?": every type the pilot does not run, one at a time, once the chains above are priced. */
function WhatIfSection({
  advice,
  pi,
  ready,
}: {
  advice: PlanAdvice;
  pi: PiData;
  /** The pilot's own chains are priced: the what-ifs wait for them. */
  ready: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<ReadonlySet<PlanetType>>(new Set());
  const colonies = advice.chainColonies;
  const missing = useMemo(() => {
    const have = new Set(colonies.map((colony) => colony.planetType));
    return colonies.length === 0 ? [] : planetTypesOf(pi).filter((type) => !have.has(type));
  }, [colonies, pi]);
  const noSlot = advice.slots.free < 1;
  const wanted = ready && !noSlot ? missing : NO_TYPES;
  const state = useWhatIfChains(advice, pi, wanted);
  const pending = !ready || state.pending;
  // All at once when every type is priced: rows landing one by one would re-sort under the pointer.
  const rows = useMemo(
    () => (pending ? [] : whatIfChainsOf(advice, state.byType)),
    [pending, advice, state.byType]
  );
  if (missing.length === 0) return null;
  const toggle = (type: PlanetType) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });

  return (
    <section aria-labelledby="pi-chains-whatif" className="border-t border-line">
      <h3
        id="pi-chains-whatif"
        className="px-3 pt-2 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase"
      >
        {t('piPlan.chains.whatIfTitle')}
      </h3>
      <p className="px-3 pt-1 pb-2 text-xs text-text-dim">
        {noSlot ? t('piPlan.chains.whatIfNoSlot') : t('piPlan.chains.whatIfIntro')}
      </p>
      {rows.map((row) => (
        <div key={row.type} className="border-t border-line">
          <Disclosure
            label={t('piPlan.chains.whatIfRow', {
              aType: withArticle(t(`pi.planetType.${row.type}`)),
              count: row.cards.length,
            })}
            trailing={
              <>
                <IskAmount value={row.cards[0].iskPerDay} decimals={0} />
                {t('piPlan.make.perDay')}
              </>
            }
            expanded={open.has(row.type)}
            onToggle={() => toggle(row.type)}
          >
            {open.has(row.type) && (
              <WhatIfChainCards type={row.type} cards={row.cards} advice={advice} pi={pi} />
            )}
          </Disclosure>
        </div>
      ))}
      {!noSlot &&
        (pending ? (
          <div className="flex items-center gap-2 border-t border-line px-3 py-3 text-xs text-text-dim">
            <Spinner size="sm" label={t('piPlan.chains.whatIfPricing')} />
            {t('piPlan.chains.whatIfPricing')}
          </div>
        ) : (
          rows.length === 0 && (
            <p className="border-t border-line px-3 py-3 text-sm text-text-dim">
              {t('piPlan.chains.whatIfNone')}
            </p>
          )
        ))}
    </section>
  );
}

export function BiggerChainsPanel({ advice, pi }: { advice: PlanAdvice; pi: PiData }) {
  const { t } = useTranslation();
  const [othersOpen, setOthersOpen] = useState(false);
  const state = useBiggerChains(advice, pi);
  const haulDays = advice.chainBasis.haulDays;
  const afterRebuildPerDay = useMemo(
    () => new Map(advice.colonies.map((colony) => [colony.planetId, colony.afterRebuildPerDay])),
    [advice.colonies]
  );
  const view = useMemo(
    () =>
      biggerChainsView({
        estimates: state.estimates,
        afterRebuildPerDay,
        slots: { free: advice.slots.free, gainPerPlanetPerDay: advice.slots.gainPerPlanetPerDay },
        haulDays,
      }),
    [state.estimates, afterRebuildPerDay, advice.slots, haulDays]
  );
  const names = useNames(advice, pi, null);
  const free = advice.slots.free;
  const assumptionsOf = useAssumptions(advice, null);
  const priced = view.recommended.length + view.others.length;
  const renderCards = (cards: readonly BiggerChainCard[]) => (
    <ul className="divide-y divide-line">
      {cards.map((card) => (
        <ChainCard
          key={card.typeId}
          card={card}
          names={names}
          free={free}
          pi={pi}
          assumptions={assumptionsOf(card)}
        />
      ))}
    </ul>
  );

  return (
    <Panel
      title={t('piPlan.chains.title')}
      meta={<span className="text-[0.6875rem] text-text-dim">{t('piPlan.chains.meta')}</span>}
      padded={false}
    >
      <p className="border-b border-line px-3 py-2 text-xs text-text-dim">
        {t('piPlan.chains.intro')}
      </p>
      {view.recommended.length > 0 && renderCards(view.recommended)}
      {state.pending ? (
        <div className="flex items-center gap-2 px-3 py-3 text-xs text-text-dim">
          <Spinner size="sm" label={t('piPlan.chains.pricing')} />
          {t('piPlan.chains.pricing')}
        </div>
      ) : (
        view.recommended.length === 0 && (
          <p className="px-3 py-3 text-sm text-text-dim">
            {state.candidateCount === 0
              ? t('piPlan.chains.noneBuildable')
              : priced === 0
                ? t('piPlan.chains.noneFits', { count: state.candidateCount })
                : t('piPlan.chains.noneBeat', { count: priced })}
          </p>
        )
      )}
      {view.others.length > 0 && (
        <div className="border-t border-line">
          <Disclosure
            label={t('piPlan.chains.others', { count: view.others.length })}
            expanded={othersOpen}
            onToggle={() => setOthersOpen(!othersOpen)}
          >
            {othersOpen && renderCards(view.others)}
          </Disclosure>
        </div>
      )}
      <WhatIfSection advice={advice} pi={pi} ready={!state.pending} />
    </Panel>
  );
}
