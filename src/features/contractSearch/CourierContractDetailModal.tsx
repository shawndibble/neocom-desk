import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { Link } from 'react-router-dom';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { InfoTooltip, IskAmount, SlideOver, Tooltip, ValueList, ValueRow } from '@/components/ui';
import { CopyContractIdButton } from '@/features/contracts/CopyContractIdButton';
import { OpenInEveButton } from '@/features/openInEve/OpenInEveButton';
import { Caret } from '@/components/ui/Disclosure';
import { PlaceLink, SystemLink } from '@/features/entities';
import { SecurityStatus } from '@/components/SecurityStatus';
import { formatIsk, formatIskAuto } from '@/lib/isk';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import {
  courierCollateral,
  type CourierEndpoint,
  type CourierRouteRow,
} from '@/engine/contracts/courierSearch';
import { collateralToRewardRatio, iskPerJump, iskPerVolume } from '@/engine/contracts/courierRates';
import {
  asksFarMoreCollateralThanReward,
  courierRisks,
  forcesFreighter,
  hoursToExpiry,
  FREIGHTER_VOLUME_M3,
  type CourierRiskKind,
} from '@/engine/contracts/courierRisk';
import {
  communityFloorReward,
  floorShare,
  paysFarAboveGoingRate,
} from '@/engine/contracts/courierGoingRate';
import { LawlessTag } from '@/features/travel/LawlessTag';
import { useLawlessSystems } from '@/features/travel/useLawlessSystems';
import { routeExposure, type RouteExposure } from '@/features/route/routeExposure';
import { useJumpBasis } from '@/features/route/jumpBasis';
import { formatMagnitude } from '@/lib/magnitude';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { courierPlanRouteHref } from '@/features/contractSearch/courierPlanRoute';
import { HintText } from '@/components/ui/HintText';
import { loadStructureInfo } from '@/features/character/structures';
import { placeStructureEndpoint } from '@/features/contractSearch/courierEndpoints';
import { endpointName, endpointSystemName } from '@/features/contractSearch/courierEndpointNames';
import { useCourierCollateralRatio } from '@/features/contractSearch/collateralThreshold';
import { RISK_COPY, WARNING_RISKS } from '@/features/contractSearch/courierRiskLabels';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { Well } from '@/components/ui/Well';

export type CourierJumps = { kind: 'pending' } | { kind: 'known'; count: number | null };

export type ReverseLane =
  { kind: 'unresolved' } | { kind: 'counted'; count: number; unplaceable: number };

export interface CourierContractDetailModalProps {
  row: CourierRouteRow;
  regionNames: ReadonlyMap<number, string>;
  jumps: CourierJumps;
  goingRateMultiple: number | null;
  preference: RoutePreferenceKind;
  reverseLane: ReverseLane;
  returnFocusFallback?: () => HTMLElement | null;
  characterId: number | null;
  onStructurePlaced?: (endpoint: CourierEndpoint) => void;
  onSearchReverseLane: () => void;
  onClose: () => void;
}

function useRouteExposure(
  row: CourierRouteRow,
  preference: RoutePreferenceKind
): RouteExposure | null {
  const [measured, setMeasured] = useState<{ key: string; exposure: RouteExposure } | null>(null);
  const originSystemId = row.origin.systemId;
  const destinationSystemId = row.destination.systemId;
  const { rules, network, key: routeKey, hydrated } = useJumpBasis(preference);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void routeExposure(originSystemId, destinationSystemId, rules, network)
      .catch((): RouteExposure => ({ kind: 'unknown' }))
      .then((result) => {
        if (!cancelled) setMeasured({ key: routeKey, exposure: result });
      });
    return () => {
      cancelled = true;
    };
  }, [originSystemId, destinationSystemId, rules, network, routeKey, hydrated]);

  return measured?.key === routeKey ? measured.exposure : null;
}

type StructureLookup = 'pending' | 'unreadable' | { name: string };

