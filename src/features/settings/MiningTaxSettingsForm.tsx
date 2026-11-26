import { useTranslation } from 'react-i18next';
import { Fields } from '@/components/ui';
import { useMiningTaxOreValueMode } from '@/features/miningTax/oreValueMode';
import { useMiningTaxCompressedOre } from '@/features/miningTax/oreForm';
import { useAutoContinueSessions } from '@/features/miningTax/continueSessionPref';
import { CheckboxField, SettingsFormLoading } from './settingsFields';
import { useHydratedStore } from '@/lib/useHydratedStore';

interface MiningTaxSettingsFormProps {
  onAutoContinueChange?: (next: boolean) => void;
}

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
  if (!oreValueModeHydrated || !compressedOreHydrated || !autoContinueHydrated)
    return <SettingsFormLoading />;

  return (
    <div className="space-y-4">
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
        <CheckboxField
          id="settings-mining-tax-auto-continue"
          label={t('settings.miningTaxAutoContinueLabel')}
          hint={t('settings.miningTaxAutoContinueHint')}
          scope="device"
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
