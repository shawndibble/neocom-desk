/**
 * Travel › Thera / Turnur (issues #2330, #2473): the current wormhole
 * connections out of the two public hubs, from EVE-Scout, in four columns by
 * the space each hole comes out in — Highsec, Lowsec, Nullsec, J-space — with
 * each exit's jump distance from a chosen origin.
 *
 * Conditions, never verdicts (decision `20260912-172628`): a card gives the
 * exit's security, the hole's size and remaining life; the pilot decides.
 *
 * Origin, Route Preference, Hub and Fits live in the URL. The origin falls
 * back to the Current System when the link does not name one. The columns
 * replaced the old exit-space filter, so a link still carrying `space=` just
 * has it ignored.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SecurityStatus } from '@/components/SecurityStatus';
import {
  Button,
  DataAgeBadge,
  EmptyState,
  FilterField,
  PageHeader,
  Panel,
  SegmentedControl,
  Spinner,
  Tabs,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import {
  filterTheraConnections,
  groupTheraConnectionsByBand,
  THERA_HUBS,
  WORMHOLE_SHIP_SIZES,
  type TheraBands,
  type TheraConnectionFilter,
  type TheraConnectionRow,
} from '@/engine/route/theraConnections';
import { isSpaceKind, SPACE_KINDS, type SpaceKind } from '@/engine/space';
import { useCurrentSystem } from '@/features/route/currentSystem';
import { ROUTE_PREFERENCES } from '@/features/route/routePreferences';
import { useRouteQuery } from '@/features/route/routeRules';
import { SolarSystemPicker } from '@/features/route/SolarSystemPicker';
import { useSystemName } from '@/features/route/useSolarSystems';
import { writeToClipboard } from '@/lib/clipboard';
import { cx } from '@/lib/cx';
import { formatCountdown } from '@/lib/duration';
import { useIsPhone } from '@/lib/useIsPhone';
import { enumParam, optionalEnumParam, optionalIdParam } from '@/lib/urlState';
import { useUrlParams } from '@/lib/useUrlState';
import { PreferenceField } from './PreferenceField';
import { useTheraConnections, type TheraConnectionsState } from './useTheraConnections';

const HUB_OPTIONS = ['all', ...THERA_HUBS] as const;
const SIZE_OPTIONS = ['any', ...WORMHOLE_SHIP_SIZES] as const;

const THERA_PARAMS = {
  origin: optionalIdParam(),
  // Absent means the pilot's Travel default (Settings → Travel).
  pref: optionalEnumParam(ROUTE_PREFERENCES),
  hub: enumParam(HUB_OPTIONS, 'all'),
  size: enumParam(SIZE_OPTIONS, 'any'),
};

const DASH = '—';
const COPIED_MS = 1500;

export function TheraTab({ tabBar }: { tabBar: ReactNode }) {
  const { t } = useTranslation();
  const [params, setParams] = useUrlParams(THERA_PARAMS);
  const current = useCurrentSystem();
  const originId = params.origin ?? current.systemId;
  const originIsCurrent = params.origin === null && current.systemId !== null;
  const originName = useSystemName(originId);
  const routeQuery = useRouteQuery(params.pref);
  const state = useTheraConnections(originId, routeQuery);

  const originTrigger =
    originId === null
      ? t('travel.pickSystem')
      : originIsCurrent
        ? t('travel.currentSystem', { system: originName ?? '…' })
        : (originName ?? '…');

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('travel.title')}
        meta={
          state.kind === 'ready' ? (
            <DataAgeBadge date={state.fetchedAt} note={t('travel.thera.dataAgeNote')} />
          ) : undefined
        }
      />
      {tabBar}
      <Panel>
        <div className="flex flex-wrap items-end gap-3">
          <FilterField label={t('travel.thera.originLabel')} stretch={false}>
            <SolarSystemPicker
              value={originId}
              onChange={(systemId) => setParams({ origin: systemId }, { push: true })}
              ariaLabel={t('travel.thera.changeOrigin', { current: originTrigger })}
              triggerLabel={originTrigger}
            />
          </FilterField>
          <PreferenceField
            value={routeQuery.rules.preference}
            onChange={(pref) => setParams({ pref })}
          />
          <FilterField label={t('travel.thera.hubLabel')} stretch={false}>
            <SegmentedControl
              label={t('travel.thera.hubLabel')}
              value={params.hub}
              options={HUB_OPTIONS.map((hub) => ({
                value: hub,
                label: t(`travel.thera.hub.${hub}`),
              }))}
              onChange={(hub) => setParams({ hub })}
            />
          </FilterField>
          <FilterField label={t('travel.thera.fitsLabel')} stretch={false}>
            <SegmentedControl
              label={t('travel.thera.fitsLabel')}
              value={params.size}
              options={SIZE_OPTIONS.map((size) => ({
                value: size,
                label: t(`travel.thera.fits.${size}`),
              }))}
              onChange={(size) => setParams({ size })}
            />
          </FilterField>
        </div>
      </Panel>
      <TheraBody
        state={state}
        filter={{ hub: params.hub, shipSize: params.size }}
        hasOrigin={originId !== null}
        originName={originName}
      />
    </div>
  );
}

function TheraBody({
  state,
  filter,
  hasOrigin,
  originName,
}: {
  state: TheraConnectionsState;
  filter: TheraConnectionFilter;
  hasOrigin: boolean;
  originName: string | null;
}) {
  const { t } = useTranslation();
  if (state.kind === 'loading') {
    return (
      <div className="flex justify-center py-10">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (state.kind === 'unavailable') {
    return (
      <EmptyState
        title={t('travel.thera.unavailableTitle')}
        hint={t('travel.thera.unavailableHint')}
      />
    );
  }
  const bands = groupTheraConnectionsByBand(filterTheraConnections(state.rows, filter));
  const shown = SPACE_KINDS.reduce((sum, band) => sum + bands[band].length, 0);
  // A connection with no column (its exit space unknown) is not something the
  // filters hid, so it doesn't turn "none listed" into "none match".
  const listed = state.rows.some((row) => row.exitSpace !== null);
  // One live region, always mounted, so a change of message is announced.
  const jumpsNote = !hasOrigin
    ? t('travel.thera.noOrigin')
    : state.distancesLoading
      ? t('travel.thera.jumpsLoading')
      : state.originUngated
        ? t('travel.thera.originUngated', { system: originName ?? '…' })
        : state.rows.some((row) => row.jumps.kind === 'unknown')
          ? t('travel.thera.jumpsUnknown')
          : '';
  return (
    <Panel>
      <div className="space-y-3">
        <p role="status" className={cx('text-text-dim', jumpsNote === '' && 'sr-only')}>
          {jumpsNote}
        </p>
        {shown === 0 ? (
          <EmptyState
            title={listed ? t('travel.thera.noMatchTitle') : t('travel.thera.emptyTitle')}
            hint={listed ? t('travel.thera.noMatchHint') : t('travel.thera.emptyHint')}
          />
        ) : (
          <BandColumns bands={bands} />
        )}
      </div>
    </Panel>
  );
}

/**
 * Four columns at a wide panel, two by two at a medium one — measured on the
 * panel itself, not the viewport, so a tablet with the rail open gets the
 * layout its panel can hold. A phone shows one band at a time under a row of
 * band tabs with counts.
 */
