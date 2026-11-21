/**
 * The one table of a book read (issue #5248, ADR 0032): each part (parts.ts) and the fields it
 * fills, how a field is read from the whole book, and what it holds when its part was not read.
 * Reading and merging both walk this table, so a new field is one entry here (and its place on
 * `BookData`). A scoped read (one Miner, one moon) swaps a field's reader for its own, never
 * leaves one out: a read's `parts` names exactly the parts it filled.
 */
import { collection, doc, getDoc, getDocs } from 'firebase/firestore/lite';
import type { Miner } from '@/engine/corpTaxBook/charges';
import type { Dismissal } from '@/engine/corpTaxBook/dismissals';
import { readDisputes, type OreDispute } from '@/engine/corpTaxBook/disputes';
import { scheduledSyncFrom, type ScheduledSyncStatus } from '@/engine/corpTaxBook/scheduledSync';
import type { Adjustment } from '@/engine/corpTaxBook/adjustments';
import type { RecordedWriteOff } from '@/engine/corpTaxBook/payments';
import type { LateNotice } from '../../../../../functions/src/corpTaxBookLateNotice';
import type { RunningAccountCheckpoint } from '../../../../../functions/src/corpTaxBookCheckpoint';
import type { ToleranceExemption } from '@/engine/corpTaxBook/toleranceExemptions';
import type { SettlePayment, SyncExtraction } from '@/engine/corpTaxBook/sync';
import type { ObservedRow } from '@/engine/corpTaxBook/types';
import { readUncounted, type UncountedDonation } from '@/engine/corpTaxBook/uncounted';
import type { MoonDoc } from '../../../../../functions/src/corpTaxBookMoonDocs';
import {
  bookFeederFrom,
  readCheckpoints,
  readNotices,
  groupingAnswersFrom,
  groupConflictsFrom,
  type GroupConflict,
  settingsFrom,
  type BookData,
  type BookDeclaration,
  type BookFeeder,
  type BookSettings,
  type FeederDoc,
  type FeederPayoutRow,
  type GroupingAnswer,
} from '../bookClient';
import type { FeederViewSummary } from '../feederViewClient';
import type { OpenBook } from '../openBook';
import type { BookPart, BookPartSet } from './parts';

/** A book read as a page joins it: the parts it asked for, and the scope it was read in. */
export interface BookRead extends BookData {
  /** The parts this read filled; every field of every other part is empty. */
  parts: BookPartSet;
  /** A one-Miner read (#5258): the first day whose rows were read. */
  minerScope?: { from: string };
  /** The moon page this read was for (#5716), whether its docs stood in or the whole book was read. */
  forMoon?: string;
  /** The moon docs that stand in for the ledger rows of a moon page's earlier cycles. */
  moon?: { docs: ReadonlyMap<string, MoonDoc>; fromDocs: ReadonlySet<string> };
  /** A refinery page's read (#6348): every moon doc the refinery has, by extraction id. */
  refinery?: { structureId: number; docs: ReadonlyMap<string, MoonDoc> };
}

/** One book read: the open book, and each field it reads once however many readers ask. */
export interface ReadContext {
  readonly book: OpenBook;
  readonly characterId: number;
  readonly corporationId: number;
  once<T>(key: string, read: () => Promise<T>): Promise<T>;
}

export function readContext(
  book: OpenBook,
  characterId: number,
  corporationId: number
): ReadContext {
  const held = new Map<string, Promise<unknown>>();
  return {
    book,
    characterId,
    corporationId,
    once<T>(key: string, read: () => Promise<T>): Promise<T> {
      let value = held.get(key);
      if (value === undefined) {
        value = read();
        held.set(key, value);
      }
      return value as Promise<T>;
    },
  };
}

interface Field<T> {
  read: (ctx: ReadContext) => Promise<T>;
  empty: () => T;
}
const field = <T>(empty: () => T, read: (ctx: ReadContext) => Promise<T>): Field<T> => ({
  read,
  empty,
});
const none = () => [];

const meta = (ctx: ReadContext, id: string, slot: string) =>
  ctx.book.part(
    'meta',
    async () =>
      (await getDoc(doc(ctx.book.db, 'corps', String(ctx.corporationId), 'meta', id))).data(),
    slot
  );

