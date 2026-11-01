/**
 * Edits one Character's accelerator (GLOSSARY.md **Accelerator**) through the
 * shared `AcceleratorFields`: every change is saved as it is made, and Clear
 * forgets it so detection from the attribute sheet applies again. The
 * Characters table's popover hosts it; the Skill Plan edits the same record
 * through its Booster list.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import type { CharacterAcceleratorRecord } from '@/db';
import { DEFAULT_PLAN_BOOSTER } from '@/features/skills/planner/planBooster';
import { AcceleratorFields } from './AcceleratorFields';
import { clearCharacterAccelerator, setCharacterAccelerator } from './characterAccelerators';

interface CharacterAcceleratorEditorProps {
  characterId: number;
  /** The running accelerator the pilot typed in, if any (already checked against the clock). */
  record: CharacterAcceleratorRecord | undefined;
  /** What the attribute sheet implies, to prefill the bonus. */
  detectedBonus: number | null;
}

export function CharacterAcceleratorEditor({
  characterId,
  record,
  detectedBonus,
}: CharacterAcceleratorEditorProps) {
  const { t } = useTranslation();
  // Only the bonus can be typed before there is an expiry to save it with.
  const [draftBonus, setDraftBonus] = useState(
    record?.bonus ?? detectedBonus ?? DEFAULT_PLAN_BOOSTER.bonus
  );
  const bonus = record?.bonus ?? draftBonus;

  return (
    <div className="space-y-3">
      <AcceleratorFields
        bonus={bonus}
        expiresAt={record?.expiresAt ?? null}
        startsAt={null}
        onBonusChange={(next) => {
          setDraftBonus(next);
          if (record) void setCharacterAccelerator(characterId, next, record.expiresAt);
        }}
        onExpiresChange={(expiresAt) => {
          if (expiresAt === null) void clearCharacterAccelerator(characterId);
          else void setCharacterAccelerator(characterId, bonus, expiresAt);
          return true;
        }}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-text-dim">{t('accelerator.autoDetectHint')}</p>
        <Button
          size="sm"
          variant="ghost"
          disabled={!record}
          onClick={() => void clearCharacterAccelerator(characterId)}
        >
          {t('accelerator.clear')}
        </Button>
      </div>
    </div>
  );
}
