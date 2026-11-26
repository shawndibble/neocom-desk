import type { ReactNode } from 'react';
import type { SkillPlanRecord } from '@/db';
import type { AttributeBaseline } from '@/engine/attributeBaseline';
import type { Attributes, Implants, TrainedSkill } from '@/engine/types';
import type { CharacterAttributes, SkillQueueEntry } from '@/esi/endpoints';
import type { CachedResult } from '../../data';
import type { SkillCatalog } from '../../skillMap';
import type { RemapAvailability } from '../remapAvailability';
import type { SkillPlanEditable } from '../skillPlanEdit';

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

export interface TrainedRemoved {
  count: number;
  undo: Required<SkillPlanEditable>;
}

export interface PlanEditorProps {
  characterId: number;
  plan: SkillPlanRecord;
  catalog: SkillCatalog;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  trainedSkillsKnown: boolean;
  attributes: Attributes;
  implants: Implants;
  attributesResult: CachedResult<CharacterAttributes> | null;
  attributeBaseline?: AttributeBaseline | null;
  remapInfo: RemapAvailability | null;
  queueEntries?: readonly SkillQueueEntry[];
  queueFetchedAt?: Date | null;
  totalSp?: number | null;
  unallocatedSp?: number | null;
  listPane: ReactNode;
  headerActionsContainer?: HTMLElement | null;
  onUpdate: (patch: PlanPatch) => void | Promise<void>;
}