/** Every feeder with its payouts. One stamp covers a feeder's record and its payouts: both live under `feeders`. */
function feedersOf({ book, corporationId }: ReadContext): Promise<BookFeeder[]> {
  const payouts = (feeder: number) =>
    collection(book.db, 'corps', String(corporationId), 'feeders', String(feeder), 'payouts');
  return book.part(
    'feeders',
    async () =>
      Promise.all(
        (await book.read<FeederDoc>('feeders')).map(async (f) =>
          bookFeederFrom(
            f,
            (await getDocs(payouts(f.corporationId))).docs.map(
              (d) => ({ ...d.data(), id: d.id }) as FeederPayoutRow
            )
          )
        )
      ),
    'feeders:rows'
  );
}

/**
 * The book's moon owners' view summaries, one doc each, nothing under them. An officer of the
 * book may read them (rules, #5717). One that is missing, or that the rules do not yet let this
 * officer read, is left out: the caller prices that moon owner from its ledger rows instead.
 */
async function feederSummariesOf(ctx: ReadContext): Promise<Map<number, FeederViewSummary>> {
  const feeders = await readField(ctx, 'feeders');
  const found = await Promise.all(
    feeders.map(async ({ corporationId: id }) => {
      try {
        const snap = await getDoc(
          doc(ctx.book.db, 'corps', String(ctx.corporationId), 'feederViews', String(id))
        );
        return snap.exists() ? ([id, snap.data() as FeederViewSummary] as const) : undefined;
      } catch {
        return undefined;
      }
    })
  );
  return new Map(found.flatMap((f) => (f ? [f] : [])));
}

const SLICES = {
  core: {
    miners: field<Miner[]>(none, (c) => c.book.list('miners')),
    notices: field<LateNotice[]>(none, (c) => readNotices(c.book)),
    checkpoints: field<RunningAccountCheckpoint[]>(none, (c) => readCheckpoints(c.book)),
    extractions: field<SyncExtraction[]>(none, (c) => c.book.list('extractions')),
    feeders: field<BookFeeder[]>(none, feedersOf),
    scheduledSync: field<ScheduledSyncStatus | null>(
      () => null,
      async (c) => scheduledSyncFrom(await meta(c, 'scheduledSync', 'meta:schedule'))
    ),
    uncounted: field<UncountedDonation[]>(
      none,
      async (c) => readUncounted(await meta(c, 'uncounted', 'meta:uncounted')).donations
    ),
  },
  // The ledger rows are a part of their own: a tab that needs none never reads them (#5717).
  observed: {
    observed: field<ObservedRow[]>(none, (c) => c.book.observed()),
  },
  ledger: {
    payments: field<SettlePayment[]>(none, (c) => c.book.list('payments')),
    dismissals: field<Dismissal[]>(none, (c) => c.book.list('dismissals')),
    writeOffs: field<RecordedWriteOff[]>(none, (c) => c.book.list('writeOffs')),
    declarations: field<BookDeclaration[]>(none, (c) => c.book.list('declarations')),
    adjustments: field<Adjustment[]>(none, (c) => c.book.list('adjustments')),
    // Best effort, like disputes: nothing is read until a write stamped it, and a denied read is none.
    toleranceExemptions: field<ToleranceExemption[]>(none, async (c) =>
      c.book.written('toleranceExemptions')
        ? await c.book.list<ToleranceExemption>('toleranceExemptions').catch(none)
        : []
    ),
    // #6206: best effort, so a book whose rules predate disputes still opens.
    disputes: field<OreDispute[]>(none, async (c) =>
      readDisputes(
        c.book.written('disputes') ? await c.book.list<unknown>('disputes').catch(none) : []
      )
    ),
  },
  answers: {
    groupingAnswers: field<GroupingAnswer[]>(none, async (c) =>
      groupingAnswersFrom(await meta(c, 'groupingAnswers', 'meta:answers'))
    ),
    // Best effort: a book that never had a conflict has no doc, and a denied read is none.
    groupConflicts: field<GroupConflict[]>(none, async (c) =>
      groupConflictsFrom(
        await meta(c, 'groupConflicts', 'meta:groupConflicts').catch(() => undefined)
      )
    ),
  },
  owners: {
    feederSummaries: field<ReadonlyMap<number, FeederViewSummary> | undefined>(
      () => undefined,
      feederSummariesOf
    ),
  },
} satisfies Record<BookPart, Record<string, Field<unknown>>>;

