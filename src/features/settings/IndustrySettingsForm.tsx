import { useTranslation } from 'react-i18next';
import { Field, Fields, SegmentedControl, TextInput } from '@/components/ui';
import { useProfitBasis } from '@/features/industry/profitBasisSetting';
import { useAssumedMe, MIN_ASSUMED_ME, MAX_ASSUMED_ME } from '@/features/industry/assumedMe';
import { useAssumedTe, MIN_ASSUMED_TE, MAX_ASSUMED_TE } from '@/features/industry/assumedTe';
import { SettingsFormLoading } from './settingsFields';
import { useHydratedStore } from '@/lib/useHydratedStore';

export function IndustrySettingsForm({ onlyAssumedMe = false }: { onlyAssumedMe?: boolean }) {
  const { t } = useTranslation();
  const assumedMe = useAssumedMe((state) => state.value);
  const setAssumedMe = useAssumedMe((state) => state.setValue);
  const assumedTe = useAssumedTe((state) => state.value);
  const setAssumedTe = useAssumedTe((state) => state.setValue);
  const profitBasis = useProfitBasis((state) => state.value);
  const setProfitBasis = useProfitBasis((state) => state.setValue);

  const assumedMeHydrated = useHydratedStore(useAssumedMe);
  const assumedTeHydrated = useHydratedStore(useAssumedTe);
  const profitBasisHydrated = useHydratedStore(useProfitBasis);
  const ready = assumedMeHydrated && assumedTeHydrated && profitBasisHydrated;

  if (!ready) return <SettingsFormLoading />;

  return (
    <div className="space-y-4">
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

        {!onlyAssumedMe && (
          <>
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

            <Field label={t('settings.profitBasisLabel')} note={t('settings.profitBasisHint')}>
              <SegmentedControl
                label={t('settings.profitBasisLabel')}
                options={[
                  { value: 'sellValue', label: t('settings.profitBasisSellPrice') },
                  { value: 'free', label: t('settings.profitBasisFree') },
                ]}
                value={profitBasis}
                onChange={(value) => void setProfitBasis(value)}
              />
            </Field>
          </>
        )}
      </Fields>
    </div>
  );
}
