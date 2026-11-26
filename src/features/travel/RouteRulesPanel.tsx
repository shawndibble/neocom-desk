import { fixed1 } from '@/lib/fixedFormat';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouteShipMass, useRouteShipTypeId } from '@/features/route/routeShip';
import {
  Button,
  Checkbox,
  CollapsiblePanel,
  Disclosure,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SegmentedControl,
  LiveStatus,
  Spinner,
  StatChip,
  StatChips,
  TextInput,
} from '@/components/ui';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { WORMHOLE_SHIP_SIZES } from '@/engine/route/theraConnections';
import { wormholeSizeForShipGroup } from '@/engine/route/hullWormholeSize';
import {
  MAX_ROUTE_HOLE_MIN_LIFE,
  MIN_ROUTE_HOLE_MIN_LIFE,
  parseRouteHoleMinLife,
  ROUTE_HOLE_HUBS,
  type RouteHoleChange,
  type RouteHoleQuery,
} from '@/features/route/routeHoleSettings';
import { useAvoidedSystems } from '@/features/route/avoidedSystems';
import type { RouteBridgeQuery } from '@/features/route/routeBridgeSettings';
import { hullJumpDrive } from '@/engine/route/jumpLegs';
import { SHORT_JUMP_SHARE, type RouteJumpRange } from '@/features/route/routeJumpSettings';
import {
  ROUTE_PREFERENCE_LABEL_KEYS,
  ROUTE_PREFERENCE_SHORT_LABEL_KEYS,
  ROUTE_PREFERENCES,
} from '@/features/route/routePreferences';
import {
  useAvoidedSystemsEnabled,
  useAvoidEdencom,
  useAvoidPodKills,
  useAvoidTriglavian,
  usePodKillThreshold,
  useRouteRules,
  useSecurityPenalty,
} from '@/features/route/routeRules';
import {
  AvoidedSystemsEditor,
  AvoidRuleToggles,
  SecurityPenaltyInput,
  SecurityPenaltyNote,
} from '@/features/route/TravelRuleFields';
import { useIsPhone } from '@/lib/useIsPhone';

function GroupLabel({ children }: { children: string }) {
  return <h3 className={eyebrowClassName}>{children}</h3>;
}

export interface RouteBridgeFieldsProps {
  bridgeQuery: RouteBridgeQuery;
  onBridgesChange: (enabled: boolean) => void;
  bridgeCount: number;
  onManageBridges: () => void;
}

export function RouteBridgeFields({
  bridgeQuery,
  onBridgesChange,
  bridgeCount,
  onManageBridges,
}: RouteBridgeFieldsProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      <label className={`flex items-center gap-2 font-semibold ${tappableRowClassName}`}>
        <Checkbox
          checked={bridgeQuery.enabled}
          onChange={() => onBridgesChange(!bridgeQuery.enabled)}
        />
        {t('travel.bridges.enabled')}
      </label>
      <Button size="sm" variant="ghost" onClick={onManageBridges}>
        {t('travel.bridges.manage', { count: bridgeCount })}
      </Button>
    </div>
  );
}

export interface RouteJumpFieldsProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  range: RouteJumpRange;
  onRangeChange: (range: RouteJumpRange) => void;
  unavailable?: boolean;
}

