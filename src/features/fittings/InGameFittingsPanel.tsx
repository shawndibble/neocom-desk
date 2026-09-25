/**
 * In-game Fittings (issue #1539): the active Character's ESI-saved fittings,
 * grouped by hull, Load into the editor on Open. Gated at this panel, not the
 * `/fittings` route (`routeScopes.ts`) — Load (EFT paste), stats and editing
 * all work with no grant at all, same reasoning as Clones' `ReauthBanner`.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  EmptyState,
  IconButton,
  Panel,
  ReauthBanner,
  Spinner,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { beginEveLogin } from '@/app/loginFlow';
import { useEndpointsGranted } from '@/app/useGrantedScopes';
import { esiFittingToFitting } from '@/engine/fittings/esiFittingMapper';
import type { LoadedFitting } from '@/engine/fittings/load';
import { groupByHull, type MyFittingRow } from '@/engine/fittings/myFittings';
import type { CachedResult } from '@/esi/cache';
import type { CharacterFitting } from '@/esi/endpoints';
import { loadTypes } from '@/sde/loadSde';
import { loadInGameFittings } from './inGameFittings';

interface InGameFittingsPanelProps {
  characterId: number;
  onOpen: (loaded: LoadedFitting) => void;
}

export function InGameFittingsPanel({ characterId, onOpen }: InGameFittingsPanelProps) {
  const { t } = useTranslation();
  const granted = useEndpointsGranted(['getCharacterFittings']);
  const [result, setResult] = useState<CachedResult<CharacterFitting[]> | null>(null);
  const [hullNames, setHullNames] = useState<ReadonlyMap<number, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

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
    if (granted === true) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh() reads characterId via closure; a Character switch is the only thing that should re-fetch.
  }, [characterId, granted]);

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
        <ReauthBanner
          title={t('fittings.inGame.reauthTitle')}
          hint={t('fittings.inGame.reauthHint')}
          actionLabel={t('fittings.inGame.reauthAction')}
          onLogin={() => void beginEveLogin({ groups: ['fittings'] })}
        />
      ) : error ? (
        <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
      ) : fittings.length === 0 ? (
        <EmptyState title={t('fittings.inGame.emptyTitle')} hint={t('fittings.inGame.emptyHint')} />
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <div key={group.hull ?? ''}>
              <p className="mb-1 text-xs font-semibold text-text-dim uppercase">{group.hull}</p>
              <ul className="space-y-1">
                {group.rows.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm">{row.name}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onOpen(esiFittingToFitting(row.fitting))}
                    >
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
