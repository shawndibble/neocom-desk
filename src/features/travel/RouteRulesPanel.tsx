/**
 * Route Safety's Route rules panel (issue #2472): what this route avoids,
 * changeable while planning instead of a trip to Settings → Travel and back.
 *
 * Two groups, labelled so it is clear what each setting touches (decision
 * `20261003-161302`, amended by the Route Preference decision of 2026-10-06):
 * - the pilot's Travel Settings — the Route Preference and the rest, all the
 *   same synced stores and controls Settings → Travel shows
 *   (`features/route/TravelRuleFields.tsx`), never a copy;
 * - Route Safety only (issue #2476): routing through the Thera / Turnur
 *   holes. Saved as this page's default and overridable in the link, and
 *   deliberately not in Settings → Travel — no other page's jumps use holes.
 *   And Use jump bridges (issue #2478), with the Ansiblex list behind it:
 *   a device-local default, since the list itself never leaves the device.
 *
 * Those two groups sit behind one "More route options" disclosure (issue #3084),
 * closed by default, with an "N on" readout in its header while either is on.
 *
 * On a phone the panel folds above the route, with chips naming the rules on.
 */
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
  return (
    <h3 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
      {children}
    </h3>
  );
}

/** What the Route Safety group needs for Use jump bridges and the Ansiblex list. */
export interface RouteBridgeFieldsProps {
  /** Whether this route may cross bridges: the link's say, else the page's default. */
  bridgeQuery: RouteBridgeQuery;
  /** Saves the page's default, and drops the link's override of it. */
  onBridgesChange: (enabled: boolean) => void;
  /** How many Ansiblex are known on this device. */
  bridgeCount: number;
  /** Opens the Ansiblex list. */
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

/** What the hull's jump drive legs need: the switch and the longest single jump. */
export interface RouteJumpFieldsProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  range: RouteJumpRange;
  onRangeChange: (range: RouteJumpRange) => void;
}

/**
 * Allow jump drive legs (issue #3147): shown only for a hull with a jump drive,
 * straight under the hull it reads.
 */
function RouteJumpFields({
  jump,
  maxLy,
}: {
  jump: RouteJumpFieldsProps;
  /** The hull's range with its skills, the cap "Max" means. */
  maxLy: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      <label className={`flex items-center gap-2 font-semibold ${tappableRowClassName}`}>
        <Checkbox checked={jump.enabled} onChange={() => jump.onEnabledChange(!jump.enabled)} />
        {t('travel.jumpDrive.enabled')}
      </label>
      <p className="text-text-dim">{t('travel.jumpDrive.hint')}</p>
      {jump.enabled && (
        <>
          <p className="font-semibold">{t('travel.jumpDrive.range')}</p>
          <SegmentedControl
            label={t('travel.jumpDrive.range')}
            options={[
              {
                value: 'short' as const,
                label: t('travel.jumpDrive.short', { ly: (maxLy * SHORT_JUMP_SHARE).toFixed(1) }),
              },
              { value: 'max' as const, label: t('travel.jumpDrive.max', { ly: maxLy.toFixed(1) }) },
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

/**
 * Route Safety's own group: whether, and through which holes and bridges,
 * routes may go. Shared with Settings → Travel (`bare`: the panel there
 * supplies the heading and rule), so the two pages edit one set of controls.
 */
export function RouteHoleFields({
  query,
  onChange,
  bridges,
  bare = false,
  nested = false,
  jump,
}: {
  query: RouteHoleQuery;
  onChange: (change: RouteHoleChange) => void;
  bridges: RouteBridgeFieldsProps;
  bare?: boolean;
  /** Inside a disclosure that already draws the rule and padding above it. */
  nested?: boolean;
  /** Route Safety only: Settings → Travel has no jump drive legs to switch. */
  jump?: RouteJumpFieldsProps;
}) {
  const { t } = useTranslation();
  const lifeId = useId();
  const { enabled, settings } = query;
  const { hulls, ship } = useRouteShipMass();
  const shipTypeId = useRouteShipTypeId((state) => state.value);
  // Set when a hull choice filled the size; any edit of the size drops it (issue #2850).
  const [sizeHull, setSizeHull] = useState<string | null>(null);
  return (
    <section
      className={
        bare ? 'space-y-3 text-xs' : nested ? 'space-y-3' : 'space-y-3 border-t border-line pt-4'
      }
    >
      {!bare && <GroupLabel>{t('travel.holes.group')}</GroupLabel>}
      <label className={`flex items-center gap-2 font-semibold ${tappableRowClassName}`}>
        <Checkbox
          checked={enabled}
          onChange={() => onChange({ field: 'enabled', value: !enabled })}
        />
        {t('travel.holes.enabled')}
      </label>
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
            // A hull the map names sets the size; clearing or an unmapped hull leaves it alone.
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
          uppercase={false}
        />
      </div>
      <RouteBridgeFields {...bridges} />
    </section>
  );
}

/** The rules on, as readouts: the folded panel's stand-in on a phone. */
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
}: {
  /** The preference this route is drawn with: the link's, else the pilot's default. */
  preference: RoutePreferenceKind;
  /** Saves the pilot's default (the one Settings → Travel shows), and drops the link's override. */
  onPreferenceChange: (next: RoutePreferenceKind) => void;
  /** The wormhole settings this route is drawn with: the link's, else the page's defaults. */
  holeQuery: RouteHoleQuery;
  /** Saves the page's default, and drops the link's override of it. */
  onHoleChange: (change: RouteHoleChange) => void;
  bridges: RouteBridgeFieldsProps;
  jump: RouteJumpFieldsProps;
}) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const [expanded, setExpanded] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const penaltyId = useId();
  // Held until every setting is read, so a click cannot write a default over a stored value.
  const { settingsHydrated, podKillsUnavailable } = useRouteRules();
  const avoidedCount = useAvoidedSystems((state) => state.value.length);
  const { ship } = useRouteShipMass();
  const moreOn =
    Number(holeQuery.enabled) +
    Number(bridges.bridgeQuery.enabled) +
    Number(jump.enabled && ship?.drive != null);

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
