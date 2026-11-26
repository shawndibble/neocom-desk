import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { record } from './communities.js';
import {
  int,
  OBSERVED,
  parseBookCall,
  parseFeederTarget,
  type FeederTargetCall,
} from './corpTaxBook.js';
import type { CorpSyncDeps } from './corpSyncGrant.js';
import {
  authorizeFeederCaller,
  parseFeederCall,
  type FeederCall,
} from './corpTaxBookFeederGrant.js';
import { FEEDER_VIEW_REFINERIES, feederViewRef } from './corpTaxBookFeederView.js';
import { ENDED } from './corpTaxBookFeederOwnerCalls.js';
import { feederBookDeps } from './corpTaxBookFeederViewCalls.js';
import type { FeederRecord, RefineryLabelDoc } from './corpTaxBookFeeders.js';
import { signedInCharacter, fail, type Caller } from './actorAuth.js';
import {
  appendAudit,
  authorizeOfficer,
  bookRef,
  feederRef,
  type Actor,
  type BookDeps,
} from './corpTaxBookStore.js';

export const MAX_REFINERY_LABEL = 100;

export interface RefineryLabelFields {
  structureId: number;
  label: string | null;
}

function parseLabelFields(data: unknown): RefineryLabelFields {
  const d = record(data);
  const id = d.structureId;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) {
    throw new HttpsError('invalid-argument', 'structureId must be a structure id');
  }
  if (d.label !== null && typeof d.label !== 'string') {
    throw new HttpsError('invalid-argument', 'label must be text or null');
  }
  const text = typeof d.label === 'string' ? d.label.trim() : '';
  if (text.length > MAX_REFINERY_LABEL) {
    throw new HttpsError(
      'invalid-argument',
      `label must be at most ${MAX_REFINERY_LABEL} characters`
    );
  }
  return { structureId: id, label: text === '' ? null : text };
}

export interface SetRefineryLabelInput extends FeederTargetCall, RefineryLabelFields {}

export function parseSetRefineryLabelInput(data: unknown): SetRefineryLabelInput {
  return { ...parseFeederTarget(data), ...parseLabelFields(data) };
}

export interface SetOwnRefineryLabelInput extends FeederCall, RefineryLabelFields {}

export function parseSetOwnRefineryLabelInput(data: unknown): SetOwnRefineryLabelInput {
  return { ...parseFeederCall(data), ...parseLabelFields(data) };
}

async function writeRefineryLabel(
  deps: BookDeps,
  collector: number,
  feeder: number,
  input: RefineryLabelFields,
  actor: Actor & { characterId: number },
  side: RefineryLabelDoc['side']
): Promise<{ ok: true }> {
  const known = await bookRef(deps.db, collector)
    .collection(OBSERVED)
    .where('sourceCorporationId', '==', feeder)
    .where('structureId', '==', input.structureId)
    .limit(1)
    .get();
  if (known.empty) fail('not-found', 'Not one of this moon owner’s refineries', 'unknown-refinery');
  const ref = feederRef(deps.db, collector, feeder);
  const field = new FieldPath('refineryLabels', String(input.structureId));
  const view = feederViewRef(deps.db, collector, feeder);
  const viewRefinery = view.collection(FEEDER_VIEW_REFINERIES).doc(String(input.structureId));
  await deps.db.runTransaction(async (tx) => {
    const [recSnap, viewSnap, summarySnap] = await Promise.all([
      tx.get(ref),
      tx.get(viewRefinery),
      tx.get(view),
    ]);
    const rec = recSnap.data() as FeederRecord | undefined;
    if (!rec) fail('not-found', 'No such moon owner', 'no-feeder');
    if (ENDED.includes(rec.status)) {
      fail('failed-precondition', 'This moon owner has left', 'feeder-ended');
    }
    const doc: RefineryLabelDoc | null =
      input.label === null
        ? null
        : {
            label: input.label,
            setAt: new Date(deps.now()).toISOString(),
            setBy: actor.characterId,
            side,
          };
    tx.update(ref, field, doc ?? FieldValue.delete());
    if (viewSnap.exists) {
      tx.update(viewRefinery, { label: doc?.label ?? null, labelSetAt: doc?.setAt ?? null });
      if (summarySnap.exists) tx.update(view, { builtAt: deps.now() });
    }
    appendAudit(tx, deps, collector, actor, 'refineryLabelSet', {
      feederCorporationId: feeder,
      structureId: input.structureId,
      label: input.label,
      side,
    });
  });
  return { ok: true };
}

