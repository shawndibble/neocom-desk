import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Spinner, Tabs } from '@/components/ui';
import type { FitSellPrice } from '@/engine/fittings/fitSellPrice';
import type { LoadedFitting } from '@/engine/fittings/load';
import { popularFitLoad } from '@/engine/fittings/popularFits';
import { formatAge } from '@/lib/age';
import { cx } from '@/lib/cx';
import { formatIskCompact } from '@/lib/isk';
import { useNow } from '@/lib/useNow';
import { loadFittingFromText } from './loadFittingFromText';
import { usePopularFits } from './popularFits';
import { RackIconStrip } from './RackIconStrip';
import { useModuleNames } from './useModuleNames';
import { VirtualFitList } from './VirtualFitList';
import { useWorkbenchFits, workbenchFitUrl, type WorkbenchFit } from './workbenchFits';
import { useWorkbenchFitList } from './workbenchFitCurrency';
import { useWorkbenchFitPrices } from './workbenchFitPrices';
import { OutOfDateReasons, OutOfDateToggle } from './WorkbenchOutOfDate';
import { useWorkbenchSightings } from './workbenchSightings';
import { WorkbenchSightingBadge } from './WorkbenchSightingBadge';

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
  const fits = result?.ok ? result.fits : null;
  const typeIds = useMemo(
    () => fits?.flatMap((fit) => fit.parts.modules.map((m) => m.typeId)) ?? null,
    [fits]
  );
  const names = useModuleNames(typeIds);

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
                <RackIconStrip modules={fit.parts.modules} names={names} />
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
 * A Workbench row's height before it is measured: name, date added, price and
 * one line of module icons, plus the gap below it.
 */
const WORKBENCH_ROW_ESTIMATE = 96;

const workbenchFitKey = (fit: WorkbenchFit) => fit.id;

/**
 * The EVE Workbench tab (issue #2484): the hull's published fits, newest
 * first, each Loaded from its stored EFT through the ordinary text Load.
 * Windowed (`VirtualFitList`): a popular hull lists 500+ fits.
 */
function WorkbenchFits({ shipTypeId, onOpen, busy = false, capped = true }: PopularFitsPanelProps) {
  const { t } = useTranslation();
  const result = useWorkbenchFits(shipTypeId);
  // Out-of-date fits (issue #2485) sort below, shown only on request.
  const list = useWorkbenchFitList(result?.ok ? result.fits : null);
  // Each fit's modules come from that same check (issue #2493): no second parse.
  const names = useModuleNames(list.moduleTypeIds);
  const sightings = useWorkbenchSightings(shipTypeId, result?.ok ? result.fits : null);
  // Priced from that same check too, at the Default Trade Hub.
  const prices = useWorkbenchFitPrices(list.checks);
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
      {result?.ok && prices.loading && (
        // One line for the whole tab, not one per row: a hull can list hundreds.
        <p role="status" className="text-xs text-text-dim">
          {t('fittings.popular.workbench.pricing', { hub: prices.hub.systemName })}
        </p>
      )}
      {result?.ok && prices.anyPriced && (
        <p className="text-xs text-text-dim">
          {t('fittings.popular.workbench.priceNote', { hub: prices.hub.systemName })}
        </p>
      )}
      {result === null ? (
        <Spinner size="sm" delayMs={200} label={t('fittings.popular.workbench.loading')} />
      ) : !result.ok ? (
        <p role="status" className="text-xs text-warning">
          {t('fittings.popular.workbench.failed')}
        </p>
      ) : result.fits.length === 0 ? (
        <p className="text-xs text-text-dim">{t('fittings.popular.workbench.empty')}</p>
      ) : (
        <VirtualFitList
          items={list.listed}
          itemKey={workbenchFitKey}
          estimateSize={WORKBENCH_ROW_ESTIMATE}
          capped={capped}
          renderItem={(fit) => (
            <>
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
                  {t('fittings.popular.workbench.added', {
                    age: formatAge(Math.max(0, now - fit.dateAdded), t),
                  })}
                </p>
                <WorkbenchFitPrice
                  price={prices.priceFor(fit.id)}
                  hubName={prices.hub.systemName}
                />
                <RackIconStrip modules={list.modulesFor(fit.id) ?? []} names={names} />
                <OutOfDateReasons reasons={list.reasonsFor(fit.id)} />
                <WorkbenchSightingBadge sighting={sightings.get(fit.id)} />
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
            </>
          )}
        />
      )}
      {result?.ok && <OutOfDateToggle list={list} />}
    </>
  );
}

/** A Workbench row's price at the Default Trade Hub; nothing while loading or with nothing priced. */
function WorkbenchFitPrice({
  price,
  hubName,
}: {
  price: FitSellPrice | undefined;
  hubName: string;
}) {
  const { t } = useTranslation();
  if (price === undefined) return null;
  const value = formatIskCompact(price.sell);
  return (
    <p className="text-xs tabular-nums">
      {price.partial
        ? t('fittings.popular.workbench.pricePartial', {
            value,
            count: price.unpricedTypes,
            hub: hubName,
          })
        : t('fittings.popular.workbench.price', { value })}
    </p>
  );
}
