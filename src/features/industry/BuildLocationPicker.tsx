import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, NativeSelect, Spinner } from '@/components/ui';
import { useCorpOwner } from '@/features/corp/owner';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useCorpSnapshot } from '@/features/corp/useCorpSnapshot';
import { loadBuildStructureOptions } from './loadBuildStructures';
import { FACILITY_PRESETS } from '@/engine/industry/types';
import type { BuildStructureOption } from './buildStructures';

interface BuildLocationPickerProps {
  onPick: (option: BuildStructureOption) => void;
}

/**
 * Fills the location fields from a structure the corporation owns.
 *
 * Facility and build system are two ways of saying "this structure", and a
 * pilot who has one in mind should not have to translate it into two fields.
 * Picking one fills both — and the security band follows the system, so that
 * is settled too. The fields stay visible and editable for anyone whose
 * structure is not in the list; this is a shortcut, never the only way in.
 *
 * **Fill-once, by decision.** Nothing records which structure was picked. The
 * summary always reads the plan's own values, so it cannot drift from them,
 * and a later edit to any field is just an edit — not a conflict with a stored
 * link. The picker is a shortcut, not a binding.
 *
 * The corp read is opt-in: `useCorpSnapshot`'s key stays null until the pilot
 * presses the button, because `/corporations/{id}/structures` is role-gated and
 * rate-limited and must not fire on every Build Plan that opens. For a
 * Character with no corp capability the button never renders at all — the hide
 * rule (CONTEXT.md round 35), same as every other corp surface.
 */
export function BuildLocationPicker({ onPick }: BuildLocationPickerProps) {
  const { t } = useTranslation();
  const [asked, setAsked] = useState(false);
  // Which row the select shows, so a pick does not snap the control back to
  // the placeholder. Session-only on purpose: fill-once means the plan stores
  // no structure, so this is a display echo of what was just clicked, cleared
  // whenever the panel remounts on a different plan.
  const [pickedId, setPickedId] = useState('');

  const { available, corporationId } = useCorpOwner('canReadStructures');
  const characterId = useActiveCharacter((state) => state.activeCharacterId);

  const structures = useCorpSnapshot<BuildStructureOption[]>(
    asked && available && corporationId !== null && characterId !== null
      ? `${characterId}:${corporationId}`
      : null,
    async () =>
      characterId === null || corporationId === null
        ? []
        : loadBuildStructureOptions(characterId, corporationId)
  );

  return (
    <div className="flex flex-col gap-1.5 text-xs">
      {available && (
        <div className="flex items-center gap-2">
          {!asked ? (
            <Button size="sm" onClick={() => setAsked(true)}>
              {t('industry.useCorpStructure')}
            </Button>
          ) : structures.loading ? (
            <Spinner size="sm" label={t('industry.corpStructuresLoading')} />
          ) : structures.data && structures.data.length > 0 ? (
            <label className="flex flex-1 flex-col gap-1">
              {t('industry.buildLocation')}
              <NativeSelect
                value={pickedId}
                onChange={(e) => {
                  setPickedId(e.target.value);
                  const picked = structures.data?.find(
                    (option) => String(option.structureId) === e.target.value
                  );
                  if (picked) onPick(picked);
                }}
              >
                <option value="">{t('industry.buildLocationPlaceholder')}</option>
                {structures.data.map((option) => (
                  <option key={option.structureId} value={option.structureId}>
                    {option.name ??
                      t('industry.buildLocationUnnamed', {
                        facility: FACILITY_PRESETS[option.facility].name,
                        system: option.systemName,
                      })}
                  </option>
                ))}
              </NativeSelect>
            </label>
          ) : (
            <span className="text-text-dim">{t('industry.corpStructuresNone')}</span>
          )}
        </div>
      )}
    </div>
  );
}
