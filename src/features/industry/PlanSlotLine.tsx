import { useTranslation } from 'react-i18next';
import {
  JOB_SLOT_CATEGORIES,
  projectJobFinish,
  type JobSlotCategory,
} from '@/engine/industry/jobSlots';
import { formatEveDateTime } from '@/lib/eveTime';
import { useNow } from '@/lib/useNow';
import { openSlots, usePlanJobSlots } from './planJobSlots';

/** "Uses 1 Mfg slot · 6 free · done by <EVE time> if started now" for one plan's own job; renders nothing without slot data. */
export function PlanSlotLine({
  characterId,
  category,
  seconds,
}: {
  characterId: number;
  category: JobSlotCategory;
  seconds: number;
}) {
  const { t } = useTranslation();
  const now = useNow();
  const data = usePlanJobSlots(characterId);
  if (!data) return null;
  const projection = projectJobFinish(data, category, seconds, now);
  return (
    <p className="text-xs tabular-nums text-text-dim">
      {t(projection.open > 0 ? 'industry.planSlotLine' : 'industry.planSlotLineFull', {
        character: data.characterName,
        category: t(`characters.jobSlotCategory.${category}`),
        open: projection.open,
        time: formatEveDateTime(new Date(projection.finishMs)),
      })}
    </p>
  );
}

/** "Needs N jobs · M Mfg + K Rxn slots · 6/1 free" for a group's combined job tree. */
export function GroupSlotLine({
  characterId,
  counts,
}: {
  characterId: number;
  counts: Record<JobSlotCategory, number>;
}) {
  const { t } = useTranslation();
  const now = useNow();
  const data = usePlanJobSlots(characterId);
  if (!data) return null;
  const needed = JOB_SLOT_CATEGORIES.filter((category) => counts[category] > 0);
  if (needed.length === 0) return null;
  return (
    <p className="text-xs tabular-nums text-text-dim">
      {t('industry.groupSlotLine', {
        count: needed.reduce((sum, category) => sum + counts[category], 0),
        character: data.characterName,
        needs: needed
          .map((c) => `${counts[c]} ${t(`characters.jobSlotCategory.${c}`)}`)
          .join(' + '),
        free: needed.map((c) => openSlots(data, c, now) ?? 0).join('/'),
      })}
    </p>
  );
}
