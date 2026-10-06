import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
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
import { HintText } from '@/components/ui/HintText';
import { inlineLinkClassName, tappableRowClassName } from '@/components/ui/controlStyles';
import { PageSettingsModal } from '@/features/settings/PageSettingsModal';
import { PiSettingsForm } from '@/features/settings/PiSettingsForm';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { useTicker } from '@/lib/ticker';
import { getTradeHub, TRADE_HUBS, type TradeHub } from '@/market/hubs';
import { eveClock } from './colonies/coloniesFormat';
import { EstimateBadge } from './DirectiveRow';
import {
  homeSystemId,
  nearestHub,
  routeFigures,
  type NearestHub,
  type RouteFigures,
} from './sellRoute';
import { DEFAULT_BUYBACK_PCT, PI_BUYBACK_PCT_OPTIONS } from './piSettings';
import { useSellHub } from './sellHub';

const BUYBACK = 'buyback';

interface Props {
  /** The solar system of each of the active Character's colonies. */
  colonySystemIds: readonly number[];
  /** The colony list could not be read: the count is unknown, not 0. */
  colonyCountUnknown?: boolean;
  /** Plan's prices and figures are projections; the other tabs show no such number. */
  estimate: boolean;
  /** Show the EVE clock (Colonies, where timers read in EVE time). */
  eveTime?: boolean;
}

/** The current EVE (UTC) time, ticking each half minute. */
function EveTimeChip() {
  const { t } = useTranslation();
  const now = useTicker(30_000);
  return <StatChip label={t('piPlan.strip.eveTime')} value={eveClock(now)} />;
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
export function PiHeaderStrip({
  colonySystemIds,
  colonyCountUnknown,
  estimate,
  eveTime = false,
}: Props) {
  const { t } = useTranslation();
  const { hub, buybackPct, hubChosen, setHub, setBuyback, keepHub } = useSellHub();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const mdUp = useMediaQuery('(min-width: 48rem)');
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
    if (homeId === null || !basis.hydrated || buybackPct !== null) return;
    let cancelled = false;
    void hubRouteFigures(homeId, hub.systemId, basis).then((found) => {
      if (!cancelled) setRoute({ key: routeKey, figures: found });
    });
    return () => {
      cancelled = true;
    };
  }, [homeId, hub.systemId, basis, routeKey, buybackPct]);

  // Until the pilot picks a hub, find the nearest one by gate route (#2705).
  const suggestKey = `${basis.key}|${homeId}`;
  const [suggest, setSuggest] = useState<{ key: string; nearest: NearestHub | null } | null>(null);
  useEffect(() => {
    if (homeId === null || !basis.hydrated || hubChosen) return;
    let cancelled = false;
    void Promise.all(
      TRADE_HUBS.map((h) =>
        hubRouteFigures(homeId, h.systemId, basis).then((figures) => ({ hub: h.id, figures }))
      )
    ).then((routes) => {
      if (!cancelled) setSuggest({ key: suggestKey, nearest: nearestHub(routes, hub.id) });
    });
    return () => {
      cancelled = true;
    };
  }, [homeId, basis, suggestKey, hubChosen, hub.id]);
  const nearest = !hubChosen && suggest?.key === suggestKey ? suggest.nearest : null;
  const nearestOption = nearest && nearest.hub !== hub.id ? getTradeHub(nearest.hub) : null;

  const shownHome = home?.systemId === homeId ? home : null;
  const figures = buybackPct === null && route?.key === routeKey ? route.figures : null;

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
        <StatChip
          label={t('piPlan.strip.colonies')}
          value={colonyCountUnknown ? '—' : colonySystemIds.length}
        />
        {eveTime && <EveTimeChip />}
      </StatChips>
      <label className="flex flex-wrap items-center gap-x-2 gap-y-1 max-md:flex-col max-md:items-start">
        <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('piPlan.strip.sellAt')}
        </span>
        <Select
          value={buybackPct === null ? hub.id : BUYBACK}
          onValueChange={(value) =>
            value === BUYBACK ? setBuyback(DEFAULT_BUYBACK_PCT) : setHub(value as TradeHub['id'])
          }
        >
          <SelectTrigger
            size={mdUp ? 'sm' : 'md'}
            className="w-auto min-w-40"
            aria-label={t('piPlan.strip.sellAt')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TRADE_HUBS.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.systemName}
              </SelectItem>
            ))}
            <SelectItem value={BUYBACK}>{t('piPlan.strip.corpBuyback')}</SelectItem>
          </SelectContent>
        </Select>
        {buybackPct !== null && (
          <Select value={String(buybackPct)} onValueChange={(pct) => setBuyback(Number(pct))}>
            <SelectTrigger
              size={mdUp ? 'sm' : 'md'}
              className="w-auto min-w-40"
              aria-label={t('piPlan.strip.buybackRate')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...new Set([...PI_BUYBACK_PCT_OPTIONS, buybackPct])]
                .sort((x, y) => x - y)
                .map((pct) => (
                  <SelectItem key={pct} value={String(pct)}>
                    {t('piPlan.strip.buybackPct', { pct, hub: hub.systemName })}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
      </label>
      {nearest && nearestOption && buybackPct === null && (
        <div
          className="flex flex-wrap items-center gap-2 text-sm"
          role="status"
          data-testid="pi-nearest-hub"
        >
          <span className="text-text-dim">
            {t('piPlan.strip.nearestHub', {
              count: nearest.jumps,
              hub: nearestOption.systemName,
            })}
          </span>
          <Button size="sm" onClick={() => setHub(nearestOption.id)}>
            {t('piPlan.strip.useHub', { hub: nearestOption.systemName })}
          </Button>
          <Button size="sm" variant="ghost" onClick={keepHub}>
            {t('piPlan.strip.keepHub', { hub: hub.systemName })}
          </Button>
        </div>
      )}
      {buybackPct !== null && homeId !== null && (
        <StatChips>
          <StatChip label={t('piPlan.strip.route')} value={t('piPlan.strip.dropOff')} />
        </StatChips>
      )}
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
      <button
        type="button"
        className={`${inlineLinkClassName} ${tappableRowClassName} text-xs`}
        onClick={() => setSettingsOpen(true)}
      >
        {t('piPlan.strip.settings')}
      </button>
      {estimate && (
        <span className="inline-flex items-center gap-2 text-xs text-text-dim">
          <EstimateBadge />
          <HintText content={t('piPlan.strip.priceNoteHint')}>
            {t('piPlan.strip.priceNote')}
          </HintText>
        </span>
      )}
      <PageSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        pageName={t('pi.title')}
        section="industry"
      >
        <PiSettingsForm />
      </PageSettingsModal>
    </div>
  );
}

/** Figures for the gate route home to a hub, or null when it is unknown or there is none. */
async function hubRouteFigures(
  homeId: number,
  hubSystemId: number,
  basis: ReturnType<typeof useJumpBasis>
): Promise<RouteFigures | null> {
  const result = await routeExposure(homeId, hubSystemId, basis.rules, basis.network).catch(() => ({
    kind: 'unknown' as const,
  }));
  return result.kind === 'known' ? routeFigures(result.path.map((x) => x.security)) : null;
}

function shownSecurityText(security: number): string {
  return shownSecurity(security).toFixed(1);
}
