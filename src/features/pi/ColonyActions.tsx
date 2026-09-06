/**
 * What to do on this planet — the Advisor's answer, rather than its options.
 *
 * ## Why this replaced the "Room for" row
 *
 * That row listed what the leftover budget would hold, per pin kind. Every
 * number in it was right and it still failed, three times over, on the same
 * ground: a pilot does not want to know that six High-Tech Production Plants
 * would fit, they want to know whether to build one — and a High-Tech
 * Production Plant eats two P2s, which that pilot's colonies did not make. The
 * row could name the pin and never its contents, so it read as a menu of
 * things that all turned out to be impossible.
 *
 * So the card leads with actions, each of which names what goes in, what comes
 * out and what it is worth, and the capacity figures survive only as a
 * footnote under them. A pin nothing could feed is never offered at all.
 *
 * ## The two actions, and why they are one choice
 *
 * `factoryBalance` finds facilities the colony's own extraction cannot feed.
 * There are two ways to fix that and the card used to give only the first:
 *
 * - remove them, freeing CPU and Powergrid for something that pays;
 * - feed them, by buying extraction — which is the better answer whenever the
 *   card also says *keep selling this P1 raw*, since every extra unit that
 *   reaches an idle facility is another P1 sold.
 *
 * They compete for the same Powergrid, so `extractionUpgrade` sizes the second
 * against the budget the first would free and the card states them as one
 * decision rather than two suggestions.
 *
 * ## Where the "add" lines come from
 *
 * `planNetwork`, filtered to the opportunities it placed on this planet. The
 * plan is computed once for the whole set because material is shared, so the
 * card cannot recompute its own — it reads its slice. Inputs arrive already
 * marked `local`, `routed` or `bought`, which is exactly the distinction the
 * pilot asked to see: a link, a customs boundary, or a shopping trip.
 */
import { useTranslation } from 'react-i18next';
import { formatIsk } from '@/lib/isk';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import type { PiData, PiPinKind } from '@/sde/types';
import type { NetworkOpportunity } from '@/engine/pi/network';
import type { PinLoad } from '@/engine/pi/types';
import type { IdleFacilityPlan } from './colonyActionModel';

const round = (value: number) => Math.round(value).toLocaleString();

export function IdleFacilities({ plan, pi }: { plan: IdleFacilityPlan; pi: PiData }) {
  const { t } = useTranslation();
  const { lines, upgrade, wouldFeed } = plan;
  const only = lines.length === 1 ? lines[0] : null;

  return (
    <>
      {upgrade.status === 'fits' && wouldFeed > 0 ? (
        <li className="text-accent">
          {t('piAdvisor.actionExtractFits', {
            units: upgrade.units,
            heads: upgrade.heads,
            extra: round(upgrade.extraPerHour),
            name: only?.gap?.name ?? '',
            fed: wouldFeed,
            idle: only?.line.surplusPins ?? 0,
          })}
        </li>
      ) : null}
      {lines.map(({ line, gap, freed }) => (
        <li key={line.typeId} className="text-warning">
          {t('piAdvisor.actionRemove', {
            count: line.surplusPins,
            pin: t(`piAdvisor.pinKind.${line.facility}`),
            demand: round(gap?.demand ?? 0),
            input: gap?.name ?? '',
            supply: round(gap?.supply ?? 0),
            cpu: round(freed.cpu),
            powergrid: round(freed.powergrid),
          })}
        </li>
      ))}
      {/*
        The alternative to removing, when there is one. Its own list item and
        conditional on there being something to say: an empty `<li>` renders as
        a bullet with nothing after it.
      */}
      {(upgrade.status === 'no-room' || (upgrade.status === 'needs-removal' && wouldFeed > 0)) && (
        <li className="text-text-dim">
          {upgrade.status === 'needs-removal' && wouldFeed > 0 && (
            <span className="block">
              {t('piAdvisor.actionExtractOrRemove', {
                count: only?.line.surplusPins ?? 0,
                heads: upgrade.heads,
                extra: round(upgrade.extraPerHour),
                name: only?.gap?.name ?? '',
                fed: wouldFeed,
              })}{' '}
              {t('piAdvisor.actionExtractWanted', { heads: upgrade.headsWanted })}
            </span>
          )}
          {upgrade.status === 'no-room' && (
            <span className="block">
              {/*
                The post-removal figure, because that is the budget the verdict
                was actually reached against: `extractionUpgrade` returns
                `no-room` only after the freed budget failed too. Quoting the
                smaller pre-removal number here would read as "removing would
                fix this", which is the opposite of what it found.
              */}
              {t('piAdvisor.actionExtractNoRoom', {
                cpu: round(pi.infrastructure.pins.extractorControlUnit?.cpu ?? 0),
                powergrid: round(pi.infrastructure.pins.extractorControlUnit?.powergrid ?? 0),
                count: lines.reduce((sum, entry) => sum + entry.line.surplusPins, 0),
                free: round(plan.freeAfterRemoval.powergrid),
              })}
            </span>
          )}
        </li>
      )}
    </>
  );
}

