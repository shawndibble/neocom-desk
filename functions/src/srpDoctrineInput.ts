// SRP Doctrine Fit input (#4857, ADR 0026): parsing the Director's save and delete, no Firestore.
// The client sends an already-built snapshot (pasted EFT or a picked Fitting, resolved to type
// ids); the server only checks its shape and bounds, and sorts the lists.

import { HttpsError } from 'firebase-functions/v2/https';
import { boundedString, docId, record } from './communities.js';
import { int } from './corpTaxBook.js';
import { sortedIds } from './srpDoctrine.js';
import type { SaveDoctrineInput } from './srpTypes.js';

export const MAX_DOCTRINE_NAME = 80;
// A hull has at most 8 each of high, mid and low plus 5 subsystems, and 3 rigs; headroom for T3s.
export const MAX_DOCTRINE_MODULES = 40;
export const MAX_DOCTRINE_RIGS = 8;
const TYPE_ID_MAX = 2_147_483_647;

function typeIds(value: unknown, field: string, max: number): number[] {
  if (!Array.isArray(value)) {
    throw new HttpsError('invalid-argument', `${field} must be a list of type ids`);
  }
  if (value.length > max) {
    throw new HttpsError('invalid-argument', `${field} must have at most ${max} entries`);
  }
  return sortedIds(value.map((v) => int(v, field, 1, TYPE_ID_MAX)));
}

/** `{ id?, name, snapshot: { hullTypeId, modules, rigs } }`; `id` present replaces that fit. */
export function parseSaveDoctrine(data: unknown): SaveDoctrineInput {
  const d = record(data);
  const name = boundedString(d.name, 'name', MAX_DOCTRINE_NAME);
  const s = record(d.snapshot);
  const input: SaveDoctrineInput = {
    name,
    snapshot: {
      hullTypeId: int(s.hullTypeId, 'hullTypeId', 1, TYPE_ID_MAX),
      name,
      modules: typeIds(s.modules, 'modules', MAX_DOCTRINE_MODULES),
      rigs: typeIds(s.rigs, 'rigs', MAX_DOCTRINE_RIGS),
    },
  };
  if (d.id !== undefined) input.id = docId(d.id, 'id');
  return input;
}

export function parseDeleteDoctrine(data: unknown): { id: string } {
  return { id: docId(record(data).id, 'id') };
}
