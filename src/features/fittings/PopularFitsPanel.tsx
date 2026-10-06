import { ExternalLink } from '@/components/ui/ExternalLink';
import { useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Button, IskAmount, Spinner, Tabs } from '@/components/ui';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import type { FitSellPrice } from '@/engine/fittings/fitSellPrice';
import type { LoadedFitting } from '@/engine/fittings/load';
import { popularFitLoad } from '@/engine/fittings/popularFits';
import { formatAge } from '@/lib/age';
import { cx } from '@/lib/cx';
import { useNow } from '@/lib/useNow';
import { typeName } from '@/sde/loadSde';
import { usePopularFits } from './popularFits';
import { RackIconStrip } from './RackIconStrip';
import { useModuleNames } from './useModuleNames';
import { FIT_ROW_CLASS, VirtualFitList } from './VirtualFitList';
import {
  useWorkbenchHullRows,
  workbenchHullSources,
  type WorkbenchHullSources,
  type WorkbenchRow,
} from './workbenchHullRows';
import { OutOfDateNote } from './WorkbenchOutOfDate';
import { WorkbenchSightingBadge } from './WorkbenchSightingBadge';

/** What both tabs read from outside: the Workbench rows' sources, and module names. */
export interface PopularFitsSources extends WorkbenchHullSources {
  typeName: (typeId: number) => Promise<string>;
}

const POPULAR_FITS_SOURCES: PopularFitsSources = {
  ...workbenchHullSources,
  // Read when called, not now: a test mocking `@/sde/loadSde` may leave it out.
  typeName: (typeId) => typeName(typeId),
};

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
  /** For tests: stand-ins for Firestore, the SDE, prices, zKillboard and Load. Pass it stable. */
  sources?: PopularFitsSources;
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
  sources = POPULAR_FITS_SOURCES,
}: PopularFitsPanelProps) {
  const { t } = useTranslation();
  const result = usePopularFits(shipTypeId, sources.popularFits);
  const now = useNow();
  const fits = result?.ok ? result.fits : null;
  const typeIds = useMemo(
    () => fits?.flatMap((fit) => fit.parts.modules.map((m) => m.typeId)) ?? null,
    [fits]
  );
  const names = useModuleNames(typeIds, sources.typeName);

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
            <li key={fit.key} className={FIT_ROW_CLASS}>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  {t('fittings.popular.losses', { count: fit.count })}
                  <span className="text-text-dim">
                    {fit.lastSeen !== null &&
                      ` · ${t('fittings.popular.lastSeen', {
                        age: formatAge(Math.max(0, now - Date.parse(fit.lastSeen)), t),
                      })}`}
                    {fit.value !== null && (
                      <>
                        {' · '}
                        <Trans
                          i18nKey="fittings.popular.value"
                          components={{ isk: <IskAmount value={fit.value} /> }}
                        />
                      </>
                    )}
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
 * A Workbench row's height before it is measured: name and price, date
 * created, and one line of module icons, plus the gap below it.
 */
const WORKBENCH_ROW_ESTIMATE = 80;

const workbenchRowKey = (row: WorkbenchRow) => row.fit.id;

/**
 * The EVE Workbench tab (issue #2484): the hull's published fits, newest
 * first, as rows `useWorkbenchHullRows` checks, prices, badges and Loads.
 * Windowed (`VirtualFitList`): a popular hull lists 500+ fits.
 */
function WorkbenchFits({
  shipTypeId,
  onOpen,
  busy = false,
  capped = true,
  sources = POPULAR_FITS_SOURCES,
}: PopularFitsPanelProps) {
  const { t } = useTranslation();
  const tab = useWorkbenchHullRows(shipTypeId, sources);
  const names = useModuleNames(tab.moduleTypeIds, sources.typeName);
  const now = useNow();
  const listed = tab.status === 'ready';

  return (
    <>
      {/* One line for the whole tab, not one per row: a hull can list hundreds. */}
      <p className="text-xs text-text-dim">
        {t('fittings.popular.workbench.source')}{' '}
        <ExternalLink href="https://eveworkbench.com">eveworkbench.com</ExternalLink>
        {listed && tab.pricing ? (
          <>
            {' · '}
            <span role="status">
              {t('fittings.popular.workbench.pricing', { hub: tab.hub.systemName })}
            </span>
          </>
        ) : listed && tab.anyPriced ? (
          <>
            {' · '}
            <span>{t('fittings.popular.workbench.priceNote', { hub: tab.hub.systemName })}</span>
          </>
        ) : null}
      </p>
      {tab.status === 'loading' ? (
        <Spinner size="sm" delayMs={200} label={t('fittings.popular.workbench.loading')} />
      ) : tab.status === 'failed' ? (
        <p role="status" className="text-xs text-warning">
          {t('fittings.popular.workbench.failed')}
        </p>
      ) : tab.status === 'empty' ? (
        <p className="text-xs text-text-dim">{t('fittings.popular.workbench.empty')}</p>
      ) : (
        <VirtualFitList
          items={tab.rows}
          itemKey={workbenchRowKey}
          estimateSize={WORKBENCH_ROW_ESTIMATE}
          label={t('fittings.popular.tabWorkbench')}
          capped={capped}
          renderItem={({ fit, modules, price, sighting, loadFailed }) => (
            <>
              <div className="min-w-0 flex-1">
                <p className="flex min-w-0 items-baseline gap-1 text-sm">
                  <button
                    type="button"
                    disabled={busy || tab.loading}
                    onClick={() => void tab.load(fit, onOpen)}
                    className={entityLinkClassName('truncate text-left disabled:opacity-40')}
                  >
                    {fit.name || t('fittings.popular.workbench.unnamed')}
                  </button>
                  <WorkbenchFitPrice price={price} />
                </p>
                <p className="text-xs text-text-dim">
                  {t('fittings.popular.workbench.created', {
                    age: formatAge(Math.max(0, now - fit.dateAdded), t),
                  })}
                  {price?.partial &&
                    ` · ${t('fittings.popular.workbench.unpriced', {
                      count: price.unpricedTypes,
                      hub: tab.hub.systemName,
                    })}`}
                </p>
                <RackIconStrip modules={modules} names={names} />
                <WorkbenchSightingBadge sighting={sighting} />
                {loadFailed && (
                  <p role="alert" className="text-xs text-danger">
                    {t('fittings.popular.workbench.loadFailed')}
                  </p>
                )}
              </div>
            </>
          )}
        />
      )}
      {listed && <OutOfDateNote list={tab} />}
    </>
  );
}

/**
 * A Workbench row's price at the Default Trade Hub, after its name; nothing
 * while loading or with nothing priced. A partial total's missing items are
 * on the line below.
 */
function WorkbenchFitPrice({ price }: { price: FitSellPrice | undefined }) {
  if (price === undefined) return null;
  return (
    <>
      <span aria-hidden className="shrink-0 text-text-dim">
        ·
      </span>
      <span className="shrink-0 tabular-nums">
        <Trans
          i18nKey={
            price.partial
              ? 'fittings.popular.workbench.pricePartial'
              : 'fittings.popular.workbench.price'
          }
          components={{ isk: <IskAmount value={price.sell} /> }}
        />
      </span>
    </>
  );
}
