import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { useTranslation } from 'react-i18next';
import { Checkbox, Field, Fields, Spinner } from '@/components/ui';
import { useMiningTaxOreValueMode } from '@/features/miningTax/oreValueMode';
import { useAutoContinueSessions } from '@/features/miningTax/continueSessionPref';
import { DefaultsSyncHint } from './settingsFields';
import { useHydratedStore } from './useHydratedStore';

interface MiningTaxSettingsFormProps {
  /**
   * Replaces the plain store write for "Continue sessions automatically". The
   * Tax tab passes its own: switching auto on there first parks the offers
   * already on screen, so turning the setting on never continues a session the
   * pilot was still looking at. Settings has no offers on screen, so it writes
   * the store directly.
   */
  onAutoContinueChange?: (next: boolean) => void;
}

/** Moon Mining Tax's settings: Settings → Mining tax, and the Tax tab's settings modal. */
export function MiningTaxSettingsForm({ onAutoContinueChange }: MiningTaxSettingsFormProps) {
  const { t } = useTranslation();
  const oreValueMode = useMiningTaxOreValueMode((state) => state.value);
  const setOreValueMode = useMiningTaxOreValueMode((state) => state.setValue);
  const autoContinue = useAutoContinueSessions((state) => state.value);
  const setAutoContinue = useAutoContinueSessions((state) => state.setValue);

  const oreValueModeHydrated = useHydratedStore(useMiningTaxOreValueMode);
  const autoContinueHydrated = useHydratedStore(useAutoContinueSessions);
  if (!oreValueModeHydrated || !autoContinueHydrated) return <Spinner />;

  return (
    <div className="space-y-4">
      <DefaultsSyncHint />
      <Fields variant="form">
        <Field
          label={t('settings.miningTaxOreValueModeLabel')}
          htmlFor="settings-mining-tax-ore-value-mode"
          inline
          note={t('settings.miningTaxOreValueModeHint')}
        >
          <label className={touchCheckboxLabelClassName}>
            <Checkbox
              id="settings-mining-tax-ore-value-mode"
              checked={oreValueMode}
              onChange={() => void setOreValueMode(!oreValueMode)}
            />
          </label>
        </Field>
        {/* Device-local (`continueSessionPref.ts`); its note says so. Same grid as
            the row above so both checkboxes share one column. */}
        <Field
          label={t('settings.miningTaxAutoContinueLabel')}
          htmlFor="settings-mining-tax-auto-continue"
          inline
          note={t('settings.miningTaxAutoContinueHint')}
        >
          <label className={touchCheckboxLabelClassName}>
            <Checkbox
              id="settings-mining-tax-auto-continue"
              checked={autoContinue}
              onChange={() => {
                if (onAutoContinueChange) onAutoContinueChange(!autoContinue);
                else void setAutoContinue(!autoContinue);
              }}
            />
          </label>
        </Field>
      </Fields>
    </div>
  );
}
