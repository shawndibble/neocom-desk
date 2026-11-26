import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CharacterAcceleratorRecord } from '@/db';
import { DEFAULT_ACCELERATOR_BONUS } from '@/features/skills/planner/planBooster';
import { AcceleratorFields } from './AcceleratorFields';
import { clearCharacterAccelerator, setCharacterAccelerator } from './characterAccelerators';

interface CharacterAcceleratorEditorProps {
  characterId: number;
  record: CharacterAcceleratorRecord | undefined;
  detectedBonus: number | null;
  editTimeOnOpen?: boolean;
}

export function CharacterAcceleratorEditor({
  characterId,
  record,
  detectedBonus,
  editTimeOnOpen,
}: CharacterAcceleratorEditorProps) {
  const { t } = useTranslation();
  const [draftBonus, setDraftBonus] = useState(
    record?.bonus ?? detectedBonus ?? DEFAULT_ACCELERATOR_BONUS
  );
  const bonus = record?.bonus ?? detectedBonus ?? draftBonus;

  return (
    <AcceleratorFields
      bonus={bonus}
      expiresAt={record?.expiresAt ?? null}
      editTimeOnOpen={editTimeOnOpen}
      bonusLocked={!record && detectedBonus !== null}
      onBonusChange={(next) => {
        if (next < 1) return;
        setDraftBonus(next);
        if (record) void setCharacterAccelerator(characterId, next, record.expiresAt);
      }}
      onExpiresChange={(expiresAt) => {
        if (expiresAt === null) {
          void clearCharacterAccelerator(characterId);
          return true;
        }
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
