/**
 * What a character's colonies could make between them — the Advisor's
 * system-level panel (ADR 0012).
 *
 * Its own file rather than another component inside `AdvisorPanel.tsx`, which
 * already carries the per-planet cards: this answers about the *set*, takes
 * only a finished plan and a name lookup, and touches nothing a card touches.
 * The same seam `RichnessRanker.tsx` and `PlanResults.tsx` sit on.
 */
import { useTranslation } from 'react-i18next';
import { Panel } from '@/components/ui';
import { formatIsk } from '@/lib/isk';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import type { NetworkPlan } from '@/engine/pi/network';
import { customsRatePercent } from './customsRate';

/**
 * What this system's colonies could make between them (ADR 0012).
 *
 * The per-planet cards each answer for one planet, which is why a four-colony
 * operation making four different P1s reads "keep selling raw" four times:
 * `localChainTargets` gates on one planet's own P0 closure and no one of them
 * reaches a P2. This is the answer they cannot give, and it sits above them
 * rather than on any one card because it is about the set.
 */
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

export function NetworkPanel({
  plan,
  buyInputs,
  assumesRemoval,
  planetNames,
  taxRate,
  taxRateByPlanet,
}: {
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
  const hostRate = (planetId: number) => taxRateByPlanet?.get(planetId) ?? taxRate;
  // The footer states one customs rate only when every host in the plan
  // actually shares it — a cross-system plan is priced at each host's own
  // office (decision 20260906-144358), and naming one rate for all of them
  // would misattribute the tax on every line but the one it happens to match.
  const oneRate = plan.opportunities.every(
    (line) => hostRate(line.hostPlanetId) === hostRate(plan.opportunities[0].hostPlanetId)
  );

  return (
    <Panel title={t('piAdvisor.networkTitle')}>
      <p className="text-xs text-text-dim">{t('piAdvisor.networkHint')}</p>

      {plan.opportunities.length === 0 ? (
        <p className="mt-2 text-xs text-text-dim">{t('piAdvisor.networkNothing')}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {plan.opportunities.map((line) => (
            <li key={line.typeId} className="space-y-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span>
                  {t('piAdvisor.networkOpportunity', {
                    factories: line.factories,
                    facility: t(`piAdvisor.pinKind.${line.facility}`),
                    host: nameOfPlanet(line.hostPlanetId),
                    name: line.name,
                  })}
                </span>
                <span className="tabular-nums text-accent">
                  {t('piAdvisor.networkValue', { isk: formatIsk(line.marginPerHour) })}
                </span>
              </div>
              {/* The routes are the work: an opportunity a pilot cannot see the
                  shipping for is not actionable. */}
              <ul className="text-[0.6875rem] text-text-dim">
                {line.inputs.map((input) => (
                  <li key={input.typeId}>
                    {input.source === 'local'
                      ? t('piAdvisor.networkRouteLocal', { name: input.name })
                      : input.source === 'bought'
                        ? t('piAdvisor.networkRouteBuy', {
                            units: Math.round(input.unitsPerHour).toLocaleString(),
                            name: input.name,
                            isk: formatIsk(input.costPerHour),
                          })
                        : t('piAdvisor.networkRouteImport', {
                            units: Math.round(input.unitsPerHour).toLocaleString(),
                            name: input.name,
                            from: nameOfPlanet(input.fromPlanetId ?? 0),
                          })}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {plan.opportunities.length > 0 && (
        <p className="mt-2 border-t border-line pt-2 text-xs text-text-dim">
          {oneRate
            ? t('piAdvisor.networkTotal', {
                isk: formatIsk(total),
                hub: DEFAULT_TRADE_HUB.systemName,
                percent: customsRatePercent(hostRate(plan.opportunities[0].hostPlanetId)),
              })
            : t('piAdvisor.networkTotalMixedRates', {
                isk: formatIsk(total),
                hub: DEFAULT_TRADE_HUB.systemName,
              })}{' '}
          {plan.opportunities.length > 1 ? t('piAdvisor.networkGreedy') : ''}
        </p>
      )}

      {/* A plan resting on a precondition has to name it: this one counts
          budget the unfed factories are still holding. */}
      {plan.opportunities.length > 0 && assumesRemoval && (
        <p className="text-[0.6875rem] text-warning">{t('piAdvisor.networkAssumesRemoval')}</p>
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
              .join(', '),
          })}
        </p>
      )}

      {!buyInputs && <ReachableByBuying plan={plan} />}

      {/* Never silently dropped: "you need more powergrid for this" is the
          actionable half, and silence reads as "there is nothing here".
          `needs-buying` is left out: with buying off it can name a dozen
          products at once, and `ReachableByBuying` above says the same thing
          in one sentence rather than a catalogue. */}
      {blockers.length > 0 && (
        <ul className="mt-1 text-[0.6875rem] text-text-dim">
          {blockers.map((line) => (
            <li key={line.typeId}>
              {t('piAdvisor.networkBlocked', {
                name: line.name,
                reason: t(`piAdvisor.networkBlockedReason.${line.reason}`),
              })}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