type Slices = typeof SLICES;
type FieldsOf<P extends BookPart> = {
  [K in keyof Slices[P]]: Slices[P][K] extends Field<infer T> ? T : never;
};
/** Every field a read fills, each from the one part that holds it. */
export type Fields = FieldsOf<'core'> &
  FieldsOf<'observed'> &
  FieldsOf<'ledger'> &
  FieldsOf<'answers'> &
  FieldsOf<'owners'>;
export type FieldName = keyof Fields;
/** A scoped read's own reader for a field, in place of the whole book's. */
export type Overrides = { [K in FieldName]?: () => Promise<Fields[K]> };

const PARTS = Object.keys(SLICES) as BookPart[];
const fieldsIn = (part: BookPart) =>
  Object.entries(SLICES[part]) as [FieldName, Field<Fields[FieldName]>][];
const partOf = new Map(PARTS.flatMap((part) => fieldsIn(part).map(([name]) => [name, part])));

/** A field as the whole book holds it, read once per read. */
export function readField<K extends FieldName>(ctx: ReadContext, name: K): Promise<Fields[K]> {
  const slice = SLICES[partOf.get(name)!] as Record<K, Field<Fields[K]>>;
  return ctx.once(name, () => slice[name].read(ctx));
}

/** Starts reading these parts' fields; a failure surfaces where a field is read. */
export function startReading(ctx: ReadContext, parts: readonly BookPart[]): void {
  for (const part of parts)
    for (const [name] of fieldsIn(part)) readField(ctx, name).catch(() => undefined);
}

/** Every field: the claimed parts' read (an override first), every other part's empty. */
export async function readSlices(
  ctx: ReadContext,
  parts: BookPartSet,
  overrides: Overrides = {}
): Promise<Fields> {
  const entries = await Promise.all(
    PARTS.flatMap((part) =>
      fieldsIn(part).map(async ([name, f]) => {
        if (!parts.has(part)) return [name, f.empty()] as const;
        const own = overrides[name] as (() => Promise<unknown>) | undefined;
        return [name, await (own ? own() : readField(ctx, name))] as const;
      })
    )
  );
  return Object.fromEntries(entries) as Fields;
}

/** The fields as `BookData` holds them: the records the sync shares sit under `state`. */
function shape(
  settings: BookSettings,
  minerPaidThrough: Map<string, string>,
  parts: BookPartSet,
  fields: Fields
): BookRead {
  const { miners, notices, extractions, payments, dismissals, writeOffs, ...rest } = fields;
  const defined = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
  return {
    settings,
    state: {
      book: settings,
      miners,
      notices,
      payments,
      dismissals,
      extractions,
      minerPaidThrough,
      writeOffs,
    },
    ...(defined as Omit<Fields, keyof BookData['state']>),
    parts,
  };
}

/** A read's fields with the settings document and `meta/paid`, both always read fresh. */
export async function bookOf(ctx: ReadContext, parts: BookPartSet, fields: Fields) {
  return shape(settingsFrom(ctx.book.data), await ctx.book.minerPaidThrough(), parts, fields);
}

/** The asked parts of the whole book, and the read model docs. */
export async function readWhole(ctx: ReadContext, parts: BookPartSet): Promise<BookRead> {
  return bookOf(ctx, parts, await readSlices(ctx, parts));
}

/** The fields a read holds, `state`'s lifted out. */
function fieldsFrom(data: BookData): Fields {
  return { ...data, ...data.state } as unknown as Fields;
}

/**
 * `extra`'s parts laid over `held`. The settings (top level and `state.book` alike) and the scope
 * (which Miner, which moon) stay `held`'s: the page's prices were built for those settings.
 * `meta/paid` is `extra`'s fresher copy.
 */
export function mergeReads(held: BookRead, extra: BookRead): BookRead {
  const from = { held: fieldsFrom(held), extra: fieldsFrom(extra) };
  const fields = Object.fromEntries(
    PARTS.flatMap((part) =>
      fieldsIn(part).map(([name]) => [name, from[extra.parts.has(part) ? 'extra' : 'held'][name]])
    )
  ) as Fields;
  const { scopedMiner, minerScope, forMoon, moon, refinery } = held;
  return {
    ...shape(
      held.settings,
      extra.state.minerPaidThrough ?? new Map(),
      new Set([...held.parts, ...extra.parts]),
      fields
    ),
    ...(scopedMiner !== undefined ? { scopedMiner } : {}),
    ...(minerScope ? { minerScope } : {}),
    ...(forMoon !== undefined ? { forMoon } : {}),
    ...(moon ? { moon } : {}),
    ...(refinery ? { refinery } : {}),
  };
}
