/**
 * What the Overview and Miners tabs render (issue #5259): the figures `buildBookView` decided
 * from the whole book, and the Overview's Extraction schedule. The server's read-model docs
 * counted calendar Statements, which no book has (decision 20261120-235011), so the tabs read
 * every figure off the Miners' Running accounts. Pure: no fetch, DOM or Dexie.
 */
import type { BookView, ExtractionRow, MinerRow, NeedsYouItem } from './bookView';
import { moonSchedule } from './bookSections';

/** The Extraction fields the Overview's schedule prints. */
export type ScheduleRow = Pick<
  ExtractionRow,
  'id' | 'structureId' | 'moonId' | 'state' | 'chunkArrivalAt' | 'expiresAt' | 'estimatedValue'
>;

export interface TabsProjection {
  miners: MinerRow[];
  totals: BookView['totals'];
  billableThrough: string | undefined;
  donationsBeforeBook: number;
  /** Days no rate covers yet: the Health strip's unrated warning. */
  unratedCount: number;
  needsYou: NeedsYouItem[];
  schedule: ReturnType<typeof moonSchedule<ScheduleRow>>;
}

const scheduleRow = (r: ScheduleRow): ScheduleRow => ({
  id: r.id,
  structureId: r.structureId,
  moonId: r.moonId,
  state: r.state,
  chunkArrivalAt: r.chunkArrivalAt,
  ...(r.expiresAt !== undefined ? { expiresAt: r.expiresAt } : {}),
  estimatedValue: r.estimatedValue,
});

/** What the Overview and Miners tabs render, from the whole-book view. */
export function tabsProjection(view: BookView): TabsProjection {
  return {
    miners: view.miners,
    totals: view.totals,
    billableThrough: view.billableThrough,
    donationsBeforeBook: view.donationsBeforeBook,
    unratedCount: view.unrated.length,
    needsYou: view.needsYou,
    schedule: moonSchedule(view.extractions.map(scheduleRow), view.input.now),
  };
}
