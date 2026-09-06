/**
 * What to do on this planet, in the Advisor's two registers.
 *
 * ## Two renderings of one list, and why the split is here
 *
 * `ColonyDirectives` is the card: one `DirectiveRow` per instruction, capped,
 * with inputs as chips and nothing else. `ColonyReasoning` is the detail
 * modal: the same instructions, each followed by the sentences that justify it
 * — the demand-against-supply arithmetic, the economics, the alternative to
 * removing, the preconditions.
 *
 * The prose was never the problem; its *placement* was. A card carrying three
 * paragraphs per planet across six planets is a page a pilot has to read to
 * find two things to go and do. So the card answers "what" and the modal
 * answers "why", and both are built from the same models — `idleFacilityPlan`,
 * `planNetwork`'s opportunities and conversions — so they cannot drift.
 *
 * ## Why the "Room for" numbers are a footnote and not a row
 *
 * They were the card's lead once. Every number in it was right and it still
 * failed: a pilot does not want to know that six High-Tech Production Plants
 * would fit, they want to know whether to build one — and a High-Tech
 * Production Plant eats two P2s their colonies did not make. So the capacity
 * figures survive as one quiet line under the instructions, and a pin nothing
 * could feed is never offered at all.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { formatIsk } from '@/lib/isk';
import type { TradeHub } from '@/market/hubs';
import type { PiData, PiPinKind } from '@/sde/types';
import type { NetworkConversion, NetworkOpportunity } from '@/engine/pi/network';
import type { PinLoad } from '@/engine/pi/types';
import type { IdleFacilityPlan } from './colonyActionModel';
import type { ColonyStopTierAdvice } from './stopTierModel';
import { DirectiveRow, SectionLabel } from './DirectiveRow';
import { inputChips } from './inputChips';
import { CARD_DIRECTIVE_LIMIT, cappedRows } from './colonyPlan';

const round = (value: number) => Math.round(value).toLocaleString();

export interface ColonyActionProps {
  /** The hub every price here came from, and the one a purchase would be made at. */
  hub: TradeHub;
  /** The idle-facility decision, already computed; null when nothing is idle. */
  idle: IdleFacilityPlan | null;
  pi: PiData;
  /** The network plan's lines placed on this planet. */
  opportunities: readonly NetworkOpportunity[];
  /** Exchanges worth making here: what to take down, and what goes up instead. */
  conversions: readonly NetworkConversion[];
  planetNames: ReadonlyMap<number, string>;
  /** Who owns a planet, when it is not the reader's own — by planetId. */
  owners: ReadonlyMap<number, string>;
}

function removeRow(entry: IdleFacilityPlan['lines'][number], t: TFunction) {
  return (
    <DirectiveRow
      verb="remove"
      value={t('piAdvisor.freedValue', {
        cpu: round(entry.freed.cpu),
        powergrid: round(entry.freed.powergrid),
      })}
      valueTone="freed"
    >
      {t('piAdvisor.directiveRemove', {
        count: entry.line.surplusPins,
        pin: t(`piAdvisor.pinKind.${entry.line.facility}`),
      })}
    </DirectiveRow>
  );
}

function addRow(
  line: NetworkOpportunity,
  planetNames: ReadonlyMap<number, string>,
  owners: ReadonlyMap<number, string>,
  hub: TradeHub,
  t: TFunction,
  withChips = true
) {
  return (
    <DirectiveRow
      verb="add"
      value={t('piAdvisor.gainValue', { isk: formatIsk(line.marginPerHour) })}
      unit={t('piAdvisor.perHourUnit')}
      {...(withChips ? { chips: inputChips(line, { planetNames, owners, hub, t }) } : {})}
    >
      {t('piAdvisor.directiveAdd', {
        count: line.factories,
        pin: t(`piAdvisor.pinKind.${line.facility}`),
        name: line.name,
      })}
    </DirectiveRow>
  );
}

function swapRow(
  entry: NetworkConversion,
  planetNames: ReadonlyMap<number, string>,
  owners: ReadonlyMap<number, string>,
  hub: TradeHub,
  t: TFunction,
  withChips = true
) {
  return (
    <DirectiveRow
      verb="swap"
      value={t('piAdvisor.gainValue', { isk: formatIsk(entry.netPerHour) })}
      unit={t('piAdvisor.perHourUnit')}
      {...(withChips ? { chips: inputChips(entry.add, { planetNames, owners, hub, t }) } : {})}
    >
      {t('piAdvisor.directiveSwap', {
        count: entry.removeCount,
        from: entry.removeName,
        addCount: entry.add.factories,
        to: entry.add.name,
      })}
    </DirectiveRow>
  );
}

