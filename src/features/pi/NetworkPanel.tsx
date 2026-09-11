/**
 * What a character's colonies could make between them — the Advisor's
 * system-level panel (ADR 0012).
 *
 * Its own file rather than another component inside `AdvisorPanel.tsx`, which
 * already carries the per-planet cards: this answers about the *set*, takes
 * only a finished plan and a name lookup, and touches nothing a card touches.
 * The same seam `PlanResults.tsx` sits on.
 *
 * ## Why it reads as directives now
 *
 * The per-planet cards each answer for one planet, which is why a four-colony
 * operation making four different P1s reads "keep selling raw" four times:
 * `localChainTargets` gates on one planet's own P0 closure and no one of them
 * reaches a P2. This is the answer they cannot give — and it used to arrive as
 * two lines of plan followed by seven of explanation, which buried it.
 *
 * So it uses the cards' own `DirectiveRow` grammar: the product first, because
 * that is what a planner scans for, then where it goes, then what it earns.
 * The explanations survive underneath as compact notes, and the long "what
 * this panel is" paragraph moved into the title's tooltip.
 */
import { useTranslation } from 'react-i18next';
import { InfoTooltip, Panel, Tooltip } from '@/components/ui';
import { formatIsk } from '@/lib/isk';
import type { TradeHub } from '@/market/hubs';
import type { NetworkBlocker, NetworkPlan } from '@/engine/pi/network';
import { customsRatePercent, hostRateFor } from './customsRate';
import { DirectiveRow } from './DirectiveRow';
import { inputChips } from './inputChips';

/**
 * Products the set almost reaches: it makes one of the two inputs, and the
 * other would have to be bought.
 *
 * Only rendered with buying off, and it is the whole reason the off state is
 * not silence. A pilot who turns the switch off should still learn that
 * Superconductors is one hub run away, rather than being told nothing and
 * concluding the tab has no opinion.
 */
function ReachableByBuying({ plan }: { plan: NetworkPlan }) {
  const { t } = useTranslation();
  const names = plan.blocked
    .filter((line) => line.reason === 'needs-buying')
    .map((line) => line.name);
  if (names.length === 0) return null;
  return (
    <p className="text-[0.6875rem] text-text-dim">
      {t('piAdvisor.buyInputsOffNote', { names: names.slice(0, 4).join(', ') })}
    </p>
  );
}

/** The plan panel names no owners: it lists the set, not one pilot's card. */
const EMPTY_OWNERS: ReadonlyMap<number, string> = new Map();

/**
 * One bullet per blocked product reads as a wall once a hub is picked: most
 * of the schematics on a system-wide plan hit the same one or two reasons
 * (no host has room, or the customs cut eats the margin), so grouping by
 * reason turns dozens of near-duplicate lines into a handful.
 */
function groupBlockers(
  lines: NetworkPlan['blocked']
): { reason: NetworkBlocker; names: string[] }[] {
  const order: NetworkBlocker[] = [];
  const byReason = new Map<NetworkBlocker, string[]>();
  for (const line of lines) {
    if (!byReason.has(line.reason)) {
      order.push(line.reason);
      byReason.set(line.reason, []);
    }
    byReason.get(line.reason)?.push(line.name);
  }
  return order.map((reason) => ({ reason, names: byReason.get(reason) ?? [] }));
}

/**
 * The count itself, not a partial name list: "+18 more" still leaves the
 * question of which 18. The dotted underline + cursor-help is the only hint
 * this is a trigger — the tooltip carries every name in the group.
 */
function BlockedGroupCount({ names }: { names: string[] }) {
  const { t } = useTranslation();
  return (
    <Tooltip content={names.join(', ')} openOnTap>
      <button
        type="button"
        className="cursor-help underline decoration-dotted decoration-text-dim underline-offset-2 hover:text-text focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      >
        {t('piAdvisor.networkBlockedCount', { count: names.length })}
      </button>
    </Tooltip>
  );
}

