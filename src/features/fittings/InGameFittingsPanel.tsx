/**
 * In-game Fittings (issue #1539): the active Character's ESI-saved fittings,
 * grouped by hull, Load into the editor on Open. Gated at this panel, not the
 * `/fittings` route (`routeScopes.ts`) — Load (EFT paste), stats and editing
 * all work with no grant at all, same reasoning as Clones' `ReauthBanner`.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, DataAgeBadge, EmptyState, IconButton, Panel, Spinner } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { GrantBanner } from '@/app/GrantNote';
import { useEndpointsGranted } from '@/app/useGrantedScopes';
import {
  esiFittingToFitting,
  type EsiFittingUnresolvedItem,
} from '@/engine/fittings/esiFittingMapper';
import { groupByHull, type MyFittingRow } from '@/engine/fittings/myFittings';
import type { Fitting } from '@/engine/fittings/types';
import type { CachedResult } from '@/esi/cache';
import type { CharacterFitting } from '@/esi/endpoints';
import { loadTypes } from '@/sde/loadSde';
import { loadInGameFittings } from './inGameFittings';

interface InGameFittingsPanelProps {
  characterId: number;
  onOpen: (fitting: Fitting) => void;
}

export function InGameFittingsPanel({ characterId, onOpen }: InGameFittingsPanelProps) {
  const { t } = useTranslation();
  const granted = useEndpointsGranted(['getCharacterFittings']);
  const [result, setResult] = useState<CachedResult<CharacterFitting[]> | null>(null);
  const [hullNames, setHullNames] = useState<ReadonlyMap<number, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  // The most recent Open's dropped items (FighterBay/ServiceSlot — carriers,
  // structures — this app has no rack for), so a partial Load says so instead
  // of silently opening short.
  const [openUnresolved, setOpenUnresolved] = useState<{
    name: string;
    items: EsiFittingUnresolvedItem[];
  } | null>(null);

  // Guards a Character switch mid-fetch: a stale response landing after a
  // newer request started must not overwrite what that newer request set.
  const requestIdRef = useRef(0);

  async function refresh() {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(false);
    try {
      const { cached } = await loadInGameFittings(characterId);
      const types = await loadTypes();
      if (requestId !== requestIdRef.current) return;
      const names = new Map<number, string>();
      for (const fitting of cached?.data ?? []) {
        if (!names.has(fitting.ship_type_id)) {
          names.set(
            fitting.ship_type_id,
            types[String(fitting.ship_type_id)]?.name ??
              t('common.unknownType', { id: fitting.ship_type_id })
          );
        }
      }
      setResult(cached);
      setHullNames(names);
    } catch {
      if (requestId === requestIdRef.current) setError(true);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    requestIdRef.current++;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset for a new Character/grant, not a render-time derivation
    setResult(null);
    setError(false);
    setOpenUnresolved(null);
    if (granted === true) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh() reads characterId via closure; a Character switch is the only thing that should re-fetch.
  }, [characterId, granted]);

  function handleOpen(fitting: CharacterFitting) {
    const { fitting: mapped, unresolved } = esiFittingToFitting(fitting);
    setOpenUnresolved(unresolved.length > 0 ? { name: fitting.name, items: unresolved } : null);
    onOpen(mapped);
  }

  const fittings = result?.data ?? [];
  const groups = useMemo(() => {
    const rows: (MyFittingRow & { fitting: CharacterFitting })[] = fittings.map((fitting) => ({
      id: String(fitting.fitting_id),
      name: fitting.name,
      hull:
        hullNames.get(fitting.ship_type_id) ??
        t('common.unknownType', { id: fitting.ship_type_id }),
      fitting,
    }));
    return groupByHull(rows);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `fittings` is a stable derivation of `result`; depending on `result` avoids recomputing on every render.
  }, [result, hullNames]);

  return (
    <Panel
      title={t('fittings.inGame.title')}
      actions={
        granted === true ? (
          <span className="flex items-center gap-2">
            {result && <DataAgeBadge date={result.fetchedAt} />}
            <IconButton
              size="sm"
              icon={<Icon.Refresh />}
              label={t('fittings.inGame.refresh')}
              onClick={() => void refresh()}
              disabled={loading}
            />
          </span>
        ) : undefined
      }
    >
      {granted === undefined || (loading && !result) ? (
        <div className="flex justify-center py-8">
          <Spinner label={t('common.loading')} />
        </div>
      ) : granted === false ? (
        <GrantBanner
          characterId={characterId}
          endpoints={['getCharacterFittings']}
          title={t('fittings.inGame.reauthTitle')}
          hint={t('fittings.inGame.reauthHint')}
          actionLabel={t('fittings.inGame.reauthAction')}
        />
      ) : error ? (
        <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
      ) : fittings.length === 0 ? (
        <EmptyState title={t('fittings.inGame.emptyTitle')} hint={t('fittings.inGame.emptyHint')} />
      ) : (
        <div className="space-y-3">
          {openUnresolved && (
            <p role="alert" className="text-xs text-warning">
              {t('fittings.inGame.unresolvedNote', {
                count: openUnresolved.items.length,
                name: openUnresolved.name,
              })}
            </p>
          )}
          {groups.map((group) => (
            <div key={group.hull ?? ''}>
              <p className="mb-1 text-xs font-semibold text-text-dim uppercase">{group.hull}</p>
              <ul className="space-y-1">
                {group.rows.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm">{row.name}</span>
                    <Button size="sm" variant="ghost" onClick={() => handleOpen(row.fitting)}>
                      {t('fittings.inGame.openAction')}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