export async function setRefineryLabel(
  deps: BookDeps,
  caller: Caller,
  input: SetRefineryLabelInput
): Promise<{ ok: true }> {
  const access = await authorizeOfficer(deps, caller, input, 'edit', { live: true });
  return writeRefineryLabel(
    deps,
    input.corporationId,
    input.feederCorporationId,
    input,
    { characterId: access.characterId, name: access.characterName },
    'accounting'
  );
}

export async function setOwnRefineryLabel(
  deps: CorpSyncDeps,
  caller: Caller,
  input: SetOwnRefineryLabelInput
): Promise<{ ok: true }> {
  const ctx = await authorizeFeederCaller(deps, caller, input, 'edit');
  if (!ctx)
    fail('failed-precondition', 'This corporation is not feeding a book', 'not-your-feeder');
  return writeRefineryLabel(
    feederBookDeps(deps),
    ctx.collectorCorporationId,
    input.corporationId,
    input,
    { characterId: ctx.callerId, name: 'Moon owner' },
    'moon-owner'
  );
}

export const MAX_LEARNED_SYSTEMS = 50;

export interface LearnRefinerySystemsInput {
  corporationId: number;
  systems: Record<string, number>;
}

export function parseLearnRefinerySystemsInput(data: unknown): LearnRefinerySystemsInput {
  const { corporationId } = parseBookCall(data);
  const entries = Object.entries(record(record(data).systems));
  if (entries.length === 0 || entries.length > MAX_LEARNED_SYSTEMS) {
    throw new HttpsError(
      'invalid-argument',
      `systems must name 1 to ${MAX_LEARNED_SYSTEMS} refineries`
    );
  }
  const systems: Record<string, number> = {};
  for (const [id, system] of entries) {
    if (String(int(Number(id), 'structureId')) !== id) {
      throw new HttpsError('invalid-argument', 'systems must be keyed by structure id');
    }
    systems[id] = int(system, 'solarSystemId', 30_000_000, 32_000_000);
  }
  return { corporationId, systems };
}

export async function learnRefinerySystems(
  deps: BookDeps,
  caller: Caller,
  input: LearnRefinerySystemsInput
): Promise<{ ok: true }> {
  const characterId = signedInCharacter(caller);
  const book = bookRef(deps.db, input.corporationId);
  const ids = Object.keys(input.systems);
  const own = await Promise.all(
    ids.map((id) =>
      book
        .collection(OBSERVED)
        .where('uid', '==', caller.uid)
        .where('structureId', '==', Number(id))
        .limit(1)
        .get()
    )
  );
  for (const [i, id] of ids.entries()) {
    const system = input.systems[id];
    const row = own[i].docs[0];
    const feeder: unknown = row?.get('sourceCorporationId');
    if (typeof feeder !== 'number' || typeof row.get('solarSystemId') === 'number') continue;
    const ref = feederRef(deps.db, input.corporationId, feeder);
    const field = new FieldPath('refinerySystems', id);
    const view = feederViewRef(deps.db, input.corporationId, feeder);
    const viewRefinery = view.collection(FEEDER_VIEW_REFINERIES).doc(id);
    await deps.db.runTransaction(async (tx) => {
      const [recSnap, viewSnap, summarySnap] = await Promise.all([
        tx.get(ref),
        tx.get(viewRefinery),
        tx.get(view),
      ]);
      if (!recSnap.exists || recSnap.get(field) !== undefined) return;
      tx.update(ref, field, system);
      if (viewSnap.exists && typeof viewSnap.get('solarSystemId') !== 'number') {
        tx.update(viewRefinery, { solarSystemId: system });
        if (summarySnap.exists) tx.update(view, { builtAt: deps.now() });
      }
      appendAudit(
        tx,
        deps,
        input.corporationId,
        { characterId, name: '' },
        'refinerySystemLearned',
        {
          feederCorporationId: feeder,
          structureId: Number(id),
          solarSystemId: system,
        }
      );
    });
  }
  return { ok: true };
}