export function NetworkPanel({
  hub,
  plan,
  buyInputs,
  assumesRemoval,
  planetNames,
  taxRate,
  taxRateByPlanet,
}: {
  /** The hub every price here came from. */
  hub: TradeHub;
  plan: NetworkPlan;
  /** Whether the plan was allowed to buy inputs, which decides what to explain. */
  buyInputs: boolean;
  /** The host budgets counted room the unfed factories still hold, so say so. */
  assumesRemoval: boolean;
  planetNames: ReadonlyMap<number, string>;
  taxRate: number;
  /** Each host's own rate, for a set spanning more than one system. */
  taxRateByPlanet?: ReadonlyMap<number, number>;
}) {
  const { t } = useTranslation();
  const blockers = plan.blocked.filter((line) => line.reason !== 'needs-buying');
  const nameOfPlanet = (planetId: number) =>
    planetNames.get(planetId) ?? t('piAdvisor.planetLabel', { id: planetId });
  const total = plan.opportunities.reduce((sum, line) => sum + line.marginPerHour, 0);
  const hostRate = (planetId: number) => hostRateFor(planetId, taxRateByPlanet, taxRate);
  // The footer states one customs rate only when every host in the plan
  // actually shares it — a cross-system plan is priced at each host's own
  // office (decision 20260906-144358), and naming one rate for all of them
  // would misattribute the tax on every line but the one it happens to match.
  const oneRate = plan.opportunities.every(
    (line) => hostRate(line.hostPlanetId) === hostRate(plan.opportunities[0].hostPlanetId)
  );

  return (
    <Panel
      title={t('piAdvisor.networkTitle')}
      meta={
        <span className="flex items-center gap-2 text-[0.6875rem] text-text-dim">
          <InfoTooltip
            label={t('common.aboutLabel', { label: t('piAdvisor.networkTitle') })}
            content={t('piAdvisor.networkHint')}
          />
          {plan.opportunities.length > 0 && (
            <span className="tabular-nums">
              {t('piAdvisor.networkCount', { count: plan.opportunities.length })} ·{' '}
              <span className="font-semibold text-isk-pos">
                {t('piAdvisor.gainValue', { isk: formatIsk(total) })}
              </span>
              <span className="text-text-dim">{t('piAdvisor.perHourUnit')}</span>
            </span>
          )}
        </span>
      }
      padded={false}
    >
      {plan.opportunities.length === 0 ? (
        <p className="px-3 py-2.5 text-xs text-text-dim">{t('piAdvisor.networkNothing')}</p>
      ) : (
        <ul>
          {plan.opportunities.map((line) => (
            <li key={line.typeId} className="border-b border-line px-3 py-2.5 last:border-b-0">
              <DirectiveRow
                verb="add"
                value={t('piAdvisor.gainValue', { isk: formatIsk(line.marginPerHour) })}
                unit={t('piAdvisor.perHourUnit')}
                chips={
                  // The routes are the work: an opportunity a pilot cannot see
                  // the shipping for is not actionable.
                  inputChips(line, {
                    planetNames,
                    owners: EMPTY_OWNERS,
                    hub,
                    hostPlanetId: line.hostPlanetId,
                    t,
                  })
                }
              >
                {t('piAdvisor.networkOpportunity', {
                  name: line.name,
                  factories: line.factories,
                  facility: t(`piAdvisor.pinKind.${line.facility}`),
                  host: nameOfPlanet(line.hostPlanetId),
                })}
              </DirectiveRow>
            </li>
          ))}
        </ul>
      )}

      {(plan.opportunities.length > 0 || plan.unallocated.length > 0 || blockers.length > 0) && (
        <div className="space-y-1.5 border-t border-line bg-panel-2/55 px-3 py-2.5">
          {/* A plan resting on a precondition has to name it: this one counts
              budget the unfed factories are still holding. */}
          {plan.opportunities.length > 0 && assumesRemoval && (
            <p className="text-[0.6875rem] text-warning">{t('piAdvisor.networkAssumesRemoval')}</p>
          )}

          {plan.opportunities.length > 0 && (
            <p className="text-[0.6875rem] text-text-dim">
              {oneRate
                ? t('piAdvisor.networkTotal', {
                    isk: formatIsk(total),
                    hub: hub.systemName,
                    percent: customsRatePercent(hostRate(plan.opportunities[0].hostPlanetId)),
                  })
                : t('piAdvisor.networkTotalMixedRates', {
                    isk: formatIsk(total),
                    hub: hub.systemName,
                  })}{' '}
              {plan.opportunities.length > 1 ? t('piAdvisor.networkGreedy') : ''}
            </p>
          )}

          {plan.unallocated.length > 0 && (
            <p className="text-[0.6875rem] text-text-dim">
              {t('piAdvisor.networkLeftover', {
                list: plan.unallocated
                  .map((line) =>
                    t('piAdvisor.networkLeftoverItem', {
                      units: Math.round(line.unitsPerHour).toLocaleString(),
                      name: line.name,
                    })
                  )
                  .join(' · '),
              })}
            </p>
          )}

          {!buyInputs && <ReachableByBuying plan={plan} />}

          {/* Never silently dropped: "you need more powergrid for this" is the
              actionable half, and silence reads as "there is nothing here".
              `needs-buying` is left out: with buying off it can name a dozen
              products at once, and `ReachableByBuying` above says the same
              thing in one sentence rather than a catalogue. */}
          {blockers.length > 0 && (
            <ul className="space-y-0.5 text-[0.6875rem] text-text-dim">
              {groupBlockers(blockers).map(({ reason, names }) => (
                <li key={reason}>
                  <BlockedGroupCount names={names} />{' '}
                  {t('piAdvisor.networkBlockedSuffix', {
                    reason: t(`piAdvisor.networkBlockedReason.${reason}`),
                  })}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Panel>
  );
}
