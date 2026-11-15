/**
 * A Shared Pop's detail modal and its Survey start link (issue #6224). Imported by the Calendar
 * route only: `startLink.ts` reaches the Survey store and so Firebase, which the boot graph that
 * `calendarBoardData.ts` sits in must not (`bootImportGraph.test.ts`).
 */
import type { RowDetailModel } from '@/features/overview/widgets/data/types';
import { startLinkPath } from '@/features/survey/startLink';
import { formatDuration } from '@/lib/duration';
import { formatCalendarTimestamp } from '@/lib/timestamp';
import type { Translate } from '@/lib/translate';
import { sharedPopTitle, type SharedPopEntry } from './calendarSharedPops';

/**
 * The Survey start link: the refinery as location, the sharing corporation as payee, the
 * book's rate. Built when shown, so a settings change reaches every link.
 */
export function sharedPopStartLink(entry: SharedPopEntry): string {
  const { pop } = entry;
  return startLinkPath({
    place: {
      id: pop.structureId,
      name: pop.refineryName ?? entry.moonName ?? '',
      kind: 'structure',
    },
    payee: { id: pop.corporationId, name: '' },
    rate: pop.ratePct,
    notes: '',
  });
}

const POP_TIME_KEY = {
  ready: 'calendar.sharedPop.popTime.ready',
  'auto-fracture': 'calendar.sharedPop.popTime.autoFracture',
} as const;

/**
 * The detail modal: refinery, moon, Pop Time and countdown, ore make-up, notes, start link. Ore
 * make-up shared but not known (a moon owner's moon) reads "Unknown"; not shared, it is absent.
 */
export function sharedPopDetail(
  entry: SharedPopEntry,
  nowMs: number,
  t: Translate,
  zone: string | undefined
): RowDetailModel {
  const { pop } = entry;
  const popAtMs = Date.parse(pop.popAt);
  const popped = nowMs >= popAtMs;
  const facts = [
    ...(entry.moonName === null
      ? []
      : [{ label: t('calendar.sharedPop.moon'), value: entry.moonName }]),
    {
      label: t(POP_TIME_KEY[pop.popTime]),
      value: formatCalendarTimestamp(new Date(popAtMs), zone),
    },
    {
      label: t('calendar.sharedPop.expires'),
      value: formatCalendarTimestamp(new Date(Date.parse(pop.expiresAt)), zone),
    },
    { label: t('calendar.sharedPop.taxedBy'), value: entry.corporation.name },
    {
      label: t('calendar.sharedPop.rate'),
      value: t('calendar.sharedPop.ratePct', { rate: pop.ratePct }),
    },
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
    link: { label: t('calendar.sharedPop.startSurvey'), to: sharedPopStartLink(entry) },
  };
}
