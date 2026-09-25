/**
 * One outcome for every **Load** (CONTEXT.md): EFT text, a DNA string or
 * chat link, an eveship.fit link, a killmail, a Loaded fittings-file entry
 * and an In-game Fitting all end as either a Fitting plus what it couldn't
 * place, or a failure. A caller holds the last outcome whole, so a new Load
 * replaces the previous one's warnings rather than leaving a stale list
 * behind for someone to clear.
 *
 * `loadText` is the text half: it works out which source a pasted string is
 * and reads it. Everything it needs from outside — the type catalog, hull
 * names, zKillboard and ESI — comes in through `TextLoadSources`, so this
 * stays fetch-free.
 */
import { loadEftFitting, type EftSlotLookup, type EftTypeLookup } from './eftLoader';
import {
  classifyLoadInput,
  killmailVictimToLoadResult,
  loadDnaFitting,
  type KillmailVictim,
} from './linkLoader';
import type { Fitting, FittingCargoItem, FittingDrone, FittingModule } from './types';

/** One thing a Load couldn't place. `line` is the pasted text's line, for a text Load. */
export interface LoadWarning {
  line?: number;
  text: string;
  reason: string;
}

/** Where a Load came from — which the warnings' wording depends on. */
export type LoadSource = 'text' | 'file' | 'in-game';

/** Why a Load produced no Fitting, beyond its warnings. */
export type LoadError = 'unrecognised' | 'killmail-not-found' | 'killmail-failed';

/** A Fitting's parts as each loader resolves them, before it has a name. */
export type LoadParts =
  | {
      hullTypeId: number;
      modules: FittingModule[];
      drones: FittingDrone[];
      cargo: FittingCargoItem[];
      unresolved: LoadWarning[];
    }
  | { hullTypeId: null; unresolved: LoadWarning[] };

export interface LoadedFitting {
  kind: 'fitting';
  source: LoadSource;
  fitting: Fitting;
  unresolved: LoadWarning[];
}

/** `error: null` when the warnings already say why (an unknown hull). */
export interface FailedLoad {
  kind: 'failed';
  source: LoadSource;
  error: LoadError | null;
  unresolved: LoadWarning[];
}

export type LoadOutcome = LoadedFitting | FailedLoad;

/**
 * A text Load that was itself a Share Link: the caller opens the code as-is,
 * so it round-trips unchanged instead of being re-encoded.
 */
export interface ShareLoad {
  kind: 'share';
  code: string;
}

/** Turns a loader's parts into its outcome; `name` is unused when the hull didn't resolve. */
export function toLoadOutcome(parts: LoadParts, name: string, source: LoadSource): LoadOutcome {
  if (parts.hullTypeId === null) {
    return { kind: 'failed', source, error: null, unresolved: parts.unresolved };
  }
  return {
    kind: 'fitting',
    source,
    fitting: {
      name,
      shipTypeId: parts.hullTypeId,
      modules: parts.modules,
      drones: parts.drones,
      cargo: parts.cargo,
    },
    unresolved: parts.unresolved,
  };
}

export interface TextLoadSources {
  /** Name → typeId and typeId → rack; read only for text that needs them. */
  catalog: () => Promise<{ typeByName: EftTypeLookup; slotByTypeId: EftSlotLookup }>;
  hullName: (typeId: number) => Promise<string>;
  /** zKillboard's hash for a killmail; null when it doesn't know the killmail. */
  killmailHash: (killmailId: number) => Promise<string | null>;
  /** ESI's killmail victim; null or a throw when ESI couldn't supply it. */
  killmailVictim: (killmailId: number, hash: string) => Promise<KillmailVictim | null>;
}

function failed(error: LoadError): FailedLoad {
  return { kind: 'failed', source: 'text', error, unresolved: [] };
}

async function readKillmail(
  killmailId: number,
  hash: string | undefined,
  slotByTypeId: EftSlotLookup,
  sources: TextLoadSources
): Promise<LoadParts | LoadError> {
  const resolvedHash = hash ?? (await sources.killmailHash(killmailId));
  if (resolvedHash === null) return 'killmail-not-found';
  try {
    const victim = await sources.killmailVictim(killmailId, resolvedHash);
    return victim === null ? 'killmail-failed' : killmailVictimToLoadResult(victim, slotByTypeId);
  } catch {
    return 'killmail-failed';
  }
}

/** Loads EFT text, a DNA string / chat link, a Share Link, an eveship.fit link, or a killmail link. */
export async function loadText(
  text: string,
  sources: TextLoadSources
): Promise<LoadOutcome | ShareLoad> {
  const input = classifyLoadInput(text);
  if (input.kind === 'unknown') return failed('unrecognised');
  if (input.kind === 'share') return { kind: 'share', code: input.code };

  const { typeByName, slotByTypeId } = await sources.catalog();
  let parts: LoadParts;
  if (input.kind === 'eft') {
    parts = loadEftFitting(input.text, typeByName, slotByTypeId);
  } else if (input.kind === 'dna') {
    parts = loadDnaFitting(input.dna, slotByTypeId);
  } else {
    const read = await readKillmail(input.killmailId, input.hash, slotByTypeId, sources);
    if (typeof read === 'string') return failed(read);
    parts = read;
  }
  const name = parts.hullTypeId === null ? '' : await sources.hullName(parts.hullTypeId);
  return toLoadOutcome(parts, name, 'text');
}
