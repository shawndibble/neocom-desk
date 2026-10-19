import { useTranslation } from 'react-i18next';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { Checkbox, Field, Fields, Panel, Spinner, TextInput } from '@/components/ui';
import { useHydratedStore } from '@/lib/useHydratedStore';
import {
  useSpExtractionMonitoringEnabled,
  useSpExtractionThresholdSp,
} from '@/features/character/spExtractionSettings';
import { SP_EXTRACTION_CHUNK_SP } from '@/engine/skills/spExtraction';
import { useDefaultCharacterFilter } from '@/features/character/defaultCharacterFilter';
import {
  fromStoredCharacterFilterValue,
  toStoredCharacterFilterValue,
} from '@/features/character/characterFilterValue';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { DefaultsSyncHint } from '@/features/settings/settingsFields';

export function CharacterDefaultsPanel() {
  const { t } = useTranslation();
  const defaultCharacterFilter = useDefaultCharacterFilter((state) => state.value);
  const setDefaultCharacterFilter = useDefaultCharacterFilter((state) => state.setValue);
  const spExtractionEnabled = useSpExtractionMonitoringEnabled((state) => state.value);
  const setSpExtractionEnabled = useSpExtractionMonitoringEnabled((state) => state.setValue);
  const spExtractionThreshold = useSpExtractionThresholdSp((state) => state.value);
  const setSpExtractionThreshold = useSpExtractionThresholdSp((state) => state.setValue);

  const defaultCharacterFilterHydrated = useHydratedStore(useDefaultCharacterFilter);
  const spExtractionEnabledHydrated = useHydratedStore(useSpExtractionMonitoringEnabled);
  const spExtractionThresholdHydrated = useHydratedStore(useSpExtractionThresholdSp);
  const ready =
    defaultCharacterFilterHydrated && spExtractionEnabledHydrated && spExtractionThresholdHydrated;

  // Only for the picker's "This character" preview and quick-select — the
  // stored default itself keeps meaning "whichever Character I'm on" even on
  // a device with none active right now (`CharacterFilterControl` already
  // omits that quick-select when this is null).
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);

  if (!ready) {
    return (
      <Panel title={t('settings.characterDefaultsTitle')}>
        <Spinner />
      </Panel>
    );
  }

  return (
    <Panel title={t('settings.characterDefaultsTitle')}>
      <div className="space-y-4">
        <DefaultsSyncHint />
        <Fields variant="form">
          <Field
            label={t('settings.defaultCharacterFilterLabel')}
            note={t('settings.defaultCharacterFilterHint')}
          >
            <CharacterFilterControl
              variant="field"
              triggerLabel={t('settings.defaultCharacterFilterLabel')}
              activeCharacterId={activeCharacterId}
              value={fromStoredCharacterFilterValue(defaultCharacterFilter)}
              onChange={(next) =>
                void setDefaultCharacterFilter(toStoredCharacterFilterValue(next))
              }
            />
          </Field>

          <Field
            label={t('settings.spExtractionEnabledLabel')}
            htmlFor="settings-sp-extraction-enabled"
            inline
            note={t('settings.spExtractionEnabledHint')}
          >
            <label className={touchCheckboxLabelClassName}>
              <Checkbox
                id="settings-sp-extraction-enabled"
                checked={spExtractionEnabled}
                onChange={() => void setSpExtractionEnabled(!spExtractionEnabled)}
              />
            </label>
          </Field>
          {spExtractionEnabled && (
            <Field
              label={t('settings.spExtractionThresholdLabel')}
              htmlFor="settings-sp-extraction-threshold"
              note={t('settings.spExtractionThresholdHint')}
            >
              <TextInput
                id="settings-sp-extraction-threshold"
                type="number"
                min={SP_EXTRACTION_CHUNK_SP}
                step={SP_EXTRACTION_CHUNK_SP}
                value={spExtractionThreshold}
                onChange={(event) => {
                  const parsed = Math.round(Number(event.target.value));
                  if (!Number.isFinite(parsed) || parsed <= 0) return;
                  void setSpExtractionThreshold(parsed);
                }}
                className="w-40"
              />
            </Field>
          )}
        </Fields>
      </div>
    </Panel>
  );
}
