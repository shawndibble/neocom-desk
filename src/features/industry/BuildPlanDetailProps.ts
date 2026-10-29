import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import type { GroupClaimMember } from '@/engine/industry/groupStockClaims';
import type { BuildPlanRecord } from '@/db';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { PiData } from '@/sde/types';
import type { BlueprintCatalog } from './blueprintCatalog';
import type { BuildGroupSnapshot } from './buildGroups';
import type { BuildPlanPricingInputs } from './buildPlanPricingInputs';
import type { BuildPlanChange } from './buildPlanStore';
import type { CorpOwnedStockState } from './corpOwnedStock';
import type { JobProductionSeed } from './logProductionFromJob';
import type { OwnedStockSnapshot } from './ownedStockDetection';
import type { PlanGroup } from './usePlanOwnedStock';

export interface BuildPlanDetailProps {
  plan: BuildPlanRecord;
  catalog: BlueprintCatalog;
  /** Planetary schematics, for materials no blueprint makes. Null while pi.json loads, or if it failed. */
  pi: PiData | null;
  ownedBlueprints: readonly CharacterBlueprint[];
  modifiers: CharacterModifiers;
  /**
   * Whole-account asset snapshot for owned-stock detection (issue #181),
   * loaded once by `useOwnedStockSnapshot` above this component's own
   * `key={plan.id}` remount boundary in `Industry.tsx` — switching plans
   * must not redo that load, only the (cheap) per-plan aggregation below.
   */
  ownedStockSnapshot: OwnedStockSnapshot;
  /**
   * The active Character's corporation as a second owned-stock source
   * (issue #798's Corp Assets toggle), loaded once by
   * `useCorpOwnedStockSource` above the same remount boundary as
   * `ownedStockSnapshot` — it re-resolves on Character switch on its own,
   * independent of which plan is open.
   */
  corpOwnedStock: CorpOwnedStockState;
  /**
   * Everything else this plan is priced against (`buildPlanPricingInputs.ts`):
   * the assumed-ME and include-blueprint-cost settings, standings, the corp's
   * blueprints (folded into `ownedBlueprints` exactly when
   * `plan.includeCorpAssets` is on, issue #839) and BPC Sourcing offers.
   * Loaded once by `useIndustryWorkspace`, above this component's
   * `key={plan.id}` remount boundary, so switching plans never reloads it.
   */
  pricingInputs: BuildPlanPricingInputs;
  /**
   * Every write this panel makes to its plan, as one `BuildPlanChange` — a
   * pilot edit, a derived fix, or sourcing edits. The caller hands it to
   * `buildPlanStore.applyBuildPlanChange`, which owns the merge, `updatedAt`
   * and sync rules for each kind.
   */
  onChange: (change: BuildPlanChange) => void;
  /** This plan's group's last Retarget (issue #632), or null when ungrouped or not yet Retargeted. */
  groupSnapshot: BuildGroupSnapshot | null;
  /** This plan's Build Group (name, id, owned-stock ledger) for the owned-total-differs hint, or null when ungrouped. */
  group?: PlanGroup | null;
  /**
   * Every plan in `group`, this one included (issue #3992): their Haves are
   * claims this plan's "Use assets" offer leaves out. Empty when ungrouped.
   */
  groupMembers?: readonly GroupClaimMember[];
  /**
   * The picker/override modal's "search BPC Sourcing" action (issue #839) —
   * navigates to `bpcSourcingHref(<typeID>)`. A prop rather
   * than an inline `useNavigate` here, since this component stays
   * route-agnostic; `IndustryPlanPage.tsx` supplies it.
   */
  onSearchBpcSourcing: (blueprintTypeID: number) => void;
  /**
   * A completed job's runs/cost, carried from Active Jobs' "Log
   * production…" row action (issue #1787) via `IndustryPlanPage`'s
   * navigation state — this is the one plan the pilot (or the dialog that
   * resolved it) already picked as the job's target. Opens Log Production
   * prefilled with the job's own numbers instead of the plan's live
   * estimate. Absent for every other way this page is reached.
   */
  pendingLogProduction?: JobProductionSeed | null;
  /**
   * Identifies *which* navigation `pendingLogProduction` arrived with
   * (`location.key`) — every `navigate()` call gets a fresh one, even to
   * this same route, which is what lets a job whose matching plan is the
   * one already open still open Log Production on a second click instead of
   * being a no-op (issue #1787 review). Required whenever
   * `pendingLogProduction` is set.
   */
  pendingLogProductionKey?: string;
}
