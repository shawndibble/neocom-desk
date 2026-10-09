import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '@/db';
import { buildWorth, diffHulls, sameHulls, type HullCount } from '@/engine/pilotList/dscanWorth';
import { useMarketHub } from '@/features/market/hub';
import { cx } from '@/lib/cx';
import { formatIskCompact } from '@/lib/isk';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { getHubPrices } from '@/market/prices';

/** Device-local (no `sync.` prefix), so the previous scan never reaches Firestore. */
const LAST_SCAN_KEY = 'dscan.lastScan';

const SHOWN_LINES = 4;

const cardClassName = 'space-y-1 rounded-xs border border-line p-3';
const captionClassName = 'text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase';

/**
 * Two read-only cards under the Read-out (issue #3151): what the hulls on the
 * scan are worth at the market hub, and how the scan differs from the last one
 * pasted on this device. `trackHistory` is set only by the live Pilot Lookup:
 * a Shared D-Scan neither reads nor overwrites this device's last scan.
 */
export function DscanMeta({
  hulls,
  names,
  trackHistory,
}: {
  hulls: readonly HullCount[];
  names: ReadonlyMap<number, string>;
  trackHistory: boolean;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <WorthCard hulls={hulls} names={names} />
      {trackHistory && <SinceLastScanCard hulls={hulls} names={names} />}
    </div>
  );
}

const hullsKey = (hulls: readonly HullCount[]) =>
  hulls.map((h) => `${h.typeId}x${h.count}`).join(',');

function WorthCard({
  hulls,
  names,
}: {
  hulls: readonly HullCount[];
  names: ReadonlyMap<number, string>;
}) {
  const { t } = useTranslation();
  const hubId = useMarketHub((s) => s.value);
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
  const [prices, setPrices] = useState<ReadonlyMap<number, number | null>>();

  useEffect(() => {
    let cancelled = false;
    void getHubPrices(
      hub,
      hulls.map((h) => h.typeId)
    ).then((found) => {
      if (cancelled) return;
      setPrices(new Map([...found].map(([typeId, agg]) => [typeId, agg.sellMin])));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub.stationId, hullsKey(hulls)]);

  const worth = prices === undefined ? null : buildWorth(hulls, prices);
  return (
    <section aria-label={t('travel.pilot.dscan.worth.title')} className={cardClassName}>
      <h3 className={captionClassName}>{t('travel.pilot.dscan.worth.title')}</h3>
      {worth === null ? (
        <p className="text-sm text-text-dim">{t('common.loading')}</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {worth.lines.slice(0, SHOWN_LINES).map((line) => (
              <tr key={line.typeId}>
                <td className="py-0.5">
                  {line.count} × {names.get(line.typeId) ?? `#${line.typeId}`}
                </td>
                <td className="py-0.5 text-right tabular-nums">
                  {line.total === null ? (
                    <span className="text-text-dim">{t('travel.pilot.dscan.worth.noPrice')}</span>
                  ) : (
                    t('travel.pilot.dscan.worth.isk', { amount: formatIskCompact(line.total) })
                  )}
                </td>
              </tr>
            ))}
            <tr className="border-t border-line font-semibold">
              <td className="py-0.5">{t('travel.pilot.dscan.worth.total')}</td>
              <td className="py-0.5 text-right tabular-nums">
                {t('travel.pilot.dscan.worth.isk', { amount: formatIskCompact(worth.total) })}
              </td>
            </tr>
          </tbody>
        </table>
      )}
      <p className="text-xs text-text-dim">
        {worth !== null && worth.unpriced > 0
          ? t('travel.pilot.dscan.worth.unpriced', { count: worth.unpriced })
          : null}{' '}
        {t('travel.pilot.dscan.worth.note', { hub: hub.systemName })}
      </p>
    </section>
  );
}

function SinceLastScanCard({
  hulls,
  names,
}: {
  hulls: readonly HullCount[];
  names: ReadonlyMap<number, string>;
}) {
  const { t } = useTranslation();
  // undefined = still reading Dexie; null = no earlier scan stored.
  const [previous, setPrevious] = useState<HullCount[] | null>();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await db.settings.get(LAST_SCAN_KEY);
      const last = Array.isArray(stored?.value) ? (stored.value as HullCount[]) : null;
      if (cancelled) return;
      setPrevious(last);
      // The same scan seen again must not wipe the scan it is compared with.
      if (last === null || !sameHulls(last, hulls)) {
        await db.settings.put({ key: LAST_SCAN_KEY, value: hulls.map((h) => ({ ...h })) });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hullsKey(hulls)]);

  const diff = previous ? diffHulls(hulls, previous) : null;
  return (
    <section aria-label={t('travel.pilot.dscan.since.title')} className={cardClassName}>
      <h3 className={captionClassName}>{t('travel.pilot.dscan.since.title')}</h3>
      {previous === undefined ? (
        <p className="text-sm text-text-dim">{t('common.loading')}</p>
      ) : diff === null ? (
        <p className="text-sm text-text-dim">{t('travel.pilot.dscan.since.none')}</p>
      ) : diff.length === 0 ? (
        <p className="text-sm text-text-dim">{t('travel.pilot.dscan.since.unchanged')}</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {diff.map(({ typeId, delta }) => (
              <tr key={typeId}>
                <td className="py-0.5">{names.get(typeId) ?? `#${typeId}`}</td>
                <td
                  className={cx(
                    'py-0.5 text-right tabular-nums',
                    delta > 0 ? 'text-danger' : 'text-success'
                  )}
                >
                  {delta > 0 ? `+${delta}` : delta}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-xs text-text-dim">{t('travel.pilot.dscan.since.note')}</p>
    </section>
  );
}
