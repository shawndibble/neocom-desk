import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Spinner, Tabs, Tooltip, TypeIcon } from '@/components/ui';
import type { LoadedFitting } from '@/engine/fittings/load';
import { popularFitLoad, type PopularFit } from '@/engine/fittings/popularFits';
import { FITTING_SLOT_KINDS, type FittingSlotKind } from '@/engine/fittings/types';
import { typeName } from '@/sde/loadSde';
import { formatAge } from '@/lib/age';
import { cx } from '@/lib/cx';
import { formatIskCompact } from '@/lib/isk';
import { useNow } from '@/lib/useNow';
import { loadFittingFromText } from './loadFittingFromText';
import { usePopularFits } from './popularFits';
import { useWorkbenchFits, workbenchFitUrl, type WorkbenchFit } from './workbenchFits';
import { useWorkbenchFitList } from './workbenchFitCurrency';
import { OutOfDateReasons, OutOfDateToggle } from './WorkbenchOutOfDate';

interface PopularFitsPanelProps {
  shipTypeId: number;
  hullName: string;
  onOpen: (loaded: LoadedFitting) => void;
  /** An open already under way: Open waits for it. */
  busy?: boolean;
  /**
   * Cap the list's height and scroll it in place — for a host with other
   * content below it. Off, the list runs its full length and the host scrolls.
   */
  capped?: boolean;
}

/** A row's fitted modules by rack, in rack order; empty racks left out. */
function modulesByRack(fit: PopularFit): { rack: FittingSlotKind; typeIds: number[] }[] {
  return FITTING_SLOT_KINDS.map((rack) => ({
    rack,
    typeIds: fit.parts.modules.filter((module) => module.slot === rack).map((m) => m.typeId),
  })).filter((group) => group.typeIds.length > 0);
}

