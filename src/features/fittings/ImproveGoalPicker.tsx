/**
 * The Improve Goal chips (a goal the fit cannot score is a disabled chip with
 * its reason, under "More goals"), and the one setting a goal brings with it:
 * Mine more's ore, Carry more's hold.
 */
import { useTranslation } from 'react-i18next';
import {
  FilterChip,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { Collapse } from '@/components/ui/Collapse';
import { CRYSTAL_FAMILY_ORES } from '@/engine/fittings/crystalChoice';
import {
  effectiveHold,
  goalAvailability,
  IMPROVE_HOLDS,
  type ImproveGoal,
  type ImproveHold,
} from '@/engine/fittings/improve';
import { splitGoals } from '@/engine/fittings/improveGoalSplit';
import { hullRoleOf } from '@/engine/fittings/improveRole';
import { m3Format } from './improveLineText';
import type { ImproveSettings } from './improveSettings';
import type { ImproveSearch } from './useImprove';

interface Props {
  goal: ImproveGoal;
  onPick: (goal: ImproveGoal) => void;
  before: ImproveSearch['before'];
  hull: ImproveSearch['hull'];
  settings: ImproveSettings;
  /** Whether "More goals" is open, the id of what it opens and how to flip it. */
  goalsOpen: boolean;
  goalsId: string;
  onToggleGoals: () => void;
}

export function ImproveGoalPicker({
  goal,
  onPick,
  before,
  hull,
  settings,
  goalsOpen,
  goalsId,
  onToggleGoals,
}: Props) {
  const { t } = useTranslation();
  const availabilityOf = (id: ImproveGoal) =>
    before ? goalAvailability(id, before, hull) : { available: true as const };
  const unavailableReason = (id: ImproveGoal): string | undefined => {
    const availability = availabilityOf(id);
    return 'reason' in availability
      ? t(`fittings.improve.unavailable.${availability.reason}`)
      : undefined;
  };
  const { relevant: relevantGoals, other: otherGoals } = splitGoals(
    goal,
    hullRoleOf(hull),
    (id) => availabilityOf(id).available
  );

  return (
    <div className="space-y-2">
      <div
        role="group"
        aria-label={t('fittings.improve.goalLabel')}
        className="flex flex-wrap gap-2"
      >
        {relevantGoals.map((id) => (
          <FilterChip
            key={id}
            label={t(`fittings.improve.goal.${id}`)}
            selected={goal === id}
            onToggle={() => onPick(id)}
          />
        ))}
        {otherGoals.length > 0 && (
          <FilterChip
            label={t('fittings.improve.more')}
            selected={goalsOpen}
            expanded={goalsOpen}
            controls={goalsId}
            onToggle={onToggleGoals}
            count={otherGoals.length}
            countLabel={t('fittings.improve.moreCount', { count: otherGoals.length })}
          />
        )}
      </div>
      {otherGoals.length > 0 && (
        <Collapse open={goalsOpen} id={goalsId} className="pt-1">
          <ul>
            {otherGoals.map((id) => {
              const reason = unavailableReason(id);
              return (
                <li
                  key={id}
                  className="flex flex-col items-start gap-1 py-1 sm:flex-row sm:items-center sm:gap-3"
                >
                  <span className="sm:w-52 sm:shrink-0">
                    <FilterChip
                      label={t(`fittings.improve.goal.${id}`)}
                      selected={goal === id}
                      disabled={reason !== undefined}
                      onToggle={() => onPick(id)}
                    />
                  </span>
                  {reason && <span className="text-warning text-xs">{reason}</span>}
                </li>
              );
            })}
          </ul>
        </Collapse>
      )}
      {goal === 'mining' && (
        <div className="space-y-1 text-sm">
          <span aria-hidden="true">{t('fittings.improve.oreLabel')}</span>
          <Select value={settings.oreFamily} onValueChange={settings.onOreFamilyChange}>
            <SelectTrigger aria-label={t('fittings.improve.oreLabel')} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CRYSTAL_FAMILY_ORES).map(([family, ores]) => (
                <SelectItem key={family} value={family}>
                  {t('fittings.improve.oreOption', { ores: ores.join(', '), family })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-text-dim text-xs">{t('fittings.improve.oreHint')}</p>
        </div>
      )}
      {goal === 'haul' && before && (
        <div className="space-y-1 text-sm">
          <span aria-hidden="true">{t('fittings.improve.holdLabel')}</span>
          <Select
            value={effectiveHold(before.holds, settings.hold)}
            onValueChange={(value) => settings.onHoldChange(value as ImproveHold)}
          >
            <SelectTrigger aria-label={t('fittings.improve.holdLabel')} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {IMPROVE_HOLDS.filter((hold) => before.holds[hold] > 0).map((hold) => (
                <SelectItem key={hold} value={hold}>
                  {t('fittings.improve.holdOption', {
                    hold: t(`fittings.improve.hold.${hold}`),
                    size: m3Format(before.holds[hold]),
                  })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-text-dim text-xs">{t('fittings.improve.holdHint')}</p>
        </div>
      )}
    </div>
  );
}
