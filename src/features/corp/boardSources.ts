/**
 * The boundary between ESI's corp shapes and the board engine's own.
 *
 * `engine/corp/board.ts` ranks clocks; it does not know what an ESI structure
 * looks like, parse a date, or resolve a name. This module does all three, so
 * the engine stays pure numbers-in/objects-out and CCP renaming a field touches
 * one file. Same split `features/pi/adapters.ts` makes for colonies.
 *
 * Pure itself — no fetch, no Dexie. The loaders are `boardData.ts`.
 */
import type {
  CorporationIndustryJob,
  CorporationMiningExtraction,
  CorporationStructure,
  WalletJournalEntry,
} from '@/esi/endpoints';
import type {
  BoardExtractionSource,
  BoardJobSource,
  BoardStructureSource,
} from '@/engine/corp/board';
import type { VitalsJournalEntry } from '@/engine/corp/vitals';

/**
 * `Date.parse` of an absent or unparseable ESI timestamp, as `null` rather than
 * `NaN`. A `NaN` deadline would sort unpredictably and compare false against
 * every threshold, so it must not reach the engine at all.
 */
function parseInstant(iso: string | undefined): number | null {
  if (iso === undefined) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * A structure's display name.
 *
 * AC4: the name comes from the endpoint's own `name` field — corp structures
 * carry it, so there is no resolution dance here (bulk name resolution is only
 * needed for character ids). A structure ESI declines to name falls back to its
 * id, which is at least something a manager can search the client for.
 */
export function structureName(structure: Pick<CorporationStructure, 'name' | 'structure_id'>) {
  return structure.name ?? `#${structure.structure_id}`;
}

/**
 * ESI's own spelling of a structure state, unwrapped: `armor_reinforce` ->
 * `armor reinforce`.
 *
 * Not routed through i18next, and deliberately so — the same call
 * `corpRoleLabel` makes for role strings. This is CCP's enum, extended without
 * notice, and a lookup table would render tomorrow's state as a blank or a raw
 * key in front of the one manager whose Fortizar is in it. Unwrapping the
 * enum's own spelling always says something true.
 */
export function structureStateLabel(state: string): string {
  return state.replace(/_/g, ' ');
}

export function toBoardStructures(
  structures: readonly CorporationStructure[]
): BoardStructureSource[] {
  return structures.map((structure) => ({
    structureId: structure.structure_id,
    name: structureName(structure),
    // Absent means the structure has already run dry — ESI drops the field
    // rather than dating it — and the engine reads `null` exactly that way.
    fuelExpiresMs: parseInstant(structure.fuel_expires),
    state: structure.state ?? null,
    stateTimerEndMs: parseInstant(structure.state_timer_end),
    unanchorsAtMs: parseInstant(structure.unanchors_at),
    services: (structure.services ?? []).map((service) => ({
      name: service.name,
      state: service.state,
    })),
  }));
}

/**
 * Moon extractions, named by the refinery they are drilling from.
 *
 * The extraction endpoint gives a `structure_id` and a `moon_id` and no names
 * at all, so the refinery's name is borrowed from the structure list the board
 * has already read. A Character who can read extractions can read structures —
 * both answer to `Station_Manager` — but the structure list can still be
 * missing (offline, or a drill on a structure that has since been unanchored),
 * and the moon id is the honest fallback rather than a blank row.
 *
 * An extraction whose timestamps do not parse is dropped: an entry with no
 * clock is not something this board can rank, and inventing one would be worse
 * than omitting it.
 */
export function toBoardExtractions(
  extractions: readonly CorporationMiningExtraction[],
  structureNames: ReadonlyMap<number, string>
): BoardExtractionSource[] {
  const sources: BoardExtractionSource[] = [];
  for (const extraction of extractions) {
    const chunkArrivalMs = parseInstant(extraction.chunk_arrival_time);
    const naturalDecayMs = parseInstant(extraction.natural_decay_time);
    if (chunkArrivalMs === null || naturalDecayMs === null) continue;
    sources.push({
      structureId: extraction.structure_id,
      subject: structureNames.get(extraction.structure_id) ?? `Moon ${extraction.moon_id}`,
      chunkArrivalMs,
      naturalDecayMs,
    });
  }
  return sources;
}

/**
 * Corp industry jobs, named by what they make.
 *
 * `productNames` comes from the shared type-name lookup; a job whose product
 * type has not resolved (or an activity with no product, such as research)
 * falls back to its blueprint's name and then to the job id. The engine filters
 * on `status` — that is a ranking decision, not a shape one — so every job is
 * handed over.
 */
export function toBoardJobs(
  jobs: readonly CorporationIndustryJob[],
  typeNames: ReadonlyMap<number, string>
): BoardJobSource[] {
  const sources: BoardJobSource[] = [];
  for (const job of jobs) {
    const endMs = parseInstant(job.end_date);
    if (endMs === null) continue;
    // The same fallback the name uses: the product when there is one, else
    // the blueprint — a job's context menu (issue #419) hangs "Check Market"
    // off whichever type actually got named.
    const typeId = job.product_type_id ?? job.blueprint_type_id;
    const productName =
      (job.product_type_id === undefined ? undefined : typeNames.get(job.product_type_id)) ??
      typeNames.get(job.blueprint_type_id);
    sources.push({
      jobId: job.job_id,
      subject: productName ?? `#${job.job_id}`,
      endMs,
      status: job.status,
      typeId,
    });
  }
  return sources;
}

/** Type ids the board needs names for, deduplicated. */
export function jobTypeIds(jobs: readonly CorporationIndustryJob[]): number[] {
  const ids = new Set<number>();
  for (const job of jobs) {
    if (job.product_type_id !== undefined) ids.add(job.product_type_id);
    ids.add(job.blueprint_type_id);
  }
  return [...ids];
}

/** The wallet journal, reduced to the two fields the vitals rail's rates need. */
export function toVitalsJournal(entries: readonly WalletJournalEntry[]): VitalsJournalEntry[] {
  const reduced: VitalsJournalEntry[] = [];
  for (const entry of entries) {
    const atMs = parseInstant(entry.date);
    // `amount` is optional on the ESI schema (a journal line can be purely
    // informational). A line with no amount moves no ISK, so it contributes
    // nothing to a net or a burn rate.
    if (atMs === null || entry.amount === undefined) continue;
    reduced.push({ atMs, amount: entry.amount });
  }
  return reduced;
}

// The wallet-division join — balances from `/wallets`, names from `/divisions`
// — is `divisions.ts`'s `walletDivisions` (#298). The board reads it as it is
// rather than growing a second one here.
