/**
 * "Find a Lava planet near <home>": the nearest systems that hold the planet
 * type(s) wanted, from the SDE planet counts and the stargate graph. The
 * origin is the pilot's home system (where most of their colonies are); a pilot
 * with no colony has no home, and the finder says so rather than assuming a
 * hub.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import type { PlanetType } from '@/engine/pi/goalTypes';
import {
  nearestSystemsWithPlanetTypes,
  type NearestPlanetTypesResult,
} from '@/engine/pi/nearestPlanetTypes';
import { securityBand, securityStatusColor, shownSecurity } from '@/engine/securityStatus';
import { SystemLink } from '@/features/entities';
import { loadPiSystemPlanets } from '@/sde/loadSde';
import { loadJumpGraph } from '@/sde/jumpGraph';
import { loadSolarSystemsById } from '@/sde/solarSystems';
import { defaultHighsecOnly } from '../findBestView';
import { planetName } from './mapText';

const MAX_JUMPS = 12;
const LIMIT = 5;

interface Loaded {
  results: NearestPlanetTypesResult[];
  names: ReadonlyMap<number, string>;
}

export function PlanetFinder({
  types,
  homeSystemId,
  homeName,
  homeSecurity,
}: {
  types: readonly PlanetType[];
  homeSystemId: number | null;
  homeName: string | null;
  /** Seeds "Highsec only": on from a highsec home, off from low/null/wormhole or unknown. */
  homeSecurity: number | null;
}) {
  const { t } = useTranslation();
  const [highsecPick, setHighsecPick] = useState<boolean | null>(null);
  const highsecOnly = highsecPick ?? defaultHighsecOnly(homeSecurity);
  const typesKey = types.join(',');
  const [state, setState] = useState<{ key: string; loaded: Loaded | 'failed' } | null>(null);
  const key = `${homeSystemId}|${typesKey}|${highsecOnly}`;

  useEffect(() => {
    if (homeSystemId === null || types.length === 0) return;
    let cancelled = false;
    void Promise.all([loadJumpGraph(), loadPiSystemPlanets(), loadSolarSystemsById()]).then(
      ([graph, systemPlanets, systems]) => {
        if (cancelled) return;
        if (!graph || !systems) {
          setState({ key, loaded: 'failed' });
          return;
        }
        const results = nearestSystemsWithPlanetTypes({
          originSystemId: homeSystemId,
          planetTypes: types,
          maxJumps: MAX_JUMPS,
          graph,
          securityOf: (id) => systems.get(id)?.security,
          systemPlanets,
          highsecOnly,
          limit: LIMIT,
        });
        setState({
          key,
          loaded: {
            results,
            names: new Map(results.map((r) => [r.systemId, systems.get(r.systemId)?.name ?? ''])),
          },
        });
      },
      () => {
        if (!cancelled) setState({ key, loaded: 'failed' });
      }
    );
    return () => {
      cancelled = true;
    };
    // `types` is read through `typesKey`; `key` covers every input.
  }, [homeSystemId, typesKey, highsecOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  const typeNames = useMemo(() => types.map((type) => planetName(t, type)), [types, t]);
  const heading = t('piMap.finder.title', {
    types: typeNames.join(` ${t('piMap.finder.or')} `),
    home: homeName ?? t('piMap.finder.homeFallback'),
  });

  if (homeSystemId === null) {
    return (
      <section aria-label={heading}>
        <h4 className="text-[11px] font-semibold tracking-widest text-text-dim uppercase">
          {heading}
        </h4>
        <p className="mt-1.5 text-xs text-text-dim">{t('piMap.finder.noHome')}</p>
      </section>
    );
  }

  const current = state?.key === key ? state.loaded : null;
  return (
    <section aria-label={heading}>
      <h4 className="text-[11px] font-semibold tracking-widest text-text-dim uppercase">
        {heading}
      </h4>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
        <label className={`inline-flex items-center gap-1.5 text-xs ${tappableRowClassName}`}>
          <Checkbox checked={highsecOnly} onChange={(e) => setHighsecPick(e.target.checked)} />
          {t('piMap.finder.highsecOnly')}
        </label>
      </div>
      <div aria-live="polite">
        {current === null ? (
          <p className="py-1.5 text-xs text-text-dim">{t('piMap.finder.loading')}</p>
        ) : current === 'failed' ? (
          <p className="py-1.5 text-xs text-text-dim">{t('piMap.finder.failed')}</p>
        ) : current.results.length === 0 ? (
          <p className="py-1.5 text-xs text-text-dim">
            {t(highsecOnly ? 'piMap.finder.noneHighsec' : 'piMap.finder.none', {
              jumps: MAX_JUMPS,
            })}
          </p>
        ) : (
          <ul className="mt-1 divide-y divide-line border-t border-line">
            {current.results.map((r) => (
              <li
                key={r.systemId}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1.5 text-xs"
              >
                <SystemLink systemId={r.systemId} className="font-semibold">
                  {current.names.get(r.systemId) || t('piMap.finder.system', { id: r.systemId })}
                </SystemLink>
                {r.security !== undefined && (
                  <span className="tabular-nums" style={{ color: securityStatusColor(r.security) }}>
                    <span className="sr-only">
                      {t(`piMap.finder.band.${securityBand(r.security)}`)}{' '}
                    </span>
                    {shownSecurity(r.security).toFixed(1)}
                  </span>
                )}
                <span className="text-text-dim">
                  {r.jumps === 0
                    ? t('piMap.finder.here')
                    : t('piMap.finder.jumps', { count: r.jumps })}
                </span>
                <span className="basis-full text-text-dim">
                  {(Object.entries(r.planetCounts) as [PlanetType, number][])
                    .map(([type, count]) => `${planetName(t, type)} ×${count}`)
                    .join(', ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