/** One "add N factories making X" line, with what feeds it and what it earns. */
function AddFactories({
  line,
  planetNames,
}: {
  line: NetworkOpportunity;
  planetNames: ReadonlyMap<number, string>;
}) {
  const { t } = useTranslation();
  return (
    <li className="text-accent">
      {t('piAdvisor.actionAdd', {
        count: line.factories,
        pin: t(`piAdvisor.pinKind.${line.facility}`),
        name: line.name,
      })}
      <ul className="text-text-dim">
        {line.inputs.map((input) => (
          <li key={input.typeId}>
            {input.source === 'local'
              ? t('piAdvisor.actionInputLocal', {
                  units: round(input.unitsPerHour),
                  name: input.name,
                })
              : input.source === 'bought'
                ? t('piAdvisor.actionInputBuy', {
                    units: round(input.unitsPerHour),
                    name: input.name,
                    hub: DEFAULT_TRADE_HUB.systemName,
                    isk: formatIsk(input.costPerHour),
                  })
                : t('piAdvisor.actionInputRoute', {
                    units: round(input.unitsPerHour),
                    name: input.name,
                    from:
                      planetNames.get(input.fromPlanetId ?? -1) ?? String(input.fromPlanetId ?? ''),
                  })}
          </li>
        ))}
        <li>
          {/*
            `buyCostPerHour`, not the total across every input. Routed material
            costs the same number — its forgone sale — but that is not money
            leaving the wallet, and printing one figure under one word for two
            different things is how a pilot budgets for a purchase they are not
            making.
          */}
          {line.buyCostPerHour > 0
            ? t('piAdvisor.actionAddEconBuy', {
                units: round(line.unitsPerHour),
                revenue: formatIsk(line.revenuePerHour),
                spend: formatIsk(line.buyCostPerHour),
                margin: formatIsk(line.marginPerHour),
              })
            : t('piAdvisor.actionAddEcon', {
                units: round(line.unitsPerHour),
                revenue: formatIsk(line.revenuePerHour),
                margin: formatIsk(line.marginPerHour),
              })}
        </li>
      </ul>
    </li>
  );
}

export function ColonyActions({
  idle,
  pi,
  spare,
  newLinkCost,
  opportunities,
  planetNames,
  room,
  closest,
}: {
  /** The idle-facility decision, already computed; null when nothing is idle. */
  idle: IdleFacilityPlan | null;
  pi: PiData;
  /** CPU and Powergrid free right now. */
  spare: PinLoad;
  newLinkCost: PinLoad | null;
  /** The network plan's lines placed on this planet. */
  opportunities: readonly NetworkOpportunity[];
  planetNames: ReadonlyMap<number, string>;
  /** What the leftover budget would hold, in words — the footnote's fallback. */
  room: string;
  /** The pin a full colony came nearest to affording; null when something fits. */
  closest: { kind: PiPinKind; cost: PinLoad } | null;
}) {
  const { t } = useTranslation();
  const nothing = !idle && opportunities.length === 0;

  return (
    <div className="space-y-1 border-t border-line pt-2">
      <CardHeading label={t('piAdvisor.actionsLabel')} />
      <ul className="space-y-1 text-xs">
        {idle && <IdleFacilities plan={idle} pi={pi} />}
        {opportunities.map((line) => (
          <AddFactories key={line.typeId} line={line} planetNames={planetNames} />
        ))}
        {/*
          `networkModel` offers each host the budget its idle pins are holding,
          so an "add" line on a colony that still has them rests on a removal
          that has not happened. The system panel says this once for the whole
          plan; the card has to say it too, because the card is what a pilot
          acts on and the footnote directly below prints the *pre*-removal
          budget.
        */}
        {idle && opportunities.length > 0 && (
          <li className="text-text-dim">{t('piAdvisor.actionAssumesRemoval')}</li>
        )}
        {nothing && (
          <li className="text-text-dim">
            {room ? t('piAdvisor.actionNothingRoom', { room }) : t('piAdvisor.actionNothing')}
          </li>
        )}
      </ul>
      {/*
        The capacity numbers the row used to lead with. They are still worth
        having — a pilot checking the arithmetic needs them — but underneath
        the decision rather than in place of it.
      */}
      <p className="text-[0.6875rem] text-text-faint">
        {newLinkCost
          ? t('piAdvisor.capacityFootnote', {
              cpu: round(spare.cpu),
              powergrid: round(spare.powergrid),
              linkCpu: round(newLinkCost.cpu),
              linkPowergrid: round(newLinkCost.powergrid),
            })
          : t('piAdvisor.capacityFootnoteNoLink', {
              cpu: round(spare.cpu),
              powergrid: round(spare.powergrid),
            })}
      </p>
      {!room && closest && (
        <p className="text-[0.6875rem] text-text-faint">
          {t('piAdvisor.capacityClosest', {
            pin: t(`piAdvisor.pinKind.${closest.kind}`),
            pinCpu: round(closest.cost.cpu),
            pinPowergrid: round(closest.cost.powergrid),
          })}
        </p>
      )}
      {opportunities.length > 0 && (
        <p className="text-[0.6875rem] text-text-faint">
          {t('piAdvisor.priceBasis', { hub: DEFAULT_TRADE_HUB.systemName })}
        </p>
      )}
    </div>
  );
}

function CardHeading({ label }: { label: string }) {
  return (
    <span className="text-[0.625rem] font-semibold tracking-widest text-text-faint uppercase">
      {label}
    </span>
  );
}
