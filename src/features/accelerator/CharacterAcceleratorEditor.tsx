/**
 * Edits one Character's accelerator (GLOSSARY.md **Accelerator**) through the
 * shared `AcceleratorFields`: every change is saved as it is made, and blanking
 * the time left forgets it so detection from the attribute sheet applies again. The
 * Characters table's popover and the Skill Plan's Assumptions both host it, so
 * they edit the same record.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CharacterAcceleratorRecord } from '@/db';
import { DEFAULT_ACCELERATOR_BONUS } from '@/features/skills/planner/planBooster';
import { AcceleratorFields } from './AcceleratorFields';
import { clearCharacterAccelerator, setCharacterAccelerator } from './characterAccelerators';

interface CharacterAcceleratorEditorProps {
  characterId: number;
  /** The running accelerator the pilot typed in, if any (already checked against the clock). */
  record: CharacterAcceleratorRecord | undefined;
  /** What the attribute sheet implies, to prefill the bonus. */
  detectedBonus: number | null;
  /** Open with the time's boxes showing (the Characters table's pencil popover). */
  editTimeOnOpen?: boolean;
}

export function CharacterAcceleratorEditor({
  characterId,
  record,
  detectedBonus,
  editTimeOnOpen,
}: CharacterAcceleratorEditorProps) {
  const { t } = useTranslation();
  // Only the bonus can be typed before there is an expiry to save it with.
  const [draftBonus, setDraftBonus] = useState(
    record?.bonus ?? detectedBonus ?? DEFAULT_ACCELERATOR_BONUS
  );
  // A bonus read off the attribute sheet is a fact, not an input: only the
  // time left is missing. Once a typed-in record exists the pilot may correct it.
  const bonus = record?.bonus ?? detectedBonus ?? draftBonus;

  return (
    <AcceleratorFields
      bonus={bonus}
      expiresAt={record?.expiresAt ?? null}
      editTimeOnOpen={editTimeOnOpen}
      bonusLocked={!record && detectedBonus !== null}
      onBonusChange={(next) => {
        // An emptied box reads as 0: not a bonus anyone means to save.
        if (next < 1) return;
        setDraftBonus(next);
        if (record) void setCharacterAccelerator(characterId, next, record.expiresAt);
      }}
      onExpiresChange={(expiresAt) => {
        if (expiresAt === null) {
          void clearCharacterAccelerator(characterId);
          return true;
        }
        // A past expiry would end a live record and purge it: never saved.
        if (expiresAt <= Date.now()) return false;
        void setCharacterAccelerator(characterId, bonus, expiresAt);
        return true;
      }}
      hint={
        record ? null : (
          <p className="text-[0.6875rem] text-text-dim">{t('plans.acceleratorNoExpiry')}</p>
        )
      }
    />
  );
}