function useStructureLookup(
  endpoint: CourierEndpoint,
  characterId: number | null,
  onPlaced: ((endpoint: CourierEndpoint) => void) | undefined
): StructureLookup | null {
  const wanted =
    endpoint.resolution === 'structure' && endpoint.name === null && characterId !== null;
  const [answer, setAnswer] = useState<{ id: number; result: string | null } | null>(null);
  const latest = useRef({ endpoint, onPlaced });
  useEffect(() => {
    latest.current = { endpoint, onPlaced };
  });
  useEffect(() => {
    if (!wanted || characterId === null) return;
    let cancelled = false;
    void loadStructureInfo(characterId, endpoint.locationId)
      .catch(() => null)
      .then(async (structure) => {
        if (cancelled) return;
        setAnswer({ id: endpoint.locationId, result: structure?.name ?? null });
        if (typeof structure?.solar_system_id !== 'number') return;
        const placed = await placeStructureEndpoint(latest.current.endpoint, {
          name: structure.name,
          systemId: structure.solar_system_id,
        }).catch(() => null);
        if (placed) latest.current.onPlaced?.(placed);
      });
    return () => {
      cancelled = true;
    };
  }, [wanted, characterId, endpoint.locationId]);
  if (!wanted) return null;
  if (answer?.id !== endpoint.locationId) return 'pending';
  return answer.result === null ? 'unreadable' : { name: answer.result };
}

function EndpointPlaceName({
  endpoint,
  characterId,
  onPlaced,
}: {
  endpoint: CourierEndpoint;
  characterId: number | null;
  onPlaced: ((endpoint: CourierEndpoint) => void) | undefined;
}) {
  const { t } = useTranslation();
  const lookup = useStructureLookup(endpoint, characterId, onPlaced);
  const name = endpoint.name ?? (typeof lookup === 'object' && lookup ? lookup.name : null);
  if (name !== null) return <PlaceLink id={endpoint.locationId}>{name}</PlaceLink>;
  if (lookup === 'unreadable') {
    return (
      <HintText content={`#${endpoint.locationId}`}>
        {t('contractSearch.unreadableStation')}
      </HintText>
    );
  }
  return <>{endpointName(endpoint)}</>;
}

function EndpointPlace({
  endpoint,
  regionNames,
  structureLabel,
}: {
  endpoint: CourierEndpoint;
  regionNames: ReadonlyMap<number, string>;
  structureLabel: string;
}) {
  const parts: ReactNode[] = [];
  if (endpoint.resolution === 'structure') parts.push(structureLabel);
  if (endpoint.systemName !== null || endpoint.security !== null) {
    parts.push(
      <>
        {endpoint.systemName !== null &&
          (endpoint.systemId == null ? (
            endpoint.systemName
          ) : (
            <SystemLink systemId={endpoint.systemId}>{endpoint.systemName}</SystemLink>
          ))}
        {endpoint.systemName !== null && endpoint.security !== null && ' '}
        {endpoint.security !== null && <SecurityStatus security={endpoint.security} />}
      </>
    );
  }
  if (endpoint.regionId !== null) {
    parts.push(regionNames.get(endpoint.regionId) ?? `#${endpoint.regionId}`);
  }
  return (
    <span className="text-[0.6875rem] text-text-dim">
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 && ' · '}
          {part}
        </Fragment>
      ))}
    </span>
  );
}

function BenchmarkRow({
  label,
  tip,
  tone = 'default',
  children,
}: {
  label: string;
  tip?: string;
  tone?: 'default' | 'warning';
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <ValueRow
      label={
        <span className="inline-flex items-center gap-1 text-text-dim">
          {label}
          {tip !== undefined && (
            <InfoTooltip
              label={t('contractSearch.benchmark.about', { label })}
              content={tip}
              glyph="info"
            />
          )}
        </span>
      }
      value={children}
      tone={tone}
    />
  );
}

function Figure({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-px">
      <span className={eyebrowClassName}>{label}</span>
      <span className="tabular-nums">{value}</span>
      {note !== undefined && <span className="text-[0.6875rem] text-text-dim">{note}</span>}
    </div>
  );
}

