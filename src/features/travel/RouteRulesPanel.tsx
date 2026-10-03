/**
 * Route Safety's Route rules panel (issue #2472): what this route avoids,
 * changeable while planning instead of a trip to Settings → Travel and back.
 *
 * Two groups, labelled so it is clear what each setting touches (decision
 * `20261003-161302`):
 * - the Route Preference, this route only and kept in the link;
 * - the pilot's Travel Settings — the same synced stores and the same
 *   controls Settings → Travel shows (`features/route/TravelRuleFields.tsx`),
 *   never a copy.
 *
 * On a phone the panel folds above the route, with chips naming the rules on.
 */
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CollapsiblePanel, SegmentedControl, Spinner, StatChip, StatChips } from '@/components/ui';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { useAvoidedSystems } from '@/features/route/avoidedSystems';
import { ROUTE_PREFERENCE_LABEL_KEYS, ROUTE_PREFERENCES } from '@/features/route/routePreferences';
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

/** Literal keys, so the locale split finds them. */
const SEGMENT_LABEL_KEYS: Readonly<Record<RoutePreferenceKind, string>> = {
  'prefer-highsec': 'travel.rules.preference.prefer-highsec',
  shortest: 'travel.rules.preference.shortest',
  'avoid-highsec': 'travel.rules.preference.avoid-highsec',
};

function GroupLabel({ children }: { children: string }) {
  return (
    <h3 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
      {children}
    </h3>
  );
}

/** The rules on, as readouts: the folded panel's stand-in on a phone. */
function ActiveRuleChips({ preference }: { preference: RoutePreferenceKind }) {
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
      </StatChips>
    </div>
  );
}

export function RouteRulesPanel({
  preference,
  onPreferenceChange,
}: {
  /** The preference this route is drawn with: the link's, else the pilot's default. */
  preference: RoutePreferenceKind;
  /** Writes the link only — never the saved default. */
  onPreferenceChange: (next: RoutePreferenceKind) => void;
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
      collapsedSummary={settingsHydrated && <ActiveRuleChips preference={preference} />}
    >
      {settingsHydrated ? (
        <div className="space-y-5 text-xs">
          <section className="space-y-2">
            <GroupLabel>{t('travel.rules.thisRoute')}</GroupLabel>
            <SegmentedControl
              label={t('travel.rules.preferenceLabel')}
              options={ROUTE_PREFERENCES.map((value) => ({
                value,
                label: t(SEGMENT_LABEL_KEYS[value]),
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
        </div>
      ) : (
        <Spinner />
      )}
    </CollapsiblePanel>
  );
}
