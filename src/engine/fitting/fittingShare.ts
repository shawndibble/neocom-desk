/**
 * Encodes a Fitting into the compact, versioned, URL-safe string that is
 * its Share Link (#1530) — hull, modules with slot/state/charge, drones with
 * active counts, fighters, cargo, an optional implant/booster set and (from
 * version 2, #1718) an optional fit name.
 *
 * Wire grammar, built as plain text before it's ever deflated:
 * `hull|modules|drones|fighters|cargo|implants|name` (version 1 stops after
 * `implants` — six parts, no name — and still decodes so every Share Link
 * already handed out keeps working). `name` is `encodeURIComponent`'d so it
 * can never contain the `|` separator, or empty when the fit has none.
 * hull/typeId/count/slot
 * fields all base36. `modules` is 5 `;`-joined categories, fixed order
 * high/mid/low/rig/subsystem; each category is a `,`-joined list of
 * `slot:typeId:state[:chargeTypeId]` (state one of `0`-`3` — see
 * `STATE_TOKENS`). `drones` is `,`-joined `typeId:count:active`; `fighters`
 * and `cargo` are `,`-joined `typeId:count`/`typeId:quantity`; `implants` is
 * `implantIds:boosterIds` (each `,`-joined), or empty when no implant set is
 * carried at all. That text is then deflated with the platform's native
 * `CompressionStream('deflate-raw')` and base64url-encoded — no compression
 * library, per the Appraisal share decision this repo already follows
 * (`20260911-110045`).
 *
 * A decoded payload is fully player-controlled — pasted into chat, clicked by
 * a stranger — so decoding never throws: every field is validated, an
 * unsupported version comes back as its own typed reason (distinct from a
 * merely corrupt payload), and the decompressed size is capped so a forged
 * payload can't be a decompression bomb.
 *
 * Type IDs are carried as bare numbers, never checked against a catalog —
 * the same engine/feature split `market/appraisalShare.ts` draws for its
 * `hub` field — so a type ID this build's bundled SDE doesn't recognise
 * still survives the round trip; rendering it as an "unknown item" is a
 * feature-layer concern.
 */

export const FITTING_SHARE_VERSION = '2';
/** The pre-name wire format; decode-only, never produced by `encodeFittingShare`. */
export const LEGACY_FITTING_SHARE_VERSION = '1';

/** A fit name past this is truncated on encode and rejected on decode. */
export const MAX_FIT_NAME_LENGTH = 100;

export type SlotCategory = 'high' | 'mid' | 'low' | 'rig' | 'subsystem';
const SLOT_CATEGORIES: readonly SlotCategory[] = ['high', 'mid', 'low', 'rig', 'subsystem'];

export type ModuleState = 'offline' | 'online' | 'active' | 'overload';
const STATE_TOKENS: Record<ModuleState, string> = {
  offline: '0',
  online: '1',
  active: '2',
  overload: '3',
};
const TOKEN_STATES: Record<string, ModuleState> = {
  '0': 'offline',
  '1': 'online',
  '2': 'active',
  '3': 'overload',
};

export interface FittingModuleEntry {
  slotIndex: number;
  typeId: number;
  state: ModuleState;
  chargeTypeId?: number;
}

export interface FittingDrone {
  typeId: number;
  count: number;
  active: number;
}

export interface FittingFighter {
  typeId: number;
  count: number;
}

export interface FittingCargoItem {
  typeId: number;
  quantity: number;
}

export interface FittingImplantSet {
  implants: readonly number[];
  boosters: readonly number[];
}

export interface FittingShareInput {
  hullTypeId: number;
  modules: Readonly<Record<SlotCategory, readonly FittingModuleEntry[]>>;
  drones: readonly FittingDrone[];
  fighters: readonly FittingFighter[];
  cargo: readonly FittingCargoItem[];
  implantSet?: FittingImplantSet;
  name?: string;
}

export interface DecodedFittingShare {
  hullTypeId: number;
  modules: Record<SlotCategory, FittingModuleEntry[]>;
  drones: FittingDrone[];
  fighters: FittingFighter[];
  cargo: FittingCargoItem[];
  implantSet?: FittingImplantSet;
  /** Absent for version-1 payloads and for fits shared without a name. */
  name?: string;
}

export type EncodeFittingShareResult =
  { ok: true; payload: string } | { ok: false; reason: 'too-large' };

