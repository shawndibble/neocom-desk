/**
 * The Skill Plan's Accelerator control (GLOSSARY.md **Accelerator**): the
 * Character's one cerebral accelerator, shared with the Characters table. EVE
 * has a single booster slot, so there is no list to build.
 *
 * - Nothing running and nothing detected: an "Add accelerator" button.
 * - Detected from the attribute sheet: its bonus is shown as a fact and the
 *   pilot sets the time left (EVE does not report it).
 * - Typed in: bonus and time are editable; Clear forgets it.
 *
 * An accelerator that has run out is deleted by the Characters/plan loaders, so
 * the section falls back to the first two states by itself.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { CharacterAcceleratorRecord } from '@/db';
import { CharacterAcceleratorEditor } from '@/features/accelerator/CharacterAcceleratorEditor';
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
  const [adding, setAdding] = useState(false);
  const shown = running !== null || detectedBonus !== null || adding;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-1.5">
        <span>{t('plans.accelerator')}</span>
        <MarketGroupLink
          groupId={CEREBRAL_ACCELERATORS_MARKET_GROUP_ID}
          label={t('plans.boosterMarketLink')}
        />
      </div>
      {shown ? (
        <>
          {running === null && detectedBonus !== null && (
            <p className="text-[0.6875rem] text-text-dim">
              {t('plans.acceleratorDetected', { bonus: detectedBonus })}
            </p>
          )}
          <CharacterAcceleratorEditor
            characterId={characterId}
            record={running ?? undefined}
            detectedBonus={detectedBonus}
          />
          {running === null && <p className="text-warning">{t('plans.acceleratorNoExpiry')}</p>}
        </>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
          <Icon.AddRow size={Icon.ICON_SIZE.sm} />
          {t('plans.boosterAdd')}
        </Button>
      )}
    </div>
  );
}
