import { loadEftFitting, type EftSlotLookup, type EftTypeLookup } from './eftLoader';
import type { MutaplasmidLookup } from './mutaplasmids';
import {
  classifyLoadInput,
  killmailVictimToLoadResult,
  loadDnaFitting,
  type KillmailVictim,
} from './linkLoader';
import type {
  Fitting,
  FittingCargoItem,
  FittingDrone,
  FittingModule,
  FittingFighter,
  FittingSlotKind,
} from './types';

export type LoadWarningKind =
  | { kind: 'unknown-ship' }
  | {
      kind: 'unknown-item';
      countWritten?: true;
    }
  | { kind: 'too-many-slots'; rack: FittingSlotKind }
  | { kind: 'malformed-item' }
  | { kind: 'unsupported-slot' }
  | { kind: 'unknown-slot' }
  | { kind: 'parse-error' }
  | { kind: 'unknown-mutation' };

export type LoadWarning = {
  line?: number;
  text: string;
  reason: string;
} & LoadWarningKind;

export type LoadSource = 'text' | 'file' | 'in-game';

export type LoadError =
  | 'unrecognised'
  | 'eve-workbench-not-found'
  | 'eve-workbench-failed'
  | 'killmail-not-found'
  | 'killmail-unreachable'
  | 'killmail-failed';

export type LoadParts =
  | {
      hullTypeId: number;
      modules: FittingModule[];
      drones: FittingDrone[];
      cargo: FittingCargoItem[];
      fitName?: string;
      fighters?: FittingFighter[];
      unresolved: LoadWarning[];
    }
  | { hullTypeId: null; unresolved: LoadWarning[] };

export interface LoadedFitting {
  kind: 'fitting';
  source: LoadSource;
  fitting: Fitting;
  unresolved: LoadWarning[];
}

export interface FailedLoad {
  kind: 'failed';
  source: LoadSource;
  error: LoadError | null;
  unresolved: LoadWarning[];
}

export type LoadOutcome = LoadedFitting | FailedLoad;

export interface ShareLoad {
  kind: 'share';
  code: string;
}

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
      ...(parts.fighters?.length ? { fighters: parts.fighters } : {}),
    },
    unresolved: parts.unresolved,
  };
}

export type EveWorkbenchEft =
  { status: 'ok'; eft: string } | { status: 'not-found' } | { status: 'failed' };

export type KillmailHashLookup =
  { status: 'ok'; hash: string } | { status: 'not-found' } | { status: 'unreachable' };

export interface TextLoadSources {
  catalog: () => Promise<{
    typeByName: EftTypeLookup;
    slotByTypeId: EftSlotLookup;
    mutaplasmids?: MutaplasmidLookup;
  }>;
  hullName: (typeId: number) => Promise<string>;
  killmailHash: (killmailId: number) => Promise<KillmailHashLookup>;
  killmailVictim: (killmailId: number, hash: string) => Promise<KillmailVictim | null>;
  eveWorkbenchEft: (fitId: string) => Promise<EveWorkbenchEft>;
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
  let resolvedHash = hash;
  if (resolvedHash === undefined) {
    const lookup = await sources.killmailHash(killmailId);
    if (lookup.status === 'unreachable') return 'killmail-unreachable';
    if (lookup.status === 'not-found') return 'killmail-not-found';
    resolvedHash = lookup.hash;
  }
  try {
    const victim = await sources.killmailVictim(killmailId, resolvedHash);
    return victim === null ? 'killmail-failed' : killmailVictimToLoadResult(victim, slotByTypeId);
  } catch {
    return 'killmail-failed';
  }
}

function withoutLineNumbers(parts: LoadParts): LoadParts {
  return {
    ...parts,
    unresolved: parts.unresolved.map((warning) => {
      const unlined = { ...warning };
      delete unlined.line;
      return unlined;
    }),
  };
}

async function readEveWorkbench(
  fitId: string,
  sources: TextLoadSources
): Promise<{ eft: string } | LoadError> {
  if (fitId === '') return 'eve-workbench-not-found';
  try {
    const answer = await sources.eveWorkbenchEft(fitId);
    if (answer.status === 'ok') return { eft: answer.eft };
    return answer.status === 'not-found' ? 'eve-workbench-not-found' : 'eve-workbench-failed';
  } catch {
    return 'eve-workbench-failed';
  }
}

export async function loadText(
  text: string,
  sources: TextLoadSources
): Promise<LoadOutcome | ShareLoad> {
  const input = classifyLoadInput(text);
  if (input.kind === 'unknown') return failed('unrecognised');
  if (input.kind === 'share') return { kind: 'share', code: input.code };

  let workbenchEft = '';
  if (input.kind === 'eveWorkbench') {
    const read = await readEveWorkbench(input.fitId, sources);
    if (typeof read === 'string') return failed(read);
    workbenchEft = read.eft;
  }

  const { typeByName, slotByTypeId, mutaplasmids } = await sources.catalog();
  let parts: LoadParts;
  if (input.kind === 'eft') {
    parts = loadEftFitting(input.text, typeByName, slotByTypeId, mutaplasmids);
  } else if (input.kind === 'eveWorkbench') {
    parts = withoutLineNumbers(
      loadEftFitting(workbenchEft, typeByName, slotByTypeId, mutaplasmids)
    );
  } else if (input.kind === 'dna') {
    parts = loadDnaFitting(input.dna, slotByTypeId);
  } else {
    const read = await readKillmail(input.killmailId, input.hash, slotByTypeId, sources);
    if (typeof read === 'string') return failed(read);
    parts = read;
  }
  const carried = parts.hullTypeId === null ? undefined : parts.fitName?.trim();
  const name =
    parts.hullTypeId === null ? '' : carried || (await sources.hullName(parts.hullTypeId));
  return toLoadOutcome(parts, name, 'text');
}
