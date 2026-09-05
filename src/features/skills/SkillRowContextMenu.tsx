import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  Tooltip,
} from '@/components/ui';
import { db, type SkillPlanRecord } from '@/db';
import { isSyncConfigured } from '@/app/syncStatus';
import { scheduleSync } from '@/sync';
import { upsertEntry } from './planner/reorder';

export interface SkillRowContextMenuProps {
  activeCharacterId: number;
  skillTypeID: number;
  /** The character's current trained level (0-5) for this skill. */
  currentLevel: number;
  /**
   * The row's own hover/focus tooltip content (its skill description), if
   * any. Applied here rather than by the caller wrapping this component:
   * `Tooltip` must be the outermost layer with `ContextMenuTrigger` directly
   * around the real button (same Slot-composition constraint as
   * `ImplantChip` — `Tooltip` isn't itself a Slot, so a `ContextMenuTrigger
   * asChild` wrapping it would drop its context-menu props instead of
   * reaching the button).
   */
  tooltipContent?: string | null;
  children: ReactElement;
}

/**
 * Module-level, not a closure inside the component: `Date.now()` inside a
 * function still lexically nested in a component body trips
 * `react-hooks/purity`'s render-purity check even when the function is only
 * ever invoked from an event handler, never during render (same reason
 * `PlanListPane.tsx`'s `newPlan()` sits at module scope rather than inside
 * that component).
 */
async function addSkillToPlan(
  plan: SkillPlanRecord,
  skillTypeID: number,
  targetLevel: number,
  characterId: number
): Promise<void> {
  await db.skillPlans.update(plan.id, {
    entries: upsertEntry(plan.entries, { skillTypeID, targetLevel }),
    updatedAt: Date.now(),
  });
  if (isSyncConfigured()) scheduleSync(characterId);
}

/**
 * Right-click "Add to Skill Plan" for a Skills-page row (#405). Targets an
 * existing plan by name via a submenu rather than a single "the current
 * plan" — Skill Plans has no notion of an active/current plan (each is only
 * ever open one at a time via its own route,
 * `src/features/skills/planner/PlanListPane.tsx`), so naming the plan is the
 * only choice that invents no new state.
 */
export function SkillRowContextMenu({
  activeCharacterId,
  skillTypeID,
  currentLevel,
  tooltipContent,
  children,
}: SkillRowContextMenuProps) {
  const { t } = useTranslation();
  const plans = useLiveQuery(
    () => db.skillPlans.where('characterId').equals(activeCharacterId).toArray(),
    [activeCharacterId]
  );
  const maxed = currentLevel >= 5;
  const targetLevel = Math.min(currentLevel + 1, 5);

  const withMenu = <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>;
  const trigger = tooltipContent ? (
    <Tooltip content={tooltipContent} className="w-full">
      {withMenu}
    </Tooltip>
  ) : (
    withMenu
  );

  return (
    <ContextMenu>
      {trigger}
      <ContextMenuContent>
        <ContextMenuSub>
          <ContextMenuSubTrigger
            disabled={maxed}
            title={maxed ? t('skills.contextMenu.maxLevelTitle') : undefined}
          >
            {t('skills.contextMenu.addToSkillPlan')}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {plans && plans.length > 0 ? (
              plans.map((plan) => (
                <ContextMenuItem
                  key={plan.id}
                  onSelect={() =>
                    void addSkillToPlan(plan, skillTypeID, targetLevel, activeCharacterId)
                  }
                >
                  {plan.name}
                </ContextMenuItem>
              ))
            ) : (
              <ContextMenuItem disabled>{t('skills.contextMenu.noPlans')}</ContextMenuItem>
            )}
          </ContextMenuSubContent>
        </ContextMenuSub>
      </ContextMenuContent>
    </ContextMenu>
  );
}