function RouteJumpFields({ jump, maxLy }: { jump: RouteJumpFieldsProps; maxLy: number }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      <LiveStatus>
        {jump.enabled && jump.unavailable ? t('travel.jumpDrive.unavailable') : ''}
      </LiveStatus>
      <label className={`flex items-center gap-2 font-semibold ${tappableRowClassName}`}>
        <Checkbox checked={jump.enabled} onChange={() => jump.onEnabledChange(!jump.enabled)} />
        {t('travel.jumpDrive.enabled')}
      </label>
      <p className="text-text-dim">{t('travel.jumpDrive.hint')}</p>
      {jump.enabled && jump.unavailable && (
        <p className="text-warning">{t('travel.jumpDrive.unavailable')}</p>
      )}
      {jump.enabled && (
        <>
          <p className="font-semibold">{t('travel.jumpDrive.range')}</p>
          <SegmentedControl
            label={t('travel.jumpDrive.range')}
            options={[
              {
                value: 'short' as const,
                label: t('travel.jumpDrive.short', { ly: fixed1(maxLy * SHORT_JUMP_SHARE) }),
              },
              { value: 'max' as const, label: t('travel.jumpDrive.max', { ly: fixed1(maxLy) }) },
            ]}
            value={jump.range}
            onChange={jump.onRangeChange}
            size="sm"
            fill
            uppercase={false}
          />
        </>
      )}
    </div>
  );
}

const NO_SHIP = 'none';

function RouteHoleSwitch({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (change: RouteHoleChange) => void;
}) {
  const { t } = useTranslation();
  return (
    <label className={`flex items-center gap-2 font-semibold ${tappableRowClassName}`}>
      <Checkbox
        checked={enabled}
        onChange={() => onChange({ field: 'enabled', value: !enabled })}
      />
      {t('travel.holes.enabled')}
    </label>
  );
}

const bareFillClassName = 'md:inline-flex md:w-auto md:*:flex-none';

