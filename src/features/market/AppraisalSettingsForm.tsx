import { useTranslation } from 'react-i18next';
import { Fields } from '@/components/ui';
import { RefiningSetupFields } from '@/features/refining/RefiningSetupFields';
import { useRefiningSetup } from '@/features/refining/useRefiningSetup';
import { SettingsPanelLoading } from '@/features/settings/settingsFields';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { formatCubicMetres } from '@/lib/volume';
import { CargoPickerBody } from './HaulingCargoControl';
import { totalCargoM3, useHaulingCargo } from './haulingCargo';

/**
 * The Appraisal page's settings modal: the refining setup its Refine total is
 * worked out from, and the hauling ship its hold bar fills. Every control
 * applies as it changes.
 */
export function AppraisalSettingsForm({ characterId }: { characterId: number | null }) {
  const { t } = useTranslation();
  const refining = useRefiningSetup();
  const cargo = useHaulingCargo((state) => state.value);
  const setCargo = useHaulingCargo((state) => state.setValue);
  const cargoHydrated = useHydratedStore(useHaulingCargo);
  if (!refining.hydrated || !cargoHydrated) return <SettingsPanelLoading />;
  return (
    <div className="space-y-4">
      <Fields variant="form">
        <RefiningSetupFields refining={refining} />
      </Fields>
      <section aria-labelledby="appraisal-settings-ship" className="space-y-2">
        <div>
          <h3 id="appraisal-settings-ship" className="text-sm font-medium">
            {t('market.appraisal.settingsShipTitle')}
          </h3>
          <p className="text-xs text-text-dim">
            {cargo === null
              ? t('market.appraisal.settingsShipNone')
              : t('market.appraisal.settingsShipCurrent', {
                  ship: cargo.label,
                  capacity: formatCubicMetres(totalCargoM3(cargo)),
                })}
          </p>
        </div>
        <CargoPickerBody
          characterId={characterId}
          hasCargo={cargo !== null}
          onPick={(next) => void setCargo(next)}
          onClear={() => void setCargo(null)}
        />
      </section>
    </div>
  );
}
