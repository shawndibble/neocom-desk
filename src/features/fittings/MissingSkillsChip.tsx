import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import type { PlanEntry } from '@/engine/types';
import { formatCountdown } from '@/lib/duration';
import { MissingSkillsList } from './MissingSkillsList';
import { useMissingSkillRows } from './useMissingSkillRows';

interface MissingSkillsChipProps {
  entries: readonly PlanEntry[];
  characterId: number;
  fittingName: string;
}

/**
 * "Missing N skills · <time>" — time at the Character's current attributes
 * and implants, the same schedule a Skill Plan uses. Tapping lists the
 * skills and adds them to a Skill Plan through Fit Check's plan picker.
 */
export function MissingSkillsChip({ entries, characterId, fittingName }: MissingSkillsChipProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const missing = useMissingSkillRows(entries, characterId);
  if (!missing) return null;

  return (
    // A popover rather than an inline panel: the chip sits in the Fitting's
    // one-row header, which an inline list would push apart.
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="warning">
          {t('fittings.missingSkills.chip', {
            count: missing.rows.length,
            time: formatCountdown(missing.totalSeconds),
          })}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-3">
        <MissingSkillsList
          entries={entries}
          characterId={characterId}
          fittingName={fittingName}
          missing={missing}
        />
      </PopoverContent>
    </Popover>
  );
}
