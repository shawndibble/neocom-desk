/**
 * A Shared Pop's detail modal and its Survey start link (issue #6224). Imported by the Calendar
 * route only: `startLink.ts` reaches the Survey store and so Firebase, which the boot graph that
 * `calendarBoardData.ts` sits in must not (`bootImportGraph.test.ts`).
 */
import type { RowDetailModel } from '@/features/overview/widgets/data/types';
import { startLinkPath, withPop } from '@/features/survey/startLink';
import { HOUR_MS, formatAge } from '@/lib/age';
import { formatDuration } from '@/lib/duration';
import { formatCalendarTimestamp } from '@/lib/timestamp';
import type { Translate } from '@/lib/translate';
import {
  sharedPopMiningState,
  sharedPopShownAtMs,
  sharedPopTitle,
  type SharedPopEntry,
  type SharedPopTimePref,
} from './calendarSharedPops';

/**
 * The Survey start link: the refinery as location, the sharing corporation as payee, the
 * book's rate. Built when shown, so a settings change reaches every link.
 */
export function sharedPopStartLink(entry: SharedPopEntry): string {
  const { pop } = entry;
  const path = startLinkPath({
    place: {
      id: pop.structureId,
      name: pop.refineryName ?? entry.moonName ?? '',
      kind: 'structure',
    },
    payee: { id: pop.corporationId, name: '' },
    rate: pop.ratePct,
    notes: '',
  });
  // The pop rides along so the Survey this link starts is linked back to it (`SurveyStartScreen`).
  return withPop(path, pop.id);
}

/** A book that has not synced for this long may have missed a laser shot or a cancel. */
export const SHARED_POP_STALE_MS = 12 * HOUR_MS;

/** The data's age: when the sharing book last synced, flagged once it is stale. */
function syncedFact(
  syncedAt: number | null,
  nowMs: number,
  t: Translate
): RowDetailModel['facts'][number] | null {
  if (syncedAt === null) return null;
  const ageMs = Math.max(0, nowMs - syncedAt);
  const age = formatAge(ageMs, t);
  const label = t('calendar.sharedPop.synced');
  return ageMs > SHARED_POP_STALE_MS
    ? { label, value: t('calendar.sharedPop.syncedStale', { age }), tone: 'warning' }
    : { label, value: age };
}

const POP_TIME_KEY = {
  ready: 'calendar.sharedPop.popTime.ready',
  'auto-fracture': 'calendar.sharedPop.popTime.autoFracture',
} as const;

/**
 * What is known of the moon being mined out: an officer's flag, the likely-done guess, or, once
 * popped, plainly that nobody has marked it. The Survey's own state is its own fact.
 */
function miningFacts(
  entry: SharedPopEntry,
  popped: boolean,
  t: Translate,
  zone: string | undefined
): RowDetailModel['facts'] {
  const { pop, survey } = entry;
  const facts: RowDetailModel['facts'] = [];
  if (pop.fullyMined) {
    facts.push({
      label: t('calendar.sharedPop.mining'),
      value: t('calendar.sharedPop.fullyMinedBy', {
        name: pop.fullyMined.byName,
        date: formatCalendarTimestamp(new Date(Date.parse(pop.fullyMined.at)), zone),
      }),
    });
  } else if (sharedPopMiningState(entry) === 'likelyMinedOut') {
    facts.push({
      label: t('calendar.sharedPop.mining'),
      value: t('calendar.sharedPop.likelyMinedOut'),
    });
  } else if (popped && !survey?.finished) {
    facts.push({
      label: t('calendar.sharedPop.mining'),
      value: t('calendar.sharedPop.notMarkedFullyMined'),
    });
  }
  if (survey) {
    facts.push({
      label: t('calendar.sharedPop.survey'),
      value: survey.finished
        ? t('calendar.sharedPop.surveyFinished')
        : t('calendar.sharedPop.surveyLeft', { percent: survey.percentLeft }),
    });
  }
  return facts;
}