export function CourierContractDetailModal({
  row,
  regionNames,
  jumps,
  goingRateMultiple,
  preference,
  reverseLane,
  onSearchReverseLane,
  onClose,
  returnFocusFallback,
  characterId,
  onStructurePlaced,
}: CourierContractDetailModalProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const collateral = courierCollateral(row);
  const volumeRate = iskPerVolume(row.reward, row.volume);
  const collateralRatio = collateralToRewardRatio(collateral, row.reward);
  const collateralThreshold = useCourierCollateralRatio((state) => state.value);
  useHydratedStore(useCourierCollateralRatio);
  const jumpCount = jumps.kind === 'known' ? jumps.count : null;
  const jumpRate = jumps.kind === 'known' ? iskPerJump(row.reward, jumpCount) : null;
  const endpointRisks = courierRisks(row);
  const risks: CourierRiskKind[] = [
    ...endpointRisks,
    ...(paysFarAboveGoingRate(goingRateMultiple) ? (['over-rate'] as const) : []),
    ...(asksFarMoreCollateralThanReward(collateralRatio, collateralThreshold)
      ? (['high-collateral'] as const)
      : []),
  ];
  const exposure = useRouteExposure(row, preference);
  const planRouteHref = courierPlanRouteHref(row.origin, row.destination, preference);
  const lawless = useLawlessSystems();
  const path = exposure?.kind === 'known' && exposure.path.length > 1 ? exposure.path : null;
  const [showPath, setShowPath] = useState(false);
  const returnRegionId = row.destination.regionId;
  const measuring = jumps.kind === 'pending';
  const floor = measuring ? null : communityFloorReward(collateral, jumpCount);
  const shareOfFloor = floorShare(row.reward, floor);
  const belowFloor = shareOfFloor !== null && shareOfFloor < 1;
  const [openedAt] = useState(() => Date.now());
  const expiresIn = hoursToExpiry(row.dateExpired, openedAt);
  const warns = risks.some((kind) => WARNING_RISKS.includes(kind));

  const regionName = (regionId: number) => regionNames.get(regionId) ?? `#${regionId}`;

  const place = (endpoint: CourierEndpoint) => (
    <EndpointPlace
      endpoint={endpoint}
      regionNames={regionNames}
      structureLabel={t('contractSearch.playerStructureShort')}
    />
  );

  const jumpSpan = () => {
    if (jumps.kind === 'pending') return t('common.loading');
    if (jumpCount === null || jumpRate === null) return t('contractSearch.jumpsUnavailableHint');
    if (jumpCount === 0) {
      return t('contractSearch.sameSystemSpan', { isk: formatIsk(jumpRate) });
    }
    return t('contractSearch.jumpRateSpan', { isk: formatIsk(jumpRate), count: jumpCount });
  };

  return (
    <SlideOver
      open
      onClose={onClose}
      contentKey={row.contractId}
      returnFocusFallback={returnFocusFallback}
      title={t('contractSearch.courierModalTitle', {
        origin: endpointSystemName(row.origin),
        destination: endpointSystemName(row.destination),
      })}
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 items-end gap-3">
          <div className="flex flex-col gap-0.5">
            <span className={eyebrowClassName}>{t('contractSearch.rewardColumn')}</span>
            <span className="text-xl leading-tight font-semibold tabular-nums">
              <IskAmount value={row.reward} />
            </span>
            <span className="text-[0.6875rem] text-text-dim tabular-nums">
              {t('contractSearch.rewardOnDelivery', { isk: formatIsk(row.reward) })}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 text-right">
            <span className={eyebrowClassName}>{t('contractSearch.perJumpLabel')}</span>
            <span
              className={`text-3xl leading-tight font-semibold tabular-nums ${
                jumpRate ? 'text-accent' : 'text-text-dim'
              }`}
            >
              {jumpRate === null ? '—' : <IskAmount value={jumpRate} />}
            </span>
            <span className="text-[0.6875rem] text-text-dim">{jumpSpan()}</span>
          </div>
        </div>

        <Well size="lg" as="section" className="flex flex-col gap-2">
          <div className="flex flex-col gap-0.5">
            <span className={eyebrowClassName}>{t('contractSearch.pickUpLabel')}</span>
            <span className="text-sm">
              <EndpointPlaceName
                endpoint={row.origin}
                characterId={characterId}
                onPlaced={onStructurePlaced}
              />
            </span>
            {place(row.origin)}
          </div>

          <div className="flex items-center gap-2 text-[0.6875rem] text-text-dim">
            <span aria-hidden className="h-4 w-px bg-line" />
            {path !== null && jumpCount !== null ? (
              <button
                type="button"
                aria-expanded={showPath}
                onClick={() => setShowPath((shown) => !shown)}
                className={`-my-1.5 flex min-h-9 items-center gap-1 tabular-nums md:my-0 md:min-h-0 ${inlineLinkClassName}`}
              >
                <Caret expanded={showPath} />
                {t('contractSearch.jumpsShort', { count: jumpCount })}
              </button>
            ) : (
              <span className="tabular-nums">
                {jumps.kind === 'pending'
                  ? t('common.loading')
                  : jumpCount === null
                    ? t('contractSearch.jumpsUnknownLabel')
                    : t('contractSearch.jumpsShort', { count: jumpCount })}
              </span>
            )}
          </div>

          {path !== null && showPath && (
            <ol
              aria-label={t('contractSearch.routePathLabel')}
              className="flex flex-col gap-0.5 border-l border-line pl-3 text-xs"
            >
              {path.map((system) => (
                <li key={system.systemId} className="flex items-baseline gap-1.5">
                  <span>{system.name ?? `#${system.systemId}`}</span>
                  {system.security !== null && <SecurityStatus security={system.security} />}
                  {system.chokepoint && (
                    <Tooltip content={t('travel.chokepointHint')} openOnTap>
                      <span tabIndex={0} className="text-[0.6875rem] text-warning">
                        {t('travel.chokepoint')}
                      </span>
                    </Tooltip>
                  )}
                  {lawless.has(system.systemId) && <LawlessTag />}
                </li>
              ))}
            </ol>
          )}

          <div className="flex flex-col gap-0.5">
            <span className={eyebrowClassName}>{t('contractSearch.dropOffLabel')}</span>
            <span className="text-sm">
              <EndpointPlaceName
                endpoint={row.destination}
                characterId={characterId}
                onPlaced={onStructurePlaced}
              />
            </span>
            {place(row.destination)}
            {planRouteHref !== null && (
              <Link
                to={planRouteHref}
                className={`-my-1.5 flex min-h-9 items-center self-start py-1 text-xs md:my-0 md:min-h-0 ${inlineLinkClassName}`}
              >
                {t('contractSearch.planRoute')}
              </Link>
            )}
          </div>

          <div className="flex flex-col gap-1 border-t border-line pt-2 text-xs">
            {reverseLane.kind === 'unresolved' ? (
              <span className="text-text-dim">{t('contractSearch.reverseLaneUnresolved')}</span>
            ) : reverseLane.count > 0 ? (
              <button
                type="button"
                onClick={onSearchReverseLane}
                className={`-my-1.5 flex min-h-9 items-center self-start py-1 md:my-0 md:min-h-0 ${inlineLinkClassName}`}
              >
                {t('contractSearch.reverseLaneCount', { count: reverseLane.count })}
              </button>
            ) : (
              <span className="text-text-dim">
                {reverseLane.unplaceable > 0 && returnRegionId !== null
                  ? t('contractSearch.reverseLaneNoneUnplaceable', {
                      count: reverseLane.unplaceable,
                      region: regionName(returnRegionId),
                    })
                  : t('contractSearch.reverseLaneNone')}
              </span>
            )}
            {reverseLane.kind === 'counted' &&
              reverseLane.count > 0 &&
              reverseLane.unplaceable > 0 &&
              returnRegionId !== null && (
                <span className="text-text-dim">
                  {t('contractSearch.reverseLaneUnplaceable', {
                    count: reverseLane.unplaceable,
                    region: regionName(returnRegionId),
                  })}
                </span>
              )}
          </div>
        </Well>

        {risks.length > 0 && (
          <Well size="lg" as="section" className="flex flex-col gap-1.5">
            <h3
              className={`text-[0.6875rem] font-semibold tracking-widest uppercase ${
                warns ? 'text-warning' : 'text-text-dim'
              }`}
            >
              {t(warns ? 'contractSearch.riskHeading' : 'contractSearch.riskNoteHeading')}
            </h3>
            <ul className="flex flex-col gap-1.5 text-sm">
              {risks.map((kind) => (
                <li key={kind}>
                  <span className="text-text-dim">{t(RISK_COPY[kind].short)}</span>
                  {' — '}
                  {t(RISK_COPY[kind].detail, {
                    multiple: goingRateMultiple === null ? '' : formatMagnitude(goingRateMultiple),
                    ratio: collateralRatio === null ? '' : formatMagnitude(collateralRatio),
                  })}
                </li>
              ))}
            </ul>
          </Well>
        )}

        <Well size="lg" as="section" className="flex flex-col gap-2">
          <h3 className={eyebrowClassName}>{t('contractSearch.goingRateBenchmarkLabel')}</h3>
          <ValueList variant="plain">
            <BenchmarkRow
              label={t('contractSearch.benchmark.rateLabel')}
              tip={
                measuring
                  ? t('contractSearch.goingRateMeasuring')
                  : goingRateMultiple === null
                    ? t('contractSearch.goingRateUnavailable')
                    : t('contractSearch.benchmark.rateTip')
              }
            >
              {measuring
                ? t('contractSearch.benchmark.measuring')
                : goingRateMultiple === null
                  ? t('contractSearch.benchmark.unavailable')
                  : t('contractSearch.benchmark.rateMultiple', {
                      multiple: formatMagnitude(goingRateMultiple),
                    })}
            </BenchmarkRow>
            {floor !== null && (
              <BenchmarkRow
                label={t('contractSearch.benchmark.floorLabel')}
                tip={`${t('contractSearch.benchmark.floorTip')}${
                  belowFloor && goingRateMultiple !== null
                    ? ` ${t('contractSearch.communityFloorVsGoingRate')}`
                    : ''
                }`}
              >
                {formatIskAuto(floor)}
                {belowFloor && (
                  <span className="text-warning">
                    {' · '}
                    {t('contractSearch.benchmark.floorShare', {
                      percent: formatMagnitude(shareOfFloor * 100),
                    })}
                  </span>
                )}
              </BenchmarkRow>
            )}
            {forcesFreighter(row.volume) && (
              <BenchmarkRow
                label={t('contractSearch.benchmark.cargoLabel')}
                tip={t('contractSearch.freighterVolumeNote', {
                  volume: formatMagnitude(FREIGHTER_VOLUME_M3),
                })}
                tone={
                  exposure?.kind === 'known' && exposure.exposedSystems > 0 ? 'warning' : 'default'
                }
              >
                {t('contractSearch.benchmark.freighterOnly')}
              </BenchmarkRow>
            )}
            {exposure?.kind === 'known' && exposure.chokepoints.length > 0 && (
              <BenchmarkRow
                label={t('contractSearch.benchmark.chokepointLabel')}
                tip={t('contractSearch.routeExposureChokepoints')}
                tone="warning"
              >
                {exposure.chokepoints.join(', ')}
              </BenchmarkRow>
            )}
            <BenchmarkRow
              label={t('contractSearch.benchmark.routeLabel')}
              tip={
                exposure === null || exposure.kind === 'known'
                  ? t('contractSearch.benchmark.routeTip')
                  : exposure.kind === 'no-route'
                    ? t('contractSearch.routeExposureNoRoute')
                    : t('contractSearch.routeExposureUnknown')
              }
            >
              {exposure === null
                ? t('contractSearch.benchmark.measuring')
                : exposure.kind === 'known'
                  ? exposure.exposedSystems === 0
                    ? t('contractSearch.benchmark.routeClear')
                    : String(exposure.exposedSystems)
                  : exposure.kind === 'no-route'
                    ? t('contractSearch.benchmark.noRoute')
                    : t('contractSearch.benchmark.routeUnknown')}
            </BenchmarkRow>
            <BenchmarkRow label={t('contractSearch.benchmark.expiresLabel')}>
              {t('contractSearch.benchmark.expiresIn', { hours: expiresIn })}
            </BenchmarkRow>
          </ValueList>
        </Well>

        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-sm sm:grid-cols-3">
          <Figure
            label={t('contractSearch.collateralColumn')}
            value={collateral === 0 ? '—' : <IskAmount value={collateral} />}
            note={
              collateral === 0
                ? t('contractSearch.noCollateralNote')
                : collateralRatio === null
                  ? undefined
                  : t('contractSearch.collateralRatioNote', {
                      ratio: formatMagnitude(collateralRatio),
                    })
            }
          />
          <Figure
            label={t('contractSearch.volumeColumn')}
            value={t('contractSearch.volumeValue', {
              volume: formatMagnitude(row.volume),
            })}
            note={
              volumeRate === null
                ? undefined
                : t('contractSearch.iskPerVolumeNote', { rate: formatIskAuto(volumeRate) })
            }
          />
          <Figure
            label={t('contractSearch.timeToDeliverLabel')}
            value={
              row.daysToComplete == null
                ? '—'
                : t('contractSearch.daysValue', { count: row.daysToComplete })
            }
            note={row.daysToComplete == null ? undefined : t('contractSearch.onceAcceptedNote')}
          />
          <Figure
            label={t('contractSearch.listingExpiresLabel')}
            value={formatTimestamp(new Date(row.dateExpired), timeZone)}
          />
          <Figure
            label={t('contractDetail.contractIdLabel')}
            value={
              <span className="flex items-center gap-1">
                {String(row.contractId)}
                <CopyContractIdButton contractId={row.contractId} />
              </span>
            }
          />
          <OpenInEveButton
            kind="contract"
            id={row.contractId}
            name={t('contractDetail.openInEveName', { id: row.contractId })}
            className="self-end"
          />
        </div>
      </div>
    </SlideOver>
  );
}
