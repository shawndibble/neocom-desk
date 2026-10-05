import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatChip,
  StatChips,
} from '@/components/ui';
import { securityStatusColor, shownSecurity } from '@/engine/securityStatus';
import { routeExposure } from '@/features/contractSearch/routeExposure';
import { loadSystemNameAndSecurity } from '@/features/character/systemSecurity';
import { useJumpBasis } from '@/features/route/jumpBasis';
import { TRADE_HUBS, type TradeHub } from '@/market/hubs';
import { EstimateBadge } from './DirectiveRow';
import { homeSystemId, routeFigures, type RouteFigures } from './sellRoute';
import { useSellHub } from './sellHub';

interface Props {
  /** The solar system of each of the active Character's colonies. */
  colonySystemIds: readonly number[];
  /** Plan's prices and figures are projections; the other tabs show no such number. */
  estimate: boolean;
}

interface Home {
  systemId: number;
  name: string | null;
  security: number | null;
}

/**
 * The strip under the PI tabs, shared by all three: where the pilot's colonies
 * are, how many, the way to the sell market, and which market that is. Only
 * what there is data for today: a field with no source is left out.
 */
export function PiHeaderStrip({ colonySystemIds, estimate }: Props) {
  const { t } = useTranslation();
  const { hub, setHub } = useSellHub();
  const basis = useJumpBasis();
  const homeId = homeSystemId(colonySystemIds);
  const [home, setHome] = useState<Home | null>(null);
  const [route, setRoute] = useState<{ key: string; figures: RouteFigures | null } | null>(null);

  useEffect(() => {
    if (homeId === null) return;
    let cancelled = false;
    void loadSystemNameAndSecurity(homeId)
      .catch(() => ({ name: null, security: null }))
      .then((found) => {
        if (!cancelled) setHome({ systemId: homeId, ...found });
      });
    return () => {
      cancelled = true;
    };
  }, [homeId]);

  const routeKey = `${basis.key}|${homeId}|${hub.systemId}`;
  useEffect(() => {
    if (homeId === null || !basis.hydrated) return;
    let cancelled = false;
    void routeExposure(homeId, hub.systemId, basis.rules, basis.network)
      .catch(() => ({ kind: 'unknown' as const }))
      .then((result) => {
        if (cancelled) return;
        setRoute({
          key: routeKey,
          figures:
            result.kind === 'known' ? routeFigures(result.path.map((s) => s.security)) : null,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [homeId, hub.systemId, basis, routeKey]);

  const shownHome = home?.systemId === homeId ? home : null;
  const figures = route?.key === routeKey ? route.figures : null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-testid="pi-header-strip">
      <StatChips>
        {homeId !== null && shownHome?.name && (
          <StatChip
            label={t('piPlan.strip.home')}
            value={
              <>
                {shownHome.name}
                {shownHome.security !== null && (
                  <>
                    {' '}
                    <span style={{ color: securityStatusColor(shownHome.security) }}>
                      {shownSecurityText(shownHome.security)}
                    </span>
                  </>
                )}
              </>
            }
          />
        )}
        <StatChip label={t('piPlan.strip.colonies')} value={colonySystemIds.length} />
      </StatChips>
      <label className="flex items-center gap-2">
        <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('piPlan.strip.sellAt')}
        </span>
        <Select value={hub.id} onValueChange={(id) => setHub(id as TradeHub['id'])}>
          <SelectTrigger className="w-40" aria-label={t('piPlan.strip.sellAt')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TRADE_HUBS.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.systemName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      {figures && (
        <StatChips>
          <StatChip
            label={t('piPlan.strip.route')}
            value={
              <>
                {t('piPlan.strip.jumps', { count: figures.jumps, hub: hub.systemName })}
                {figures.lowsecJumps > 0 && (
                  <span className="text-warning">
                    {' · '}
                    {t('piPlan.strip.lowsecJumps', { count: figures.lowsecJumps })}
                  </span>
                )}
              </>
            }
          />
        </StatChips>
      )}
      {estimate && <EstimateBadge />}
    </div>
  );
}

function shownSecurityText(security: number): string {
  return shownSecurity(security).toFixed(1);
}