function BandColumns({ bands }: { bands: TheraBands }) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  // Opens on the first band with holes in it, until the pilot picks one.
  const [pickedBand, setPhoneBand] = useState<SpaceKind | null>(null);
  const phoneBand = pickedBand ?? SPACE_KINDS.find((band) => bands[band].length > 0) ?? 'highsec';

  if (isPhone) {
    return (
      <div className="space-y-3">
        <Tabs
          label={t('travel.thera.bandTabsLabel')}
          value={phoneBand}
          onChange={(id) => {
            if (isSpaceKind(id)) setPhoneBand(id);
          }}
          tabs={SPACE_KINDS.map((band) => ({
            id: band,
            label: t(`travel.thera.bandTab.${band}`, { count: bands[band].length }),
          }))}
        />
        <BandColumn band={phoneBand} rows={bands[phoneBand]} />
      </div>
    );
  }
  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2 @5xl:grid-cols-4">
        {SPACE_KINDS.map((band) => (
          <BandColumn key={band} band={band} rows={bands[band]} />
        ))}
      </div>
    </div>
  );
}

function BandColumn({ band, rows }: { band: SpaceKind; rows: readonly TheraConnectionRow[] }) {
  const { t } = useTranslation();
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="min-w-0 space-y-2">
      <h3
        id={headingId}
        className="flex items-baseline justify-between gap-2 border-b border-line pb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase"
      >
        <span>{t(`travel.thera.band.${band}`)}</span>
        <span className="text-text tabular-nums">{rows.length}</span>
      </h3>
      {rows.length === 0 ? (
        <p className="py-2 text-sm text-text-dim">{t(`travel.thera.emptyBand.${band}`)}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <ConnectionCard key={row.id} row={row} />
          ))}
        </ul>
      )}
    </section>
  );
}