export type DecodeFittingShareResult =
  | { ok: true; value: DecodedFittingShare }
  | { ok: false; reason: 'invalid' | 'unsupported-version' };

/** Real hulls never approach these — they only bound a forged payload cheaply. */
export const MAX_SLOTS_PER_CATEGORY = 8;
export const MAX_DRONE_STACKS = 50;
export const MAX_FIGHTERS = 50;
export const MAX_CARGO_ITEMS = 500;
export const MAX_IMPLANTS = 10;
export const MAX_BOOSTERS = 10;

/** A legitimate fit's body is well under 1KB even uncompressed; this only bounds a decompression bomb. */
const MAX_DECOMPRESSED_BYTES = 65536;

const BASE36_TOKEN = /^[0-9a-z]+$/;

/**
 * `parseInt(str, 36)` parses a leading valid run and silently ignores
 * whatever follows (`parseInt('5.5', 36)` is `5`) — too lax for a decoder
 * that must reject any malformed or forged token outright.
 */
function parseBase36(token: string): number | null {
  if (!BASE36_TOKEN.test(token)) return null;
  // A long enough run of digits overflows parseInt's accumulator to
  // Infinity rather than NaN — reject it explicitly rather than let it
  // pass a bare `n > 0`/`n >= 0` check downstream.
  const n = parseInt(token, 36);
  return Number.isFinite(n) ? n : null;
}

function parseBase36Positive(token: string): number | null {
  const n = parseBase36(token);
  return n !== null && n > 0 ? n : null;
}

function parseBase36NonNegative(token: string): number | null {
  const n = parseBase36(token);
  return n !== null && n >= 0 ? n : null;
}

function base64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const BASE64URL_TOKEN = /^[A-Za-z0-9_-]+$/;

// Bounds the base64url segment itself, before it's ever inflated — otherwise
// a multi-megabyte forged payload gets fully `atob`'d and copied into a
// `Uint8Array` before `MAX_DECOMPRESSED_BYTES` (which only caps the
// *decompressed* size) ever gets a chance to reject it.
const MAX_ENCODED_LENGTH = 20000;

