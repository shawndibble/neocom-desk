import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { IskAmount } from '@/components/ui';
import type { HoleSizeRead } from '@/engine/pilotList/dscanHoleSize';
import { buildWorth, diffHulls, type HullCount } from '@/engine/pilotList/dscanWorth';
import { useMarketHub } from '@/features/market/hub';
import { cx } from '@/lib/cx';
import { formatNumber } from '@/lib/numberLocale';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { getHubPrices } from '@/market/prices';
import { hullsKey } from './lastScan';
import { holeSizeCounts } from './useHoleSizes';

const SHOWN_LINES = 4;

const cardClassName = 'space-y-1 rounded-xs border border-line p-3';
const captionClassName = eyebrowClassName;

export function DscanMeta({
  hulls,
  names,
  trackHistory,
  previous,
  holes,
}: {
  hulls: readonly HullCount[];
  names: ReadonlyMap<number, string>;
  trackHistory: boolean;
  previous: HullCount[] | null | undefined;
  holes: HoleSizeRead | null;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <WorthCard hulls={hulls} names={names} holes={holes} />
      {trackHistory && <SinceLastScanCard hulls={hulls} previous={previous} names={names} />}
    </div>
  );
}

function WorthCard({
  hulls,
  names,
  holes,
}: {
  hulls: readonly HullCount[];
  names: ReadonlyMap<number, string>;
  holes: HoleSizeRead | null;
}) {
  const { t } = useTranslation();
  const hubId = useMarketHub((s) => s.value);
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
  const [fetched, setFetched] = useState<{
    key: string;
    prices: ReadonlyMap<number, number | null>;
  }>();
  const key = `${hub.stationId}|${hullsKey(hulls)}`;

  useEffect(() => {
    let cancelled = false;
    void getHubPrices(
      hub,
      hulls.map((h) => h.typeId)
    )
      .then((found) => new Map([...found].map(([typeId, agg]) => [typeId, agg.sellMin])))
      .catch(() => new Map<number, number | null>())
      .then((found) => {
        if (!cancelled) setFetched({ key, prices: found });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub.stationId, hullsKey(hulls)]);

  const worth = fetched?.key === key ? buildWorth(hulls, fetched.prices) : null;
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
                    <Trans
                      i18nKey="travel.pilot.dscan.worth.isk"
                      components={{ isk: <IskAmount value={line.total} decimals={0} /> }}
                    />
                  )}
                </td>
              </tr>
            ))}
            <tr className="border-t border-line font-semibold">
              <td className="py-0.5">{t('travel.pilot.dscan.worth.total')}</td>
              <td className="py-0.5 text-right tabular-nums">
                <Trans
                  i18nKey="travel.pilot.dscan.worth.isk"
                  components={{ isk: <IskAmount value={worth.total} decimals={0} /> }}
                />
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
      {holes !== null && <HoleSizes read={holes} />}
    </section>
  );
}

function HoleSizes({ read }: { read: HoleSizeRead }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-0.5 border-t border-line pt-2 text-sm">
      <h4 className={captionClassName}>{t('travel.pilot.dscan.worth.holes.title')}</h4>
      <p className="tabular-nums">{holeSizeCounts(t, read)}</p>
      {read.massKg > 0 && (
        <p className="text-text-dim">
          {t('travel.pilot.dscan.worth.holes.mass', {
            mass: formatNumber(Math.floor(read.massKg / 1000)),
          })}
          {read.shipsWithoutMass > 0 &&
            ` ${t('travel.pilot.dscan.worth.holes.massLeftOut', { count: read.shipsWithoutMass })}`}
        </p>
      )}
    </div>
  );
}

function SinceLastScanCard({
  hulls,
  previous,
  names,
}: {
  hulls: readonly HullCount[];
  previous: HullCount[] | null | undefined;
  names: ReadonlyMap<number, string>;
}) {
  const { t } = useTranslation();
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