export function RouteHoleFields({
  query,
  onChange,
  bridges,
  bare = false,
  nested = false,
  jump,
  onBrowseWormholes,
}: {
  query: RouteHoleQuery;
  onChange: (change: RouteHoleChange) => void;
  bridges: RouteBridgeFieldsProps;
  bare?: boolean;
  nested?: boolean;
  jump?: RouteJumpFieldsProps;
  onBrowseWormholes?: () => void;
}) {
  const { t } = useTranslation();
  const lifeId = useId();
  const { enabled, settings } = query;
  const { hulls, ship } = useRouteShipMass();
  const shipTypeId = useRouteShipTypeId((state) => state.value);
  const [sizeHull, setSizeHull] = useState<string | null>(null);
  return (
    <section
      className={
        bare ? 'space-y-3 text-xs' : nested ? 'space-y-3' : 'space-y-3 border-t border-line pt-4'
      }
    >
      {!bare && <GroupLabel>{t('travel.holes.group')}</GroupLabel>}
      {onBrowseWormholes ? (
        <Button size="sm" onClick={onBrowseWormholes}>
          {t('travel.holes.browse')}
        </Button>
      ) : (
        <RouteHoleSwitch enabled={enabled} onChange={onChange} />
      )}
      <div className="space-y-1.5">
        <p className="font-semibold">
          {t('travel.holes.shipSize')}
          {sizeHull !== null && (
            <span className="ml-2 font-normal text-text-dim">
              {t('travel.holes.sizeFromHull', { hull: sizeHull })}
            </span>
          )}
        </p>
        <SegmentedControl
          label={t('travel.holes.shipSize')}
          options={WORMHOLE_SHIP_SIZES.map((value) => ({
            value,
            label: t(`travel.thera.fits.${value}`),
          }))}
          value={settings.shipSize}
          onChange={(value) => {
            setSizeHull(null);
            onChange({ field: 'shipSize', value });
          }}
          size="sm"
          fill
          className={bare ? bareFillClassName : undefined}
          uppercase={false}
        />
      </div>
      <div className="space-y-1.5">
        <p className="font-semibold">{t('travel.holes.ship')}</p>
        <Select
          value={shipTypeId === null ? NO_SHIP : String(shipTypeId)}
          onValueChange={(value) => {
            const hull =
              value === NO_SHIP ? undefined : hulls.find((h) => String(h.typeId) === value);
            void useRouteShipTypeId.getState().setValue(hull?.typeId ?? null);
            const size = hull && wormholeSizeForShipGroup(hull.groupId);
            if (hull && size) {
              onChange({ field: 'shipSize', value: size });
              setSizeHull(hull.name);
            }
          }}
        >
          <SelectTrigger size="sm" aria-label={t('travel.holes.ship')}>
            <SelectValue placeholder={t('travel.holes.shipPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_SHIP}>{t('travel.holes.shipNone')}</SelectItem>
            {hulls.map((hull) => (
              <SelectItem key={hull.typeId} value={String(hull.typeId)}>
                {hull.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-text-dim">{t('travel.tripTime.ruleHint')}</p>
      </div>
      {jump && ship?.drive && (
        <RouteJumpFields jump={jump} maxLy={hullJumpDrive(ship.groupId, ship.drive).rangeLy} />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={lifeId}>{t('travel.holes.minLifeBefore')}</label>
        <TextInput
          id={lifeId}
          type="number"
          className="w-16"
          min={MIN_ROUTE_HOLE_MIN_LIFE}
          max={MAX_ROUTE_HOLE_MIN_LIFE}
          step={1}
          value={settings.minLifeHours}
          aria-label={t('travel.holes.minLifeLabel')}
          onChange={(event) => {
            const next =
              event.target.value === '' ? null : parseRouteHoleMinLife(Number(event.target.value));
            if (next !== null) onChange({ field: 'minLifeHours', value: next });
          }}
        />
        <span>{t('travel.holes.minLifeAfter')}</span>
      </div>
      <div className="space-y-1.5">
        <p className="font-semibold">{t('travel.holes.hubs')}</p>
        <SegmentedControl
          label={t('travel.holes.hubs')}
          options={ROUTE_HOLE_HUBS.map((value) => ({
            value,
            label: t(`travel.thera.hub.${value}`),
          }))}
          value={settings.hubs}
          onChange={(value) => onChange({ field: 'hubs', value })}
          size="sm"
          fill
          className={bare ? bareFillClassName : undefined}
          uppercase={false}
        />
      </div>
      <RouteBridgeFields {...bridges} />
    </section>
  );
}

function ActiveRuleChips({
  preference,
  holeQuery,
  bridges,
}: {
  preference: RoutePreferenceKind;
  holeQuery: RouteHoleQuery;
  bridges: RouteBridgeFieldsProps;
}) {
  const { t } = useTranslation();
  const penalty = useSecurityPenalty((state) => state.value);
  const avoidEdencom = useAvoidEdencom((state) => state.value);
  const avoidTriglavian = useAvoidTriglavian((state) => state.value);
  const avoidPodKills = useAvoidPodKills((state) => state.value);
  const podKillThreshold = usePodKillThreshold((state) => state.value);
  const avoided = useAvoidedSystems((state) => state.value);
  const avoidedEnabled = useAvoidedSystemsEnabled((state) => state.value);
  return (
    <div role="group" aria-label={t('travel.rules.chipsLabel')}>
      <StatChips dense>
        <StatChip
          label={t('travel.rules.chip.preference')}
          value={t(ROUTE_PREFERENCE_LABEL_KEYS[preference])}
        />
        {preference !== 'shortest' && (
          <StatChip label={t('travel.rules.chip.penalty')} value={penalty} />
        )}
        {avoidEdencom && (
          <StatChip label={t('travel.rules.chip.avoid')} value={t('travel.rules.chip.edencom')} />
        )}
        {avoidTriglavian && (
          <StatChip
            label={t('travel.rules.chip.avoid')}
            value={t('travel.rules.chip.triglavian')}
          />
        )}
        {avoidPodKills && (
          <StatChip
            label={t('travel.rules.chip.avoid')}
            value={t('travel.rules.chip.podKills', { count: podKillThreshold })}
          />
        )}
        {avoidedEnabled && avoided.length > 0 && (
          <StatChip label={t('travel.rules.chip.avoided')} value={avoided.length} />
        )}
        {holeQuery.enabled && (
          <StatChip
            label={t('travel.holes.chip')}
            value={t(`travel.thera.hub.${holeQuery.settings.hubs}`)}
          />
        )}
        {bridges.bridgeQuery.enabled && (
          <StatChip
            label={t('travel.bridges.chip')}
            value={t('travel.bridges.chipValue', { count: bridges.bridgeCount })}
          />
        )}
      </StatChips>
    </div>
  );
}

export function RouteRulesPanel({
  preference,
  onPreferenceChange,
  holeQuery,
  onHoleChange,
  bridges,
  jump,
  onBrowseWormholes,
}: {
  preference: RoutePreferenceKind;
  onPreferenceChange: (next: RoutePreferenceKind) => void;
  holeQuery: RouteHoleQuery;
  onHoleChange: (change: RouteHoleChange) => void;
  bridges: RouteBridgeFieldsProps;
  jump: RouteJumpFieldsProps;
  onBrowseWormholes: () => void;
}) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const [expanded, setExpanded] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const penaltyId = useId();
  const { settingsHydrated, podKillsUnavailable } = useRouteRules();
  const avoidedCount = useAvoidedSystems((state) => state.value.length);
  const { ship } = useRouteShipMass();
  const moreOn = Number(bridges.bridgeQuery.enabled) + Number(jump.enabled && ship?.drive != null);

  return (
    <CollapsiblePanel
      title={t('travel.rules.title')}
      expanded={expanded}
      onToggle={() => setExpanded((open) => !open)}
      collapsible={isPhone}
      labels={{ show: t('travel.rules.show'), hide: t('travel.rules.hide') }}
      collapsedSummary={
        settingsHydrated &&
        holeQuery.hydrated &&
        bridges.bridgeQuery.hydrated && (
          <ActiveRuleChips preference={preference} holeQuery={holeQuery} bridges={bridges} />
        )
      }
    >
      {settingsHydrated && holeQuery.hydrated && bridges.bridgeQuery.hydrated ? (
        <div className="space-y-5 text-xs">
          <section className="space-y-4">
            <GroupLabel>{t('travel.rules.travelSettings')}</GroupLabel>
            <SegmentedControl
              label={t('travel.rules.preferenceLabel')}
              options={ROUTE_PREFERENCES.map((value) => ({
                value,
                label: t(ROUTE_PREFERENCE_SHORT_LABEL_KEYS[value]),
              }))}
              value={preference}
              onChange={onPreferenceChange}
              size="sm"
              fill
              uppercase={false}
            />
            <div className="space-y-1.5">
              <label htmlFor={penaltyId} className="block font-semibold">
                {t('settings.travel.penaltyLabel')}
              </label>
              <SecurityPenaltyInput id={penaltyId} preference={preference} />
              <p className="text-text-dim">
                <SecurityPenaltyNote preference={preference} />
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="font-semibold">{t('settings.travel.avoidTitle')}</p>
              <AvoidRuleToggles podKillsUnavailable={podKillsUnavailable} />
            </div>
            <AvoidedSystemsEditor
              narrow
              switchLabel={t('travel.rules.avoidedSystems', { count: avoidedCount })}
            />
          </section>

          <RouteHoleSwitch enabled={holeQuery.enabled} onChange={onHoleChange} />

          <Disclosure
            label={t('travel.rules.more')}
            trailing={moreOn > 0 ? t('travel.rules.moreOn', { count: moreOn }) : undefined}
            expanded={moreOpen}
            onToggle={() => setMoreOpen((open) => !open)}
            className="-mx-3 border-t border-line"
          >
            <div className="p-3">
              <RouteHoleFields
                query={holeQuery}
                onChange={onHoleChange}
                bridges={bridges}
                jump={jump}
                onBrowseWormholes={onBrowseWormholes}
                nested
              />
            </div>
          </Disclosure>
        </div>
      ) : (
        <Spinner />
      )}
    </CollapsiblePanel>
  );
}