const hubBadgeClassName =
  'rounded-xs border border-line px-1 text-[0.6875rem] tracking-widest text-text-dim uppercase';

function ConnectionCard({ row }: { row: TheraConnectionRow }) {
  const { t } = useTranslation();
  return (
    <li
      // The wormhole type code is reference, not something to scan: it rides
      // on the card's tooltip rather than taking a line.
      title={
        row.wormholeType === null
          ? undefined
          : t('travel.thera.wormholeType', { type: row.wormholeType })
      }
      className="min-w-0 space-y-1.5 rounded-xs border border-line bg-panel-2 p-3"
    >
      <div className="flex min-w-0 items-baseline gap-2">
        <h4 className="truncate font-semibold">{row.exitSystemName ?? DASH}</h4>
        {row.exitSpace === 'wormhole' ? (
          <span className="text-sm font-semibold text-text-dim">
            {row.exitClass?.toUpperCase() ?? DASH}
          </span>
        ) : row.exitSecurity === null ? (
          <span className="text-sm text-text-dim">{DASH}</span>
        ) : (
          <SecurityStatus security={row.exitSecurity} className="text-sm" />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-dim">
        <span>{row.exitRegionName ?? DASH}</span>
        <span className={hubBadgeClassName}>{t(`travel.thera.hub.${row.hub}`)}</span>
        <span>
          {row.maxShipSize === null
            ? DASH
            : t('travel.thera.maxSize', { size: t(`travel.thera.size.${row.maxShipSize}`) })}
        </span>
        <span className={cx('tabular-nums', row.lifeWarning && 'font-semibold text-warning')}>
          {t('travel.thera.lifeLeft', { time: formatCountdown(row.remainingMs / 1000) })}
        </span>
        <JumpsText row={row} />
      </div>
      {/* The Route via link (issue #2477) joins this line, after Copy. */}
      <SignatureLine row={row} />
    </li>
  );
}

function JumpsText({ row }: { row: TheraConnectionRow }) {
  const { t } = useTranslation();
  switch (row.jumps.kind) {
    case 'known':
      return (
        <span className="tabular-nums">{t('travel.thera.jumps', { count: row.jumps.jumps })}</span>
      );
    case 'no-route':
      return <span>{t('travel.thera.noGateRoute')}</span>;
    case 'unknown':
    case 'no-origin':
      return <span>{t('travel.thera.jumpsBlank')}</span>;
  }
}

/** The hub-side signature and its Copy button; a refused clipboard selects the text instead. */
function SignatureLine({ row }: { row: TheraConnectionRow }) {
  const { t } = useTranslation();
  const signatureRef = useRef<HTMLSpanElement>(null);
  const [copied, setCopied] = useState(false);
  const signature = row.hubSignature;
  const names = {
    hub: t(`travel.thera.hub.${row.hub}`),
    system: row.exitSystemName ?? DASH,
  };

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    if (signature === null) return;
    try {
      await writeToClipboard(signature);
      setCopied(true);
    } catch {
      // No clipboard (permission, insecure context): select the signature so
      // the pilot can copy it by hand.
      const node = signatureRef.current;
      if (node) window.getSelection()?.selectAllChildren(node);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-text-dim">
        {t('travel.thera.hubSignature', { hub: names.hub })}
      </span>
      <span ref={signatureRef} className="font-mono text-sm tabular-nums select-all">
        {signature ?? DASH}
      </span>
      <Button
        size="sm"
        disabled={signature === null}
        onClick={() => void copy()}
        aria-label={
          copied ? t('travel.thera.copiedSignature', names) : t('travel.thera.copySignature', names)
        }
      >
        {copied ? (
          <Icon.Done size={Icon.ICON_SIZE.sm} />
        ) : (
          <Icon.CopyToClipboard size={Icon.ICON_SIZE.sm} />
        )}
        {copied ? t('travel.thera.copied') : t('travel.thera.copy')}
      </Button>
    </div>
  );
}
