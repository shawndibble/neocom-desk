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

export function MissingSkillsChip({ entries, characterId, fittingName }: MissingSkillsChipProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const missing = useMissingSkillRows(entries, characterId);
  if (!missing) return null;

  const chipLabel = t('fittings.missingSkills.chip', {
    count: missing.missingCount,
    time: formatCountdown(missing.totalSeconds),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="warning">{chipLabel}</Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label={chipLabel}
        className="w-80 max-w-[calc(100vw-2rem)] p-3"
      >
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