/** The card's instructions: at most `CARD_DIRECTIVE_LIMIT`, faults first. */
export function ColonyDirectives(props: ColonyActionProps) {
  const { t } = useTranslation();
  const { idle, opportunities, conversions, planetNames, owners, hub } = props;

  const removals: { key: string; node: ReactNode }[] = (idle?.lines ?? []).map((entry) => ({
    key: `remove-${entry.line.typeId}`,
    node: removeRow(entry, t),
  }));
  // Sorted across both kinds, not concatenated. `planNetwork` orders its
  // opportunities and its conversions best-first but in two separate streams,
  // so taking the head of a concatenation would hand the card an "add" worth
  // less than a "swap" sitting right behind it — and the cap would then bury
  // the better line under "1 more in Details".
  const gains: { key: string; node: ReactNode; worth: number }[] = [
    ...opportunities.map((line) => ({
      key: `add-${line.typeId}`,
      node: addRow(line, planetNames, owners, hub, t),
      worth: line.marginPerHour,
    })),
    ...conversions.map((entry) => ({
      key: `swap-${entry.removeFacility}-${entry.removeName}`,
      node: swapRow(entry, planetNames, owners, hub, t),
      worth: entry.netPerHour,
    })),
  ].sort((a, b) => b.worth - a.worth);

  if (removals.length + gains.length === 0) {
    return <p className="text-[0.6875rem] text-text-dim">{t('piAdvisor.nothingToDo')}</p>;
  }

  const shown = cappedRows(removals, gains, CARD_DIRECTIVE_LIMIT);
  const hidden = removals.length + gains.length - shown.length;
  return (
    <div className="space-y-2">
      {shown.map((row, index) => (
        <div key={row.key} className={index > 0 ? 'border-t border-line pt-2' : undefined}>
          {row.node}
        </div>
      ))}
      {hidden > 0 && (
        <p className="text-[0.6875rem] text-text-faint">
          {t('piAdvisor.moreInDetails', { count: hidden })}
        </p>
      )}
    </div>
  );
}

/** A labelled block of reasoning under one instruction, in the modal. */
function Why({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <SectionLabel>{label}</SectionLabel>
      <div className="text-xs text-text-dim">{children}</div>
    </>
  );
}

/**
 * The modal's instructions: every one of them, each with the sentences that
 * justify it. Nothing the old card said is gone — it is here.
 */
