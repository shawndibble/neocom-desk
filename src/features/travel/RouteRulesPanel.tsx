/**
 * Route Safety's Route rules panel (issue #2472): what this route avoids,
 * changeable while planning instead of a trip to Settings → Travel and back.
 *
 * Three groups, labelled so it is clear what each setting touches (decision
 * `20261003-161302`):
 * - the Route Preference, this route only and kept in the link;
 * - the pilot's Travel Settings — the same synced stores and the same
 *   controls Settings → Travel shows (`features/route/TravelRuleFields.tsx`),
 *   never a copy;
 * - Route Safety only (issue #2476): routing through the Thera / Turnur
 *   holes. Saved as this page's default and overridable in the link, and
 *   deliberately not in Settings → Travel — no other page's jumps use holes.
 *
 * On a phone the panel folds above the route, with chips naming the rules on.
 */
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Checkbox,
  CollapsiblePanel,
  SegmentedControl,
  Spinner,
  StatChip,
  StatChips,
  TextInput,
} from '@/components/ui';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { WORMHOLE_SHIP_SIZES } from '@/engine/route/theraConnections';
import {
  MAX_ROUTE_HOLE_MIN_LIFE,
  MIN_ROUTE_HOLE_MIN_LIFE,
  parseRouteHoleMinLife,
  ROUTE_HOLE_HUBS,
  type RouteHoleOverrides,
  type RouteHoleQuery,
} from '@/features/route/routeHoleSettings';
import { useAvoidedSystems } from '@/features/route/avoidedSystems';
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

/** A change to one wormhole setting: the field and its new value. */
export type RouteHoleChange = {
  [K in keyof RouteHoleOverrides]: { field: K; value: NonNullable<RouteHoleOverrides[K]> };
}[keyof RouteHoleOverrides];

/** Route Safety's own group: whether, and through which holes, routes may go. */
function RouteHoleFields({
  query,
  onChange,
}: {
  query: RouteHoleQuery;
  onChange: (change: RouteHoleChange) => void;
}) {
  const { t } = useTranslation();
  const lifeId = useId();
  const { enabled, settings } = query;
  return (
    <section className="space-y-3 border-t border-line pt-4">
      <GroupLabel>{t('travel.holes.group')}</GroupLabel>
      <label className="flex items-center gap-2 font-semibold">
        <Checkbox
          checked={enabled}
          onChange={() => onChange({ field: 'enabled', value: !enabled })}
        />
        {t('travel.holes.enabled')}
      </label>
      <div className="space-y-1.5">
        <p className="font-semibold">{t('travel.holes.shipSize')}</p>
        <SegmentedControl
          label={t('travel.holes.shipSize')}
          options={WORMHOLE_SHIP_SIZES.map((value) => ({
            value,
            label: t(`travel.thera.fits.${value}`),
          }))}
          value={settings.shipSize}
          onChange={(value) => onChange({ field: 'shipSize', value })}
          size="sm"
          fill
          uppercase={false}
        />
      </div>
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
    </section>
  );
}

/** The rules on, as readouts: the folded panel's stand-in on a phone. */
function ActiveRuleChips({
  preference,
  holeQuery,
}: {
  preference: RoutePreferenceKind;
  holeQuery: RouteHoleQuery;
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
      </StatChips>
    </div>
  );
}

export function RouteRulesPanel({
  preference,
  onPreferenceChange,
  holeQuery,
  onHoleChange,
}: {
  /** The preference this route is drawn with: the link's, else the pilot's default. */
  preference: RoutePreferenceKind;
  /** Writes the link only — never the saved default. */
  onPreferenceChange: (next: RoutePreferenceKind) => void;
  /** The wormhole settings this route is drawn with: the link's, else the page's defaults. */
  holeQuery: RouteHoleQuery;
  /** Saves the page's default, and drops the link's override of it. */
  onHoleChange: (change: RouteHoleChange) => void;
}) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const [expanded, setExpanded] = useState(false);
  const penaltyId = useId();
  // Held until every setting is read, so a click cannot write a default over a stored value.
  const { settingsHydrated, podKillsUnavailable } = useRouteRules();
  const avoidedCount = useAvoidedSystems((state) => state.value.length);

  return (
    <CollapsiblePanel
      title={t('travel.rules.title')}
      expanded={expanded}
      onToggle={() => setExpanded((open) => !open)}
      collapsible={isPhone}
      labels={{ show: t('travel.rules.show'), hide: t('travel.rules.hide') }}
      collapsedSummary={
        settingsHydrated &&
        holeQuery.hydrated && <ActiveRuleChips preference={preference} holeQuery={holeQuery} />
      }
    >
      {settingsHydrated && holeQuery.hydrated ? (
        <div className="space-y-5 text-xs">
          <section className="space-y-2">
            <GroupLabel>{t('travel.rules.thisRoute')}</GroupLabel>
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
          </section>

          <section className="space-y-4 border-t border-line pt-4">
            <GroupLabel>{t('travel.rules.travelSettings')}</GroupLabel>
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

          <RouteHoleFields query={holeQuery} onChange={onHoleChange} />
        </div>
      ) : (
        <Spinner />
      )}
    </CollapsiblePanel>
  );
}
