import { sortShortestFirst, suggestReorder } from '@/engine/optimizer';
import type { Attributes, CloneState, EngineSkill, Implants, PlanStep } from '@/engine/types';
import type { SkillPlanRecord } from '@/db';
import { useAutoDismiss } from '@/lib/useAutoDismiss';
import { schedulePlanWith } from './planSchedule';
import { applyReorderSuggestion } from './reorder';
import type { PricingContext } from './optimizeHelpers';
import { applyReorder, type SkillPlanEditable } from './skillPlanEdit';
import { useScopedState } from './useScopedState';
import { useState } from 'react';

interface UseReorderArgs {
  /** The preview reads as null once this scope moves on (plan swapped or edited). */
  planScope: readonly unknown[];
  engineSkills: ReadonlyMap<number, EngineSkill>;
  editable: SkillPlanEditable;
  scheduled: readonly PlanStep[];
  priorityMap: ReturnType<typeof schedulePlanWith>['priorityMap'];
  milestones: SkillPlanRecord['milestones'];
  attributes: Attributes;
  /** The implants in force under the What-If lens. */
  implants: Implants;
  cloneState: CloneState;
  onUpdate: (patch: Partial<SkillPlanRecord>) => void | Promise<void>;
  /** Costs the suggested order, so the preview can show before/after totals. */
  pricing: PricingContext;
  loadedAtMs: number;
}

/** A suggested order and what it costs: the plan's own markers stay, only the entries move. */
export interface ReorderPreview {
  kind: 'attributes' | 'shortest';
  steps: PlanStep[];
  /** The suggested order as the schedule re-expands it, the "Optimized" side of the compare. */
  order: PlanStep[];
  totalSeconds: number;
}

/** "Reorder only" and "Shortest first": a suggested order, previewed in a Modal, Accept/Reject. */
export function useReorder({
  planScope,
  engineSkills,
  editable,
  scheduled,
  priorityMap,
  milestones,
  attributes,
  implants,
  cloneState,
  onUpdate,
  pricing,
  loadedAtMs,
}: UseReorderArgs) {
  const [reorderConfirm, setReorderConfirm] = useState<'attributes' | 'shortest' | null>(null);
  const { show: showReorderConfirm } = useAutoDismiss<'attributes' | 'shortest' | null>(
    setReorderConfirm,
    null
  );
  const [reorderPreview, setReorderPreview] = useScopedState<ReorderPreview>(planScope);

  function previewOf(kind: ReorderPreview['kind'], steps: PlanStep[]): ReorderPreview {
    // Override: only the reordered entries; the plan's own markers stay, as Accept leaves them.
    const { scheduled: order, totalSeconds } = schedulePlanWith(
      pricing.schedulablePlan,
      pricing.scheduleInputs,
      loadedAtMs,
      { entries: applyReorderSuggestion(editable.entries, steps) }
    );
    return { kind, steps, order, totalSeconds };
  }

  function handleSuggestReorder() {
    if (scheduled.length === 0) return;
    setReorderPreview(
      previewOf('attributes', suggestReorder(scheduled, engineSkills, priorityMap, milestones))
    );
    showReorderConfirm('attributes');
  }

  /** "Shortest first": same preview/Accept-Reject flow as "Reorder only", fastest-ready-step-first instead of attribute-pair grouping. */
  function handleSortShortest() {
    if (scheduled.length === 0) return;
    setReorderPreview(
      previewOf(
        'shortest',
        sortShortestFirst(
          scheduled,
          engineSkills,
          { attributes, implants, cloneState, milestones },
          priorityMap
        )
      )
    );
    showReorderConfirm('shortest');
  }

  function acceptReorder() {
    if (!reorderPreview) return;
    onUpdate(applyReorder(editable, reorderPreview.steps));
    setReorderPreview(null);
  }

  return {
    reorderConfirm,
    reorderPreview,
    setReorderPreview,
    handleSuggestReorder,
    handleSortShortest,
    acceptReorder,
  };
}