/**
 * The detail modal: refinery, moon, both Pop Times and the countdown, mining state, data age,
 * ore make-up, notes, start link. Ore make-up shared but not known (a moon owner's moon) reads
 * "Unknown"; not shared, it is absent.
 */
export function sharedPopDetail(
  entry: SharedPopEntry,
  nowMs: number,
  t: Translate,
  zone: string | undefined,
  pref: SharedPopTimePref = 'asShared'
): RowDetailModel {
  const { pop } = entry;
  const popAtMs = sharedPopShownAtMs(pop, pref);
  const popped = nowMs >= popAtMs;
  // Both Pop Times once the server publishes them and the chunk has not fractured early.
  const bothTimes =
    !pop.fractured &&
    pop.readyAt !== undefined &&
    pop.autoFractureAt !== undefined &&
    pop.readyAt !== pop.autoFractureAt;
  const synced = syncedFact(pop.syncedAt, nowMs, t);
  const facts: RowDetailModel['facts'] = [
    ...(entry.moonName === null
      ? []
      : [{ label: t('calendar.sharedPop.moon'), value: entry.moonName }]),
    ...(bothTimes
      ? [
          {
            label: t(POP_TIME_KEY.ready),
            value: formatCalendarTimestamp(new Date(Date.parse(pop.readyAt!)), zone),
          },
          {
            label: t(POP_TIME_KEY['auto-fracture']),
            value: formatCalendarTimestamp(new Date(Date.parse(pop.autoFractureAt!)), zone),
          },
        ]
      : [
          {
            label: t(POP_TIME_KEY[pop.popTime]),
            value: formatCalendarTimestamp(new Date(popAtMs), zone),
          },
        ]),
    {
      label: t('calendar.sharedPop.expires'),
      value: formatCalendarTimestamp(new Date(Date.parse(pop.expiresAt)), zone),
    },
    ...miningFacts(entry, popped, t, zone),
    { label: t('calendar.sharedPop.taxedBy'), value: entry.corporation.name },
    {
      label: t('calendar.sharedPop.rate'),
      value: t('calendar.sharedPop.ratePct', { rate: pop.ratePct }),
    },
    ...(synced ? [synced] : []),
  ];
  const oreKnown = entry.ore !== null && entry.ore.length > 0;
  if (!oreKnown && pop.oreShared === true)
    facts.push({ label: t('calendar.sharedPop.ore'), value: t('calendar.sharedPop.oreUnknown') });
  return {
    title: sharedPopTitle(entry),
    status: {
      badge: t(POP_TIME_KEY[pop.popTime]),
      tone: popped ? 'success' : 'neutral',
      text: popped
        ? t(
            pop.fractured || pop.popTime === 'auto-fracture'
              ? 'calendar.sharedPop.fractured'
              : 'calendar.sharedPop.arrived'
          )
        : t('calendar.due', { duration: formatDuration((popAtMs - nowMs) / 1000) }),
      ...(pop.notes.trim() === '' ? {} : { note: pop.notes }),
    },
    facts,
    ...(entry.ore === null || entry.ore.length === 0
      ? {}
      : {
          list: {
            title: t('calendar.sharedPop.ore'),
            items: entry.ore.map((line) => ({
              key: line.name,
              text: line.name,
              value: t('calendar.sharedPop.units', { count: line.quantity }),
            })),
          },
        }),
    ...(pop.solarSystemId === null
      ? {}
      : { place: { systemId: pop.solarSystemId, name: sharedPopTitle(entry) } }),
    ...(pop.surveyId
      ? {
          link: { label: t('calendar.sharedPop.openSurvey'), to: `/s/${pop.surveyId}` },
          secondaryLink: {
            label: t('calendar.sharedPop.startNewSurvey'),
            to: sharedPopStartLink(entry),
          },
        }
      : { link: { label: t('calendar.sharedPop.startSurvey'), to: sharedPopStartLink(entry) } }),
  };
}