function base64urlDecode(str: string): Uint8Array | null {
  if (str.length > MAX_ENCODED_LENGTH) return null;
  if (!BASE64URL_TOKEN.test(str)) return null;
  const padded = str
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(str.length / 4) * 4, '=');
  try {
    const bin = atob(padded);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

// A `null` cap means "trusted input, drain to completion": the overload
// below promises a non-null *resolution* — if the stream errors, the
// returned promise rejects instead (still a sound promise of that type). A
// numeric cap means "untrusted input": both a stream error and exceeding the
// cap resolve to `null` rather than throwing.
async function drain(stream: ReadableStream<Uint8Array>, maxOutputBytes: null): Promise<Uint8Array>;
async function drain(
  stream: ReadableStream<Uint8Array>,
  maxOutputBytes: number
): Promise<Uint8Array | null>;
async function drain(
  stream: ReadableStream<Uint8Array>,
  maxOutputBytes: number | null
): Promise<Uint8Array | null> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (maxOutputBytes !== null && total > maxOutputBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch (err) {
    if (maxOutputBytes === null) throw err;
    return null;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function toStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function stateToToken(state: ModuleState): string {
  return STATE_TOKENS[state];
}

function tokenToState(token: string): ModuleState | null {
  return TOKEN_STATES[token] ?? null;
}

export async function encodeFittingShare(
  input: FittingShareInput
): Promise<EncodeFittingShareResult> {
  for (const category of SLOT_CATEGORIES) {
    if (input.modules[category].length > MAX_SLOTS_PER_CATEGORY)
      return { ok: false, reason: 'too-large' };
  }
  if (input.drones.length > MAX_DRONE_STACKS) return { ok: false, reason: 'too-large' };
  if (input.fighters.length > MAX_FIGHTERS) return { ok: false, reason: 'too-large' };
  if (input.cargo.length > MAX_CARGO_ITEMS) return { ok: false, reason: 'too-large' };
  if (input.implantSet) {
    if (input.implantSet.implants.length > MAX_IMPLANTS) return { ok: false, reason: 'too-large' };
    if (input.implantSet.boosters.length > MAX_BOOSTERS) return { ok: false, reason: 'too-large' };
  }

  const modulesSection = SLOT_CATEGORIES.map((category) =>
    input.modules[category]
      .map((entry) => {
        const base = `${entry.slotIndex.toString(36)}:${entry.typeId.toString(36)}:${stateToToken(entry.state)}`;
        return entry.chargeTypeId === undefined
          ? base
          : `${base}:${entry.chargeTypeId.toString(36)}`;
      })
      .join(',')
  ).join(';');

  const dronesSection = input.drones
    .map((d) => `${d.typeId.toString(36)}:${d.count.toString(36)}:${d.active.toString(36)}`)
    .join(',');

  const fightersSection = input.fighters
    .map((f) => `${f.typeId.toString(36)}:${f.count.toString(36)}`)
    .join(',');

  const cargoSection = input.cargo
    .map((c) => `${c.typeId.toString(36)}:${c.quantity.toString(36)}`)
    .join(',');

  const implantsSection = input.implantSet
    ? `${input.implantSet.implants.map((t) => t.toString(36)).join(',')}:${input.implantSet.boosters
        .map((t) => t.toString(36))
        .join(',')}`
    : '';

  const body = [
    input.hullTypeId.toString(36),
    modulesSection,
    dronesSection,
    fightersSection,
    cargoSection,
    implantsSection,
    encodeURIComponent(input.name?.trim().slice(0, MAX_FIT_NAME_LENGTH) ?? ''),
  ].join('|');

  const bodyBytes = new TextEncoder().encode(body);
  const compressed = await drain(
    toStream(bodyBytes).pipeThrough(
      new CompressionStream('deflate-raw') as ReadableWritablePair<Uint8Array, Uint8Array>
    ),
    null
  );

  return { ok: true, payload: `${FITTING_SHARE_VERSION}.${base64urlEncode(compressed)}` };
}

function parseDrones(raw: string): FittingDrone[] | null {
  if (raw === '') return [];
  const entries = raw.split(',');
  if (entries.length > MAX_DRONE_STACKS) return null;
  const drones: FittingDrone[] = [];
  for (const entryStr of entries) {
    const fields = entryStr.split(':');
    if (fields.length !== 3) return null;
    const typeId = parseBase36Positive(fields[0]);
    const count = parseBase36Positive(fields[1]);
    const active = parseBase36NonNegative(fields[2]);
    if (typeId === null || count === null || active === null || active > count) return null;
    drones.push({ typeId, count, active });
  }
  return drones;
}

/** Shared shape behind both fighters (`typeId:count`) and cargo (`typeId:quantity`) — same grammar, different field name on the result. */
function parseTypeIdCountPairs(
  raw: string,
  max: number
): Array<{ typeId: number; count: number }> | null {
  if (raw === '') return [];
  const entries = raw.split(',');
  if (entries.length > max) return null;
  const pairs: Array<{ typeId: number; count: number }> = [];
  for (const entryStr of entries) {
    const fields = entryStr.split(':');
    if (fields.length !== 2) return null;
    const typeId = parseBase36Positive(fields[0]);
    const count = parseBase36Positive(fields[1]);
    if (typeId === null || count === null) return null;
    pairs.push({ typeId, count });
  }
  return pairs;
}

function parseFighters(raw: string): FittingFighter[] | null {
  return parseTypeIdCountPairs(raw, MAX_FIGHTERS);
}

function parseCargo(raw: string): FittingCargoItem[] | null {
  const pairs = parseTypeIdCountPairs(raw, MAX_CARGO_ITEMS);
  return pairs === null ? null : pairs.map((p) => ({ typeId: p.typeId, quantity: p.count }));
}

function parseTypeIdList(raw: string, max: number): number[] | null {
  if (raw === '') return [];
  const tokens = raw.split(',');
  if (tokens.length > max) return null;
  const ids: number[] = [];
  for (const token of tokens) {
    const id = parseBase36Positive(token);
    if (id === null) return null;
    ids.push(id);
  }
  return ids;
}

/** `undefined` means no implant set was carried at all; `null` means the field was malformed. */
function parseImplantSet(raw: string): FittingImplantSet | undefined | null {
  // Absent entirely (no implant set) vs. present-but-both-lists-empty (an
  // explicit empty set) are different inputs on encode and must stay
  // different on decode — only the former collapses to `undefined`.
  if (raw === '') return undefined;
  const fields = raw.split(':');
  if (fields.length !== 2) return null;
  const implants = parseTypeIdList(fields[0], MAX_IMPLANTS);
  const boosters = parseTypeIdList(fields[1], MAX_BOOSTERS);
  if (implants === null || boosters === null) return null;
  return { implants, boosters };
}

function parseName(raw: string): string | undefined | null {
  if (raw === '') return undefined;
  let name: string;
  try {
    name = decodeURIComponent(raw).trim();
  } catch {
    return null;
  }
  if (name.length > MAX_FIT_NAME_LENGTH) return null;
  return name === '' ? undefined : name;
}

function parseBody(body: string, version: string): DecodeFittingShareResult {
  const parts = body.split('|');
  if (parts.length !== (version === FITTING_SHARE_VERSION ? 7 : 6))
    return { ok: false, reason: 'invalid' };
  const [hullStr, modulesStr, dronesStr, fightersStr, cargoStr, implantsStr, nameStr = ''] = parts;

  const hullTypeId = parseBase36Positive(hullStr);
  if (hullTypeId === null) return { ok: false, reason: 'invalid' };

  const categoryStrs = modulesStr.split(';');
  if (categoryStrs.length !== SLOT_CATEGORIES.length) return { ok: false, reason: 'invalid' };

  const modules: Record<SlotCategory, FittingModuleEntry[]> = {
    high: [],
    mid: [],
    low: [],
    rig: [],
    subsystem: [],
  };
  for (let i = 0; i < SLOT_CATEGORIES.length; i++) {
    const category = SLOT_CATEGORIES[i];
    const raw = categoryStrs[i];
    if (raw === '') continue;
    const entries = raw.split(',');
    if (entries.length > MAX_SLOTS_PER_CATEGORY) return { ok: false, reason: 'invalid' };
    for (const entryStr of entries) {
      const fields = entryStr.split(':');
      if (fields.length !== 3 && fields.length !== 4) return { ok: false, reason: 'invalid' };
      const slotIndex = parseBase36NonNegative(fields[0]);
      const typeId = parseBase36Positive(fields[1]);
      const state = tokenToState(fields[2]);
      if (slotIndex === null || typeId === null || state === null)
        return { ok: false, reason: 'invalid' };
      let chargeTypeId: number | undefined;
      if (fields.length === 4) {
        const parsedCharge = parseBase36Positive(fields[3]);
        if (parsedCharge === null) return { ok: false, reason: 'invalid' };
        chargeTypeId = parsedCharge;
      }
      modules[category].push({ slotIndex, typeId, state, chargeTypeId });
    }
  }

  const drones = parseDrones(dronesStr);
  if (drones === null) return { ok: false, reason: 'invalid' };
  const fighters = parseFighters(fightersStr);
  if (fighters === null) return { ok: false, reason: 'invalid' };
  const cargo = parseCargo(cargoStr);
  if (cargo === null) return { ok: false, reason: 'invalid' };
  const implantSet = parseImplantSet(implantsStr);
  if (implantSet === null) return { ok: false, reason: 'invalid' };
  const name = parseName(nameStr);
  if (name === null) return { ok: false, reason: 'invalid' };

  return {
    ok: true,
    value: { hullTypeId, modules, drones, fighters, cargo, implantSet, name },
  };
}

export async function decodeFittingShare(payload: string): Promise<DecodeFittingShareResult> {
  const dotIndex = payload.indexOf('.');
  if (dotIndex === -1) return { ok: false, reason: 'invalid' };

  const version = payload.slice(0, dotIndex);
  const encoded = payload.slice(dotIndex + 1);
  if (version !== FITTING_SHARE_VERSION && version !== LEGACY_FITTING_SHARE_VERSION)
    return { ok: false, reason: 'unsupported-version' };
  if (encoded === '') return { ok: false, reason: 'invalid' };

  const compressed = base64urlDecode(encoded);
  if (compressed === null) return { ok: false, reason: 'invalid' };

  const bodyBytes = await drain(
    toStream(compressed).pipeThrough(
      new DecompressionStream('deflate-raw') as ReadableWritablePair<Uint8Array, Uint8Array>
    ),
    MAX_DECOMPRESSED_BYTES
  );
  if (bodyBytes === null) return { ok: false, reason: 'invalid' };

  let body: string;
  try {
    body = new TextDecoder('utf-8', { fatal: true }).decode(bodyBytes);
  } catch {
    return { ok: false, reason: 'invalid' };
  }

  return parseBody(body, version);
}
