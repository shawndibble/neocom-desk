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
import type { FactoryBalance } from '@/engine/pi/factoryBalance';
import type { NetworkOpportunity } from '@/engine/pi/network';
import { extractionUpgrade } from '@/engine/pi/extractionUpgrade';
import type { PinLoad } from '@/engine/pi/types';
import type { BuiltColonyAdvice } from './advisorModel';

const round = (value: number) => Math.round(value).toLocaleString();

type Measured = Extract<FactoryBalance, { status: 'measured' }>;

/**
 * The input a starved schematic is shortest of, and by how much.
 *
 * The binding one, not the first listed: a schematic short of two things is
 * short of one of them worse, and sizing extraction off the wrong one would
 * buy heads that change nothing.
 */
function shortfallOf(
  line: Measured
): { name: string; unitsPerHour: number; demand: number; supply: number } | null {
  const supplyOf = (typeId: number) =>
    line.supplyPerHour.find((entry) => entry.typeId === typeId)?.unitsPerHour ?? 0;
  const binding = line.demandPerHour.reduce(
    (worst, demand) =>
      supplyOf(demand.typeId) / demand.unitsPerHour < supplyOf(worst.typeId) / worst.unitsPerHour
        ? demand
        : worst,
    line.demandPerHour[0]
  );
  if (!binding) return null;
  const supply = supplyOf(binding.typeId);
  const gap = binding.unitsPerHour - supply;
  return gap > 0
    ? { name: binding.name, unitsPerHour: gap, demand: binding.unitsPerHour, supply }
    : null;
}

/**
 * The idle-facility decision: remove them, or buy the extraction that feeds
 * them.
 *
 * Sized only on a colony extracting a single resource. With two, "extraction
 * over head count" is not this resource's rate per head, and a rate that is
 * quietly an average across two ores would size the purchase wrong — the kind
 * of confidently-derived number `chain.ts` refuses to produce.
 */
function IdleFacilities({
  colony,
  balance,
  freed,
  pi,
  spare,
  newLinkCost,
}: {
  colony: BuiltColonyAdvice;
  balance: readonly FactoryBalance[];
  freed: PinLoad;
  pi: PiData;
  spare: PinLoad;
  newLinkCost: PinLoad | null;
}) {
  const { t } = useTranslation();
  const starved = balance.filter(
    (line): line is Measured => line.status === 'measured' && line.surplusPins > 0
  );
  if (starved.length === 0) return null;

  // One line per starved schematic, not one summed line. A colony refining two
  // P0s can be short of both, and a single line would take its facility kind
  // and its shortfall from the first while counting idle pins from all of them
  // — naming one input as the reason pins short of a different one must go.
  const perLine = starved.map((line) => {
    const spec = pi.infrastructure.pins[line.facility];
    return {
      line,
      gap: shortfallOf(line),
      freed: {
        cpu: (spec?.cpu ?? 0) * line.surplusPins,
        powergrid: (spec?.powergrid ?? 0) * line.surplusPins,
      },
    };
  });

  // Extraction is only sized against a single starved schematic, for the same
  // reason its head rate is only read off a single extracted resource: with
  // two, "the shortfall" is not one number and buying to close one of them
  // would be reported as closing both.
  const only = perLine.length === 1 ? perLine[0] : null;
  const heads = colony.pinLoad.extractorHeads;
  const singleResource = colony.extractedPerHour.length === 1;
  const perHeadPerHour =
    singleResource && heads > 0 ? colony.extractedPerHour[0].unitsPerHour / heads : null;

  const upgrade = extractionUpgrade({
    shortfallPerHour: only?.gap?.unitsPerHour ?? 0,
    perHeadPerHour: only ? perHeadPerHour : null,
    spare,
    newLinkCost,
    infrastructure: pi.infrastructure,
    freedByRemoval: freed,
  });
  // A Basic Industry Facility eats a fixed rate, so extra extraction converts
  // to facilities fed at that rate — never more than are actually idle.
  //
  // `demandPerHour` is the colony's whole appetite for that input, not one
  // pin's: dividing by the pins that want it is what turns extraction back
  // into facilities. Reading it as a per-pin rate silently reports that a
  // purchase feeds nothing.
  const perFacility =
    only && only.line.pins > 0
      ? (only.line.demandPerHour[0]?.unitsPerHour ?? 0) / only.line.pins
      : 0;
  const wouldFeed =
    perFacility > 0
      ? Math.min(only?.line.surplusPins ?? 0, Math.floor(upgrade.extraPerHour / perFacility))
      : 0;

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
      {perLine.map(({ line, gap, freed: frees }) => (
        <li key={line.typeId} className="text-warning">
          {t('piAdvisor.actionRemove', {
            count: line.surplusPins,
            pin: t(`piAdvisor.pinKind.${line.facility}`),
            demand: round(gap?.demand ?? 0),
            input: gap?.name ?? '',
            supply: round(gap?.supply ?? 0),
            cpu: round(frees.cpu),
            powergrid: round(frees.powergrid),
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
              })}
            </span>
          )}
          {upgrade.status === 'no-room' && (
            <span className="block">
              {t('piAdvisor.actionExtractNoRoom', {
                cpu: round(pi.infrastructure.pins.extractorControlUnit?.cpu ?? 0),
                powergrid: round(pi.infrastructure.pins.extractorControlUnit?.powergrid ?? 0),
                free: round(spare.powergrid),
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
  colony,
  pi,
  balance,
  freed,
  spare,
  newLinkCost,
  opportunities,
  planetNames,
  room,
  closest,
}: {
  colony: BuiltColonyAdvice;
  pi: PiData;
  balance: readonly FactoryBalance[];
  /** Budget the idle facilities are holding. */
  freed: PinLoad;
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
  const idle = balance.some((line) => line.status === 'measured' && line.surplusPins > 0);
  const nothing = !idle && opportunities.length === 0;

  return (
    <div className="space-y-1 border-t border-line pt-2">
      <CardHeading label={t('piAdvisor.actionsLabel')} />
      <ul className="space-y-1 text-xs">
        <IdleFacilities
          colony={colony}
          balance={balance}
          freed={freed}
          pi={pi}
          spare={spare}
          newLinkCost={newLinkCost}
        />
        {opportunities.map((line) => (
          <AddFactories key={line.typeId} line={line} planetNames={planetNames} />
        ))}
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
