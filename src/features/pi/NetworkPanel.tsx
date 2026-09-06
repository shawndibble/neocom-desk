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
export function NetworkPanel({
  plan,
  assumesRemoval,
  planetNames,
  taxRate,
}: {
  plan: NetworkPlan;
  /** The host budgets counted room the unfed factories still hold, so say so. */
  assumesRemoval: boolean;
  planetNames: ReadonlyMap<number, string>;
  taxRate: number;
}) {
  const { t } = useTranslation();
  const nameOfPlanet = (planetId: number) =>
    planetNames.get(planetId) ?? t('piAdvisor.planetLabel', { id: planetId });
  const total = plan.opportunities.reduce((sum, line) => sum + line.marginPerHour, 0);

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
          {t('piAdvisor.networkTotal', {
            isk: formatIsk(total),
            hub: DEFAULT_TRADE_HUB.systemName,
            percent: customsRatePercent(taxRate),
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

      {/* Never silently dropped: "you need more powergrid for this" is the
          actionable half, and silence reads as "there is nothing here". */}
      {plan.blocked.length > 0 && (
        <ul className="mt-1 text-[0.6875rem] text-text-dim">
          {plan.blocked.map((line) => (
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
