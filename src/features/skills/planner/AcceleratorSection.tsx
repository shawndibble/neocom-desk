/**
 * The Skill Plan's Accelerator control (GLOSSARY.md **Accelerator**): the
 * Character's one cerebral accelerator, shared with the Characters table. EVE
 * has a single booster slot, so there is no list to build.
 *
 * - Nothing running and nothing detected: an "Add accelerator" button.
 * - Detected from the attribute sheet: its bonus is shown once, beside the
 *   heading, and the pilot sets the time left (EVE does not report it).
 * - Typed in: bonus and time are editable; Clear forgets it.
 *
 * An accelerator that has run out is deleted when this section mounts
 * (`useCharacterAccelerators` purges), so it falls back to the first two states
 * by itself: a new one is typed in, or the next sync's detection applies.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { CharacterAcceleratorRecord } from '@/db';
import { CharacterAcceleratorEditor } from '@/features/accelerator/CharacterAcceleratorEditor';
import { useCharacterAccelerators } from '@/features/accelerator/useAccelerators';
import { MarketGroupLink } from './MarketGroupLink';
import { CEREBRAL_ACCELERATORS_MARKET_GROUP_ID } from './plannerMarketGroups';

export function AcceleratorSection({
  characterId,
  running,
  detectedBonus,
}: {
  characterId: number;
  /** The typed-in accelerator, only while it is still running. */
  running: CharacterAcceleratorRecord | null;
  detectedBonus: number | null;
}) {
  const { t } = useTranslation();
  useCharacterAccelerators();
  const [adding, setAdding] = useState(false);
  const shown = running !== null || detectedBonus !== null || adding;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-1.5">
        <span>
          {t('plans.accelerator')}
          {running === null && detectedBonus !== null && (
            <span className="ml-2 font-semibold">
              {t('plans.acceleratorDetected', { bonus: detectedBonus })}
            </span>
          )}
        </span>
        <MarketGroupLink
          groupId={CEREBRAL_ACCELERATORS_MARKET_GROUP_ID}
          label={t('plans.boosterMarketLink')}
        />
      </div>
      {shown ? (
        <CharacterAcceleratorEditor
          characterId={characterId}
          record={running ?? undefined}
          detectedBonus={detectedBonus}
        />
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
          <Icon.AddRow size={Icon.ICON_SIZE.sm} />
          {t('plans.boosterAdd')}
        </Button>
      )}
    </div>
  );
}
