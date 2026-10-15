import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatChip,
  Tooltip,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { securityStatusColor, shownSecurity } from '@/engine/securityStatus';
import { routeExposure } from '@/features/route/routeExposure';
import { loadCharacterSolarSystemId } from '@/features/character/location';
import { loadSystemNameAndSecurity } from '@/features/character/systemSecurity';
import { useJumpBasis } from '@/features/route/jumpBasis';
import { useNow } from '@/lib/useNow';
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
  /**
   * The Character whose current system stands in for home: set only once the
   * colony list is read and empty, so a list still loading (or unreadable) is
   * never taken for none. Never a hub default: no location, no home.
   */
  locationCharacterId?: number | null;
  /** Plan's prices and figures are projections; the other tabs show no such number. */
  estimate: boolean;
  /** Show the EVE clock (Colonies, where timers read in EVE time). */
  eveTime?: boolean;
}

/** The current EVE (UTC) time. */
function EveTimeChip() {
  const { t } = useTranslation();
  const now = useNow();
  return <StatChip label={t('piPlan.strip.eveTime')} value={eveClock(now)} />;
}

interface Home {
  systemId: number;
  name: string | null;
  security: number | null;
}

/**
 * The strip under the PI tabs, shared by all three: one slim row with the sell
 * market, the nearest-hub nudge, an Est. chip and an "i" popover holding where
 * the pilot's colonies are (with none, where the pilot is), how many, the way
 * to the sell market and (on Colonies) EVE time. Settings live behind the page
 * header's gear, not here. Only what there is data
 * for today: a field with no source is left out.
 */
export function PiHeaderStrip({
  colonySystemIds,
  colonyCountUnknown,
  locationCharacterId = null,
  estimate,
  eveTime = false,
}: Props) {
  const { t } = useTranslation();
  const { hub, buybackPct, hubChosen, setHub, setBuyback, keepHub } = useSellHub();
  const basis = useJumpBasis();
  const colonyHome = homeSystemId(colonySystemIds);
  const [located, setLocated] = useState<{
    characterId: number;
    systemId: number | null;
  } | null>(null);
  useEffect(() => {
    if (colonyHome !== null || locationCharacterId === null) return;
    let cancelled = false;
    void loadCharacterSolarSystemId(locationCharacterId)
      .catch(() => null)
      .then((systemId) => {
        if (!cancelled) setLocated({ characterId: locationCharacterId, systemId });
      });
    return () => {
      cancelled = true;
    };
  }, [colonyHome, locationCharacterId]);
  const locationId =
    colonyHome === null && located !== null && located.characterId === locationCharacterId
      ? located.systemId
      : null;
  // Where the route and the nearest-hub nudge start: the colonies, else the pilot.
  const homeId = colonyHome ?? locationId;
  // With no colony, the chips say where the figures start: here, not home.
  const label =
    colonyHome === null && homeId !== null
      ? { home: 'location', route: 'routeFromHere', dropOff: 'dropOffHere' }
      : { home: 'home', route: 'route', dropOff: 'dropOff' };
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

  const homeChip = homeId !== null && shownHome?.name && (
    <StatChip
      label={t(`piPlan.strip.${label.home}`)}
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
  );
  const routeChip =
    buybackPct !== null && homeId !== null ? (
      <StatChip
        label={t(`piPlan.strip.${label.route}`)}
        value={t(`piPlan.strip.${label.dropOff}`)}
      />
    ) : figures ? (
      <StatChip
        label={t(`piPlan.strip.${label.route}`)}
        value={
          <>
            {t('piPlan.strip.jumps', { count: figures.jumps, hub: hub.systemName })}
            {figures.lowsecJumps > 0 && (
              <span className="text-warning">
                {' · '}
                {t('piPlan.strip.lowsecJumps', { count: figures.lowsecJumps })}
              </span>
            )}
            {figures.nullsecJumps > 0 && (
              <span className="text-danger">
                {' · '}
                {t('piPlan.strip.nullsecJumps', { count: figures.nullsecJumps })}
              </span>
            )}
          </>
        }
      />
    ) : null;

  // One slim row: the sell market first, the facts about home behind an "i".
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2" data-testid="pi-header-strip">
      <div className="flex items-center gap-2">
        <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase max-md:sr-only">
          {t('piPlan.strip.sellAtShort')}
        </span>
        <Select
          value={buybackPct === null ? hub.id : BUYBACK}
          onValueChange={(value) =>
            value === BUYBACK ? setBuyback(DEFAULT_BUYBACK_PCT) : setHub(value as TradeHub['id'])
          }
        >
          <SelectTrigger
            size="sm"
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
              size="sm"
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
      </div>
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
      <div className="ml-auto flex items-center gap-1.5">
        {estimate && (
          <Tooltip content={t('piPlan.strip.priceNoteHint')} openOnTap>
            <button
              type="button"
              aria-label={t('piPlan.strip.priceNote')}
              className="inline-flex min-h-6 items-center rounded-xs focus-visible:outline-2 focus-visible:outline-accent"
            >
              <EstimateBadge />
            </button>
          </Tooltip>
        )}
        <Popover>
          <PopoverTrigger asChild>
            <IconButton
              icon={<Icon.Info />}
              label={t('piPlan.strip.facts')}
              size="sm"
              aria-haspopup="dialog"
            />
          </PopoverTrigger>
          <PopoverContent
            align="end"
            aria-label={t('piPlan.strip.facts')}
            className="flex w-[min(20rem,calc(100vw-1rem))] flex-col gap-1 p-3"
            data-testid="pi-strip-facts"
          >
            {homeChip}
            <StatChip
              label={t('piPlan.strip.colonies')}
              value={colonyCountUnknown ? '—' : colonySystemIds.length}
            />
            {routeChip}
            {eveTime && <EveTimeChip />}
          </PopoverContent>
        </Popover>
      </div>
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