export function ColonyReasoning(props: ColonyActionProps) {
  const { t } = useTranslation();
  const { idle, pi, opportunities, conversions, planetNames, owners, hub } = props;
  const only = idle && idle.lines.length === 1 ? idle.lines[0] : null;

  const blocks: { key: string; node: ReactNode }[] = [];

  for (const entry of idle?.lines ?? []) {
    blocks.push({
      key: `remove-${entry.line.typeId}`,
      node: (
        <div className="space-y-2">
          {removeRow(entry, t)}
          <div className="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1">
            <Why label={t('piAdvisor.whyLabel')}>
              {t('piAdvisor.reasonRemove', {
                demand: round(entry.gap?.demand ?? 0),
                input: entry.gap?.name ?? '',
                supply: round(entry.gap?.supply ?? 0),
              })}
            </Why>
          </div>
        </div>
      ),
    });
  }

  // The alternative to removing, when there is one. Its own block below the
  // removals, because it applies to the decision rather than to one line.
  if (idle) {
    const { upgrade, wouldFeed } = idle;
    const aside = (key: string, body: ReactNode, accent = false) => ({
      key,
      node: (
        <p
          className={`border-l bg-panel-2 px-3 py-2 text-xs text-text-dim ${
            accent ? 'border-accent-dim' : 'border-line-bright'
          }`}
        >
          {body}
        </p>
      ),
    });
    if (upgrade.status === 'fits' && wouldFeed > 0) {
      blocks.push(
        aside(
          'feed-fits',
          t('piAdvisor.actionExtractFits', {
            units: upgrade.units,
            heads: upgrade.heads,
            extra: round(upgrade.extraPerHour),
            name: only?.gap?.name ?? '',
            fed: wouldFeed,
            idle: only?.line.surplusPins ?? 0,
          }),
          true
        )
      );
    } else if (upgrade.status === 'needs-removal' && wouldFeed > 0) {
      blocks.push(
        aside(
          'feed-instead',
          `${t('piAdvisor.actionExtractOrRemove', {
            count: only?.line.surplusPins ?? 0,
            heads: upgrade.heads,
            extra: round(upgrade.extraPerHour),
            name: only?.gap?.name ?? '',
            fed: wouldFeed,
          })} ${t('piAdvisor.actionExtractWanted', { heads: upgrade.headsWanted })}`
        )
      );
    } else if (upgrade.status === 'no-room') {
      blocks.push(
        aside(
          'feed-no-room',
          // The post-removal figure, because that is the budget the verdict was
          // actually reached against: `extractionUpgrade` returns `no-room`
          // only after the freed budget failed too. Quoting the smaller
          // pre-removal number would read as "removing would fix this", which
          // is the opposite of what it found.
          t('piAdvisor.actionExtractNoRoom', {
            cpu: round(pi.infrastructure.pins.extractorControlUnit?.cpu ?? 0),
            powergrid: round(pi.infrastructure.pins.extractorControlUnit?.powergrid ?? 0),
            count: idle.lines.reduce((sum, entry) => sum + entry.line.surplusPins, 0),
            free: round(idle.freeAfterRemoval.powergrid),
          })
        )
      );
    }
  }

  for (const line of opportunities) {
    blocks.push({
      key: `add-${line.typeId}`,
      node: (
        <div className="space-y-2">
          {addRow(line, planetNames, owners, hub, t, false)}
          <div className="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1.5">
            <Why label={t('piAdvisor.inputsLabel')}>
              <div className="flex flex-wrap gap-1">
                {inputChips(line, { planetNames, owners, hub, t })}
              </div>
            </Why>
            <Why label={t('piAdvisor.earnsLabel')}>
              {/*
                `buyCostPerHour`, not the total across every input. Routed
                material costs the same number — its forgone sale — but that is
                not money leaving the wallet, and printing one figure under one
                word for two different things is how a pilot budgets for a
                purchase they are not making.
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
            </Why>
            {/*
              `networkModel` offers each host the budget its idle pins are
              holding, so an "add" line on a colony that still has them rests
              on a removal that has not happened.
            */}
            {idle && (
              <Why label={t('piAdvisor.assumesLabel')}>{t('piAdvisor.actionAssumesRemoval')}</Why>
            )}
          </div>
        </div>
      ),
    });
  }

  for (const entry of conversions) {
    const bought = entry.add.inputs.filter((input) => input.source === 'bought');
    const haulIn = bought.reduce((sum, input) => sum + input.unitsPerHour, 0);
    blocks.push({
      key: `swap-${entry.removeFacility}-${entry.removeName}`,
      node: (
        <div className="space-y-2">
          {swapRow(entry, planetNames, owners, hub, t, false)}
          <div className="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1.5">
            <Why label={t('piAdvisor.whyLabel')}>
              {t('piAdvisor.actionConvertWhy', {
                from: entry.removeName,
                count: entry.removeCount,
                lost: formatIsk(entry.removeMarginPerHour),
                gained: formatIsk(entry.add.marginPerHour),
              })}
            </Why>
            <Why label={t('piAdvisor.inputsLabel')}>
              <div className="flex flex-wrap gap-1">
                {inputChips(entry.add, { planetNames, owners, hub, t })}
              </div>
            </Why>
            {haulIn > 0 && (
              <Why label={t('piAdvisor.haulLabel')}>
                {t('piAdvisor.actionConvertHaul', {
                  in: round(haulIn),
                  out: round(entry.add.unitsPerHour),
                })}
              </Why>
            )}
          </div>
        </div>
      ),
    });
  }

  if (blocks.length === 0) {
    return <p className="text-xs text-text-dim">{t('piAdvisor.actionNothing')}</p>;
  }

  return (
    <div className="space-y-3">
      {blocks.map((block, index) => (
        <div key={block.key} className={index > 0 ? 'border-t border-line pt-3' : undefined}>
          {block.node}
        </div>
      ))}
      {opportunities.length > 0 && (
        <p className="text-[0.6875rem] text-text-faint">
          {t('piAdvisor.priceBasis', { hub: hub.systemName })}
        </p>
      )}
    </div>
  );
}

/**
 * "Build up to X here" as a directive row — or the one input that stops it.
 *
 * Three readings, and the layout has to keep them apart as carefully as the
 * old sentences did:
 *
 * - the colony is already extracting the winner and refining nothing, so the
 *   answer is *change nothing*. That gets the quiet `asIs` verb, never
 *   `rebuild`: tagged as a rebuild next to a six-figure number it read as an
 *   instruction to tear down a colony that was already right.
 * - a different resource wins, so the colony would be rebuilt around it. The
 *   figure below is what it *would* make, not what it makes.
 * - a made tier wins, which is also a rebuild.
 */
