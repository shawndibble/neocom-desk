/**
 * Plan's "Bigger chains" section: P3 and P4 made across several of the
 * pilot's planets, drawn only while they opted in to hauling between planets.
 * Its own panel, below the one-planet answers: no figure here enters a pick, a
 * quick win or a total. The figures come from `biggerChainsModel`.
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
import type { PiData } from '@/sde/types';
import { piTier } from '@/engine/pi/chain';
import { biggerChainsView, type BiggerChainCard } from './biggerChainsModel';
import { chainAssumptions, planetTypeList } from './chainEstimateText';
import { EstimateBadge, TierChip } from './DirectiveRow';
import { PiProductLink } from './PiProductLink';
import type { PlanAdvice } from './planAdviceModel';
import { Sentence } from './sentence';
import { useBiggerChains } from './useBiggerChains';

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
            <b className="font-semibold">{listFormat.format(card.planetIds.map(names.of))}</b>
          ),
          host: <b className="font-semibold">{names.of(card.hostId)}</b>,
        }}
      />
    );
  }
  const types = planetTypeList(t, card.planetTypes);
  return (
    <Sentence
      text={t('piPlan.chains.onNewPlanets', {
        item: '{item}',
        count: card.planetTypes.length,
        types,
        host: names.type(card.hostType),
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
  const count = card.kind === 'colonies' ? card.planetIds.length : card.planetTypes.length;
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
            leg.jumps === null
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
}: {
  card: BiggerChainCard;
  names: Names;
  free: number;
  pi: PiData;
  assumptions: string;
}) {
  const { t } = useTranslation();
  return (
    <li className="px-3 py-3">
      <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap">
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
        <div className="flex shrink-0 items-center gap-2 max-sm:order-last max-sm:basis-full max-sm:pl-12">
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

export function BiggerChainsPanel({ advice, pi }: { advice: PlanAdvice; pi: PiData }) {
  const { t } = useTranslation();
  const [othersOpen, setOthersOpen] = useState(false);
  const state = useBiggerChains(advice, pi);
  const haulDays = advice.chainBasis.haulDays;
  const view = useMemo(
    () =>
      biggerChainsView({
        estimates: state.estimates,
        afterRebuildPerDay: new Map(
          advice.colonies.map((colony) => [colony.planetId, colony.afterRebuildPerDay])
        ),
        slots: { free: advice.slots.free, gainPerPlanetPerDay: advice.slots.gainPerPlanetPerDay },
        haulDays,
      }),
    [state.estimates, advice.colonies, advice.slots, haulDays]
  );
  const byId = new Map(advice.colonies.map((colony) => [colony.planetId, colony]));
  const names: Names = {
    of: (id) => byId.get(id)?.name ?? t('pi.planetLabel', { id }),
    type: (type) => t(`pi.planetType.${type}`),
    product: (typeId) => pi.schematics[String(typeId)]?.name ?? `#${typeId}`,
  };
  const free = advice.slots.free;
  const onColonies = t('piPlan.chains.assumesColonies', { count: haulDays });
  const assumptionsOf = (card: BiggerChainCard) =>
    card.kind === 'colonies'
      ? onColonies
      : (() => {
          const estimate = state.estimates.get(card.typeId)?.newPlanets;
          return estimate ? chainAssumptions(t, estimate) : onColonies;
        })();
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
            {renderCards(view.others)}
          </Disclosure>
        </div>
      )}
    </Panel>
  );
}