/** Names for every fitted module across the fits, from the SDE; empty until they land. */
function useModuleNames(fits: readonly PopularFit[] | null): ReadonlyMap<number, string> {
  const [names, setNames] = useState<ReadonlyMap<number, string>>(new Map());
  useEffect(() => {
    if (fits === null) return;
    let cancelled = false;
    const typeIds = [...new Set(fits.flatMap((fit) => fit.parts.modules.map((m) => m.typeId)))];
    void Promise.all(
      typeIds.map(async (typeId): Promise<[number, string]> => [typeId, await typeName(typeId)])
    )
      .then((resolved) => {
        if (!cancelled) setNames(new Map(resolved));
      })
      // No SDE, no names: the icons keep their `#id` fallback.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [fits]);
  return names;
}

type PopularFitsSource = 'zkillboard' | 'workbench';

/**
 * Popular fits (issues #2327, #2484), in two tabs. zKillboard: the hull's
 * recent losses grouped into distinct fits. EVE Workbench: the community fits
 * published there for the hull, from our own synced copy (`workbenchFits.ts`).
 * Either opens a fit in the editor; a failure is a one-line note — the rest of
 * the page works without it.
 */
export function PopularFitsPanel(props: PopularFitsPanelProps) {
  const { t } = useTranslation();
  const [source, setSource] = useState<PopularFitsSource>('zkillboard');

  return (
    <section aria-label={t('fittings.popular.title')} className="space-y-2">
      <h3 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {t('fittings.popular.title')}
      </h3>
      <Tabs
        label={t('fittings.popular.sourceLabel')}
        tabs={[
          { id: 'zkillboard', label: t('fittings.popular.tabZkillboard') },
          { id: 'workbench', label: t('fittings.popular.tabWorkbench') },
        ]}
        value={source}
        onChange={(id) => setSource(id as PopularFitsSource)}
      />
      {source === 'zkillboard' ? <ZkillboardFits {...props} /> : <WorkbenchFits {...props} />}
    </section>
  );
}

/** The zKillboard tab: the hull's recent losses grouped into distinct fits (issue #2327). */
function ZkillboardFits({
  shipTypeId,
  hullName,
  onOpen,
  busy = false,
  capped = true,
}: PopularFitsPanelProps) {
  const { t } = useTranslation();
  const result = usePopularFits(shipTypeId);
  const now = useNow();
  const names = useModuleNames(result?.ok ? result.fits : null);

  return (
    <>
      {result === null ? (
        <Spinner size="sm" delayMs={200} label={t('fittings.popular.loading')} />
      ) : !result.ok ? (
        <p role="status" className="text-xs text-warning">
          {t('fittings.popular.failed')}
        </p>
      ) : result.fits.length === 0 ? (
        <p className="text-xs text-text-dim">{t('fittings.popular.empty')}</p>
      ) : (
        <ul className={cx('space-y-1', capped && 'max-h-72 overflow-y-auto')}>
          {result.fits.map((fit, index) => (
            <li
              key={fit.key}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border border-line bg-panel px-2 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  {t('fittings.popular.losses', { count: fit.count })}
                  <span className="text-text-dim">
                    {fit.lastSeen !== null &&
                      ` · ${t('fittings.popular.lastSeen', {
                        age: formatAge(Math.max(0, now - Date.parse(fit.lastSeen)), t),
                      })}`}
                    {fit.value !== null &&
                      ` · ${t('fittings.popular.value', { value: formatIskCompact(fit.value) })}`}
                  </span>
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-y-1">
                  {modulesByRack(fit).map(({ rack, typeIds }, rackIndex) => (
                    <div
                      key={rack}
                      role="group"
                      aria-label={t(`fittings.list.rack.${rack}`)}
                      className={cx(
                        'flex flex-wrap gap-0.5',
                        rackIndex > 0 && 'ml-1.5 border-l border-line pl-1.5'
                      )}
                    >
                      {typeIds.map((typeId, slotIndex) => {
                        const name = names.get(typeId) ?? `#${typeId}`;
                        // Not a tab stop: ~20 per fit would bury Open; the name reaches
                        // screen readers as the icon's label, and touch reads it by tap.
                        return (
                          <Tooltip key={slotIndex} content={name} openOnTap>
                            <span role="img" aria-label={name} className="inline-flex">
                              <TypeIcon typeId={typeId} size={32} width={20} height={20} />
                            </span>
                          </Tooltip>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  onOpen(
                    popularFitLoad(
                      fit,
                      t('fittings.popular.fitName', { hullName, rank: index + 1 })
                    )
                  )
                }
              >
                {t('fittings.popular.open')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * The EVE Workbench tab (issue #2484): the hull's published fits, newest
 * first, each Loaded from its stored EFT through the ordinary text Load.
 */
function WorkbenchFits({ shipTypeId, onOpen, busy = false, capped = true }: PopularFitsPanelProps) {
  const { t } = useTranslation();
  const result = useWorkbenchFits(shipTypeId);
  // Out-of-date fits (issue #2485) sort below, shown only on request.
  const list = useWorkbenchFitList(result?.ok ? result.fits : null);
  const now = useNow();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);

  async function load(fit: WorkbenchFit) {
    setLoadingId(fit.id);
    setFailedId(null);
    try {
      // The fit's own EFT header names it.
      const outcome = await loadFittingFromText(fit.eft);
      if (outcome.kind === 'fitting') onOpen(outcome);
      else setFailedId(fit.id);
    } catch {
      setFailedId(fit.id);
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <>
      <p className="text-xs text-text-dim">
        {t('fittings.popular.workbench.attribution')}{' '}
        <a
          href="https://eveworkbench.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline"
        >
          eveworkbench.com
        </a>
      </p>
      {result === null ? (
        <Spinner size="sm" delayMs={200} label={t('fittings.popular.workbench.loading')} />
      ) : !result.ok ? (
        <p role="status" className="text-xs text-warning">
          {t('fittings.popular.workbench.failed')}
        </p>
      ) : result.fits.length === 0 ? (
        <p className="text-xs text-text-dim">{t('fittings.popular.workbench.empty')}</p>
      ) : (
        <ul className={cx('space-y-1', capped && 'max-h-72 overflow-y-auto')}>
          {list.listed.map((fit) => (
            <li
              key={fit.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border border-line bg-panel px-2 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <a
                  href={workbenchFitUrl(fit.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-sm hover:underline"
                >
                  {fit.name || t('fittings.popular.workbench.unnamed')}
                </a>
                <p className="text-xs text-text-dim">
                  {t('fittings.popular.workbench.byline', {
                    author: fit.authorName || t('fittings.popular.workbench.unknownAuthor'),
                    age: formatAge(Math.max(0, now - fit.dateAdded), t),
                  })}
                </p>
                <OutOfDateReasons reasons={list.reasonsFor(fit.id)} />
                {failedId === fit.id && (
                  <p role="alert" className="text-xs text-danger">
                    {t('fittings.popular.workbench.loadFailed')}
                  </p>
                )}
              </div>
              <Button
                size="sm"
                disabled={busy || loadingId !== null}
                onClick={() => void load(fit)}
              >
                {t('fittings.popular.workbench.load')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {result?.ok && <OutOfDateToggle list={list} />}
    </>
  );
}