/**
 * Whether the colony is already doing what was recommended — extracting the
 * winning ore and refining nothing.
 *
 * Derived once and shared by the row and its note: they used to compute it
 * separately, which is two places for the `asIs`/`rebuild` distinction to
 * drift apart, and that distinction is the whole point of the fourth verb.
 */
function isAlreadyBest(
  result: ColonyStopTierAdvice,
  extractedPerHour: readonly { typeId: number; unitsPerHour: number }[]
): boolean {
  if (result.status !== 'advised' || result.advice.kind !== 'recommended') return false;
  const { best } = result.advice;
  return (
    best.tier === 0 &&
    extractedPerHour.some((entry) => entry.typeId === best.typeId) &&
    result.alreadyRunning
  );
}

export function StopTierRow({
  result,
  extractedPerHour,
}: {
  result: ColonyStopTierAdvice;
  /** What the colony pulls now, to tell "already best" from "switch to it". */
  extractedPerHour: readonly { typeId: number; unitsPerHour: number }[];
}) {
  const { t } = useTranslation();

  // The card's capacity footnote already says when a radius did not load, so a
  // link-cost refusal says nothing here rather than repeating that sentence.
  if (result.status === 'needs-link-cost') return null;
  if (result.status === 'needs-measured-extraction') {
    return <p className="text-[0.6875rem] text-text-dim">{t('piAdvisor.stopTierNeedsRate')}</p>;
  }
  if (result.advice.kind === 'nothing-to-score') return null;
  if (result.advice.kind === 'no-recommendation') {
    // The engine names what stopped every candidate; this only spells it.
    return (
      <p className="text-[0.6875rem] text-text-dim">
        {t(`piAdvisor.stopTierBlocked.${result.advice.blocker}`)}
      </p>
    );
  }

  const { best } = result.advice;
  const alreadyBest = isAlreadyBest(result, extractedPerHour);

  return (
    <DirectiveRow
      verb={alreadyBest ? 'asIs' : 'rebuild'}
      value={formatIsk(best.marginPerHour)}
      unit={t('piAdvisor.perHourUnit')}
      valueTone={alreadyBest ? 'muted' : 'quiet'}
    >
      {best.tier === 0
        ? t(alreadyBest ? 'piAdvisor.directiveAsIs' : 'piAdvisor.directiveRebuildRaw', {
            name: best.name,
          })
        : t('piAdvisor.directiveRebuildMake', { name: best.name, tier: best.tier })}
    </DirectiveRow>
  );
}

/** The sentence under a `StopTierRow`, in the modal only. */
export function StopTierNote({
  result,
  extractedPerHour,
}: {
  result: ColonyStopTierAdvice;
  extractedPerHour: readonly { typeId: number; unitsPerHour: number }[];
}) {
  const { t } = useTranslation();
  if (result.status !== 'advised' || result.advice.kind !== 'recommended') return null;
  const { best } = result.advice;
  const alreadyBest = isAlreadyBest(result, extractedPerHour);
  return (
    <p className="text-xs text-text-dim">
      {t(alreadyBest ? 'piAdvisor.stopTierValue' : 'piAdvisor.stopTierValueSwitch', {
        isk: formatIsk(best.marginPerHour),
        units: Math.round(best.unitsPerHour).toLocaleString(),
      })}
    </p>
  );
}

/**
 * The capacity figures, as a footnote. Still worth having — a pilot checking
 * the arithmetic needs them — but underneath the decision rather than in place
 * of it.
 */
export function CapacityFootnote({
  spare,
  newLinkCost,
  room,
  closest,
}: {
  /** CPU and Powergrid free right now. */
  spare: PinLoad;
  newLinkCost: PinLoad | null;
  /** What the leftover budget would hold, in words. */
  room: string;
  /** The pin a full colony came nearest to affording; null when something fits. */
  closest: { kind: PiPinKind; cost: PinLoad } | null;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1 text-[0.6875rem] text-text-faint">
      <p>
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
      {room && <p>{t('piAdvisor.capacityRoom', { room })}</p>}
      {!room && closest && (
        <p>
          {t('piAdvisor.capacityClosest', {
            pin: t(`piAdvisor.pinKind.${closest.kind}`),
            pinCpu: round(closest.cost.cpu),
            pinPowergrid: round(closest.cost.powergrid),
          })}
        </p>
      )}
    </div>
  );
}
