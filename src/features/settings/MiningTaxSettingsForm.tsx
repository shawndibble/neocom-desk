import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { useTranslation } from 'react-i18next';
import { Checkbox, Field, Fields, Spinner } from '@/components/ui';
import { useMiningTaxOreValueMode } from '@/features/miningTax/oreValueMode';
import { useMiningTaxCompressedOre } from '@/features/miningTax/oreForm';
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
  const compressedOre = useMiningTaxCompressedOre((state) => state.value);
  const setCompressedOre = useMiningTaxCompressedOre((state) => state.setValue);
  const autoContinue = useAutoContinueSessions((state) => state.value);
  const setAutoContinue = useAutoContinueSessions((state) => state.setValue);

  const oreValueModeHydrated = useHydratedStore(useMiningTaxOreValueMode);
  const compressedOreHydrated = useHydratedStore(useMiningTaxCompressedOre);
  const autoContinueHydrated = useHydratedStore(useAutoContinueSessions);
  if (!oreValueModeHydrated || !compressedOreHydrated || !autoContinueHydrated) return <Spinner />;

  return (
    <div className="space-y-4">
      <DefaultsSyncHint />
      <Fields variant="form">
        <CheckboxField
          id="settings-mining-tax-compressed-ore"
          label={t('settings.miningTaxCompressedOreLabel')}
          hint={t('settings.miningTaxCompressedOreHint')}
          checked={compressedOre}
          onChange={() => void setCompressedOre(!compressedOre)}
        />
        <CheckboxField
          id="settings-mining-tax-ore-value-mode"
          label={t('settings.miningTaxOreValueModeLabel')}
          hint={t('settings.miningTaxOreValueModeHint')}
          checked={oreValueMode}
          onChange={() => void setOreValueMode(!oreValueMode)}
        />
        {/* Device-local (`continueSessionPref.ts`): its hint says so. */}
        <CheckboxField
          id="settings-mining-tax-auto-continue"
          label={t('settings.miningTaxAutoContinueLabel')}
          hint={t('settings.miningTaxAutoContinueHint')}
          checked={autoContinue}
          onChange={() => {
            if (onAutoContinueChange) onAutoContinueChange(!autoContinue);
            else void setAutoContinue(!autoContinue);
          }}
        />
      </Fields>
    </div>
  );
}

interface CheckboxFieldProps {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: () => void;
}

/** One lone-checkbox row of the Settings form grid, hint as the row's note. */
function CheckboxField({ id, label, hint, checked, onChange }: CheckboxFieldProps) {
  return (
    <Field label={label} htmlFor={id} inline note={hint}>
      <label className={touchCheckboxLabelClassName}>
        <Checkbox id={id} checked={checked} onChange={onChange} />
      </label>
    </Field>
  );
}
