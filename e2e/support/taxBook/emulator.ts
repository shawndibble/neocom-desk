/**
 * The Firestore emulator as the specs reach it: wipe it, write a seeded book, read a doc back.
 *
 * Plain REST with the emulator's owner token (`Bearer owner`), which bypasses the rules the
 * browser reads through: a seed writes what the server would have stored, and nothing in the
 * app's own write path. The value encoding is Firestore's REST wire format, as
 * `appraisalSharedNarrow.spec.ts` builds it for a mocked read.
 */
import { FIRESTORE, PROJECT_ID } from './runEnv';

const ROOT = `projects/${PROJECT_ID}/databases/(default)/documents`;
const OWNER = { Authorization: 'Bearer owner', 'content-type': 'application/json' };

/** One stored document: its path under the database root and its fields. */
export interface SeedDoc {
  path: string;
  data: Record<string, unknown>;
}

type Wire = Record<string, unknown>;

function toWire(value: unknown): Wire {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toWire) } };
  return { mapValue: { fields: fieldsOf(value as Record<string, unknown>) } };
}

function fieldsOf(data: Record<string, unknown>): Record<string, Wire> {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, toWire(v)])
  );
}

function fromWire(value: Wire): unknown {
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('stringValue' in value) return value.stringValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) {
    const values = (value.arrayValue as { values?: Wire[] }).values ?? [];
    return values.map(fromWire);
  }
  if ('mapValue' in value) {
    const fields = (value.mapValue as { fields?: Record<string, Wire> }).fields ?? {};
    return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fromWire(v)]));
  }
  return undefined;
}

async function ok(response: Response, what: string): Promise<Response> {
  if (!response.ok) throw new Error(`${what}: ${response.status} ${await response.text()}`);
  return response;
}

/** Deletes every document in the emulator: each test starts from an empty database. */
export async function wipeFirestore(): Promise<void> {
  await ok(
    await fetch(`${FIRESTORE}/emulator/v1/${ROOT}`, { method: 'DELETE' }),
    'wipe the Firestore emulator'
  );
}

/** Writes the docs as one batch per 400 (the emulator takes 500 writes a commit). */
export async function writeDocs(docs: readonly SeedDoc[]): Promise<void> {
  for (let i = 0; i < docs.length; i += 400) {
    const writes = docs.slice(i, i + 400).map((doc) => ({
      update: { name: `${ROOT}/${doc.path}`, fields: fieldsOf(doc.data) },
    }));
    await ok(
      await fetch(`${FIRESTORE}/v1/${ROOT}:commit`, {
        method: 'POST',
        headers: OWNER,
        body: JSON.stringify({ writes }),
      }),
      'seed the Firestore emulator'
    );
  }
}

/** A stored document's fields, or null when there is none. */
export async function readDoc(path: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${FIRESTORE}/v1/${ROOT}/${path}`, { headers: OWNER });
  if (response.status === 404) return null;
  const body = (await (await ok(response, `read ${path}`)).json()) as {
    fields?: Record<string, Wire>;
  };
  return fromWire({ mapValue: { fields: body.fields ?? {} } }) as Record<string, unknown>;
}

/** Every document of a collection, by id. */
export async function readCollection(path: string): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  let pageToken = '';
  do {
    const url = `${FIRESTORE}/v1/${ROOT}/${path}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const body = (await (
      await ok(await fetch(url, { headers: OWNER }), `list ${path}`)
    ).json()) as {
      documents?: { name: string; fields?: Record<string, Wire> }[];
      nextPageToken?: string;
    };
    for (const doc of body.documents ?? []) {
      out.set(
        doc.name.split('/').at(-1)!,
        fromWire({ mapValue: { fields: doc.fields ?? {} } }) as Record<string, unknown>
      );
    }
    pageToken = body.nextPageToken ?? '';
  } while (pageToken);
  return out;
}
