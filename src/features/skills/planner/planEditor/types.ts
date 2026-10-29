import type { ReactNode } from 'react';
import type { SkillPlanRecord } from '@/db';
import type { AttributeBaseline } from '@/engine/attributeBaseline';
import type { Attributes, Implants, TrainedSkill } from '@/engine/types';
import type { CharacterAttributes, SkillQueueEntry } from '@/esi/endpoints';
import type { CachedResult } from '../../data';
import type { SkillCatalog } from '../../skillMap';
import type { RemapAvailability } from '../remapAvailability';
import type { SkillPlanEditable } from '../skillPlanEdit';

/** The persisted fields the editor may change. */
export type PlanPatch = Partial<
  Pick<
    SkillPlanRecord,
    | 'name'
    | 'entries'
    | 'markers'
    | 'markerAttributes'
    | 'whatIfImplants'
    | 'boosters'
    | 'milestones'
  >
>;

/** What "Remove trained skills" just did: how many rows went, and the plan as it stood for Undo. */
export interface TrainedRemoved {
  count: number;
  undo: Required<SkillPlanEditable>;
}

export interface PlanEditorProps {
  characterId: number;
  plan: SkillPlanRecord;
  catalog: SkillCatalog;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  /** See `PlanEditorData` — false until /skills has actually been read. */
  trainedSkillsKnown: boolean;
  attributes: Attributes;
  implants: Implants;
  /**
   * ESI's own attributes read, carrying its `fetchedAt` — what the tools
   * pane *displays*. Deliberately not derived from `attributes` above: that
   * one is the scheduler's base sheet, which falls back to placeholder
   * numbers when ESI could not be read and is clamped to the base minimum,
   * so showing it would present a fallback as the character's own sheet.
   */
  attributesResult: CachedResult<CharacterAttributes> | null;
  /**
   * How the base sheet above was arrived at (`engine/attributeBaseline.ts`).
   * Optional: omitting it is the `legal` case, which is a no-op — a character
   * with no accelerator running must see no notice and no prefill.
   */
  attributeBaseline?: AttributeBaseline | null;
  /** Remaps Available from ESI (bonus + yearly), for the hint next to the count input. */
  remapInfo: RemapAvailability | null;
  /** The live in-game queue: the plan's schedule starts where it ends. */
  queueEntries?: readonly SkillQueueEntry[];
  queueFetchedAt?: Date | null;
  /** Queue-corrected total SP (`usePlanEditorData`), for the Skill injectors panel; null until /skills has loaded. */
  totalSp?: number | null;
  /** ESI's `unallocated_sp`, for the Skill injectors panel. */
  unallocatedSp?: number | null;
  /**
   * The plan list, rendered at the top of the sidebar this component lays
   * out. Passed in rather than imported so the route keeps owning plan CRUD
   * and this component keeps owning the two-column grid — the tools pane in
   * that sidebar needs every handler that already lives here, and lifting
   * them out to let the route compose the columns would mean a dozen
   * callbacks crossing the boundary for no gain.
   */
  listPane: ReactNode;
  /**
   * The route's `PageHeader` actions slot, handed down as a live DOM node so
   * Import/Export can render there via a portal instead of in this
   * component's own tree — the route owns the page's one `<h1>` and its
   * "far top right corner" actions cluster (every other route's pattern),
   * but the import/export handlers and the data they act on (the computed
   * queue, catalog, What-If/Booster-costed `scheduled`) live here and would
   * duplicate awkwardly if lifted to the route instead. `null`/undefined
   * (route hasn't mounted the slot yet, or a caller with no such slot, e.g.
   * a future embed) means nothing portals — Import/Export simply don't
   * render rather than throwing.
   */
  headerActionsContainer?: HTMLElement | null;
  onUpdate: (patch: PlanPatch) => void | Promise<void>;
}
