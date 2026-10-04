import { useTranslation } from 'react-i18next';
import { Checkbox, Field, Fields, Spinner, TextInput } from '@/components/ui';
import { useAssumedMe, MIN_ASSUMED_ME, MAX_ASSUMED_ME } from '@/features/industry/assumedMe';
import { useAssumedTe, MIN_ASSUMED_TE, MAX_ASSUMED_TE } from '@/features/industry/assumedTe';
import { useIncludeBlueprintCost } from '@/features/industry/includeBlueprintCost';
import { DefaultsSyncHint } from './settingsFields';
import { useHydratedStore } from './useHydratedStore';

/**
 * Industry's settings: Settings → Industry, and the Industry page's settings
 * modal. Every control defaults to exactly what the app did before it was
 * settable, so an existing pilot's numbers do not move until they ask them to.
 *
 * Gates on its own stores: a control that rendered its default first would not
 * merely flicker, a press landing in that window would write the default over
 * what is on disk.
 */
export function IndustrySettingsForm() {
  const { t } = useTranslation();
  const assumedMe = useAssumedMe((state) => state.value);
  const setAssumedMe = useAssumedMe((state) => state.setValue);
  const assumedTe = useAssumedTe((state) => state.value);
  const setAssumedTe = useAssumedTe((state) => state.setValue);
  const includeBlueprintCost = useIncludeBlueprintCost((state) => state.value);
  const setIncludeBlueprintCost = useIncludeBlueprintCost((state) => state.setValue);

  // Each on its own line, never `a() && b()`: `&&` short-circuits, which would
  // make every hook after the first false one a conditional call.
  const assumedMeHydrated = useHydratedStore(useAssumedMe);
  const assumedTeHydrated = useHydratedStore(useAssumedTe);
  const includeBlueprintCostHydrated = useHydratedStore(useIncludeBlueprintCost);
  const ready = assumedMeHydrated && assumedTeHydrated && includeBlueprintCostHydrated;

  if (!ready) return <Spinner />;

  return (
    <div className="space-y-4">
      <DefaultsSyncHint />
      <Fields variant="form">
        <Field
          label={t('settings.assumedMeLabel')}
          htmlFor="settings-assumed-me"
          note={t('settings.assumedMeHint')}
        >
          <TextInput
            id="settings-assumed-me"
            type="number"
            min={MIN_ASSUMED_ME}
            max={MAX_ASSUMED_ME}
            step={1}
            value={assumedMe}
            onChange={(event) => {
              const parsed = Math.round(Number(event.target.value));
              if (!Number.isFinite(parsed)) return;
              void setAssumedMe(Math.min(MAX_ASSUMED_ME, Math.max(MIN_ASSUMED_ME, parsed)));
            }}
            className="w-24"
          />
        </Field>

        {/*
          Beside its ME twin rather than merged with it: the two answer
          different questions (material cost, job time), and TE's range is
          0..20 where ME's is 0..10 (issue #634).
        */}
        <Field
          label={t('settings.assumedTeLabel')}
          htmlFor="settings-assumed-te"
          note={t('settings.assumedTeHint')}
        >
          <TextInput
            id="settings-assumed-te"
            type="number"
            min={MIN_ASSUMED_TE}
            max={MAX_ASSUMED_TE}
            step={1}
            value={assumedTe}
            onChange={(event) => {
              const parsed = Math.round(Number(event.target.value));
              if (!Number.isFinite(parsed)) return;
              void setAssumedTe(Math.min(MAX_ASSUMED_TE, Math.max(MIN_ASSUMED_TE, parsed)));
            }}
            className="w-24"
          />
        </Field>

        <Field
          label={t('settings.includeBlueprintCostLabel')}
          htmlFor="settings-include-blueprint-cost"
          inline
          note={t('settings.includeBlueprintCostHint')}
        >
          <Checkbox
            id="settings-include-blueprint-cost"
            checked={includeBlueprintCost}
            onChange={() => void setIncludeBlueprintCost(!includeBlueprintCost)}
          />
        </Field>
      </Fields>
    </div>
  );
}
