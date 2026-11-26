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
  return withPop(path, pop.id);
}

export const SHARED_POP_STALE_MS = 12 * HOUR_MS;

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
  } else if (popped && sharedPopMiningState(entry) === 'likelyMinedOut') {
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
  const autoMs = pop.autoFractureAt === undefined ? NaN : Date.parse(pop.autoFractureAt);
  const fractured = pop.fractured || nowMs >= autoMs;
  const { readyAt, autoFractureAt } = pop;
  const bothTimes =
    !fractured &&
    readyAt !== undefined &&
    autoFractureAt !== undefined &&
    readyAt !== autoFractureAt
      ? { ready: readyAt, auto: autoFractureAt }
      : null;
  const fullyMined = sharedPopMiningState(entry) === 'fullyMined';
  const synced = syncedFact(pop.syncedAt, nowMs, t);
  const facts: RowDetailModel['facts'] = [
    ...(entry.moonName === null
      ? []
      : [{ label: t('calendar.sharedPop.moon'), value: entry.moonName }]),
    ...(bothTimes
      ? [
          {
            label: t(POP_TIME_KEY.ready),
            value: formatCalendarTimestamp(new Date(Date.parse(bothTimes.ready)), zone),
          },
          {
            label: t(POP_TIME_KEY['auto-fracture']),
            value: formatCalendarTimestamp(new Date(Date.parse(bothTimes.auto)), zone),
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
  const surveyOres = !oreKnown ? (entry.survey?.ores ?? []) : [];
  if (!oreKnown && surveyOres.length === 0 && pop.oreShared === true)
    facts.push({ label: t('calendar.sharedPop.ore'), value: t('calendar.sharedPop.oreUnknown') });
  return {
    title: sharedPopTitle(entry),
    status: {
      text: fullyMined
        ? t('calendar.sharedPop.fullyMined')
        : popped || fractured
          ? t(
              fractured || pop.popTime === 'auto-fracture'
                ? 'calendar.sharedPop.fractured'
                : 'calendar.sharedPop.arrived'
            )
          : t('calendar.due', { duration: formatDuration((popAtMs - nowMs) / 1000) }),
      ...(pop.notes.trim() === '' ? {} : { note: pop.notes }),
    },
    facts,
    ...(surveyOres.length > 0
      ? {
          list: {
            title: t('calendar.sharedPop.oreFromSurvey'),
            items: surveyOres.map((o) => ({
              key: o.name,
              text: o.name,
              value: t('calendar.sharedPop.orePercent', { percent: o.percent }),
            })),
          },
        }
      : entry.ore === null || entry.ore.length === 0
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
      : {
          place: {
            systemId: pop.solarSystemId,
            structureId: pop.structureId,
            name: sharedPopTitle(entry),
          },
        }),
    ...surveyLinks(entry, fullyMined, t),
  };
}

function surveyLinks(
  entry: SharedPopEntry,
  fullyMined: boolean,
  t: Translate
): Pick<RowDetailModel, 'link' | 'secondaryLink'> {
  const { pop } = entry;
  const start = { label: t('calendar.sharedPop.startSurvey'), to: sharedPopStartLink(entry) };
  if (pop.surveyId) {
    const open = { label: t('calendar.sharedPop.openSurvey'), to: `/s/${pop.surveyId}` };
    return fullyMined
      ? { link: open }
      : {
          link: open,
          secondaryLink: { label: t('calendar.sharedPop.startNewSurvey'), to: start.to },
        };
  }
  return fullyMined ? {} : { link: start };
}
