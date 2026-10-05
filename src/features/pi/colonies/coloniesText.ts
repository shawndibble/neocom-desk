import type { TFunction } from 'i18next';
import type { QuickWin } from '@/engine/pi/planAdvice';
import { planColonyAnchor } from '../planAdviceModel';
import { hoursLabel } from './coloniesFormat';

/** One quick win as a sentence, with the verb a pilot would do it with. */
export function quickWinLine(
  win: QuickWin,
  typeNames: ReadonlyMap<number, string>,
  t: TFunction
): { verb: 'restart' | 'fix' | 'haul' | 'add'; text: string } {
  const { detail } = win;
  const nameOf = (id: number | null) =>
    (id !== null && typeNames.get(id)) || t('pi.unknownProduct');
  switch (detail.kind) {
    case 'restart':
      return {
        verb: 'restart',
        text: t(
          detail.reason === 'stopped'
            ? 'piColonies.fix.restartStopped'
            : 'piColonies.fix.restartDecayed',
          {
            count: detail.extractors,
            product: detail.resourceTypeIds.map((id) => nameOf(id)).join(', '),
          }
        ),
      };
    case 'idle-factories':
      return {
        verb: 'fix',
        text: t(detail.headsToAdd ? 'piColonies.fix.idleWithHeads' : 'piColonies.fix.idle', {
          count: detail.pinCount,
          heads: detail.headsToAdd ?? 0,
        }),
      };
    case 'storage':
      return {
        verb: 'haul',
        text: t('piColonies.fix.storage', { in: hoursLabel(detail.hoursToFull) }),
      };
    case 'spare-room':
      return {
        verb: 'add',
        text:
          detail.what === 'extractors'
            ? t('piColonies.fix.roomExtractors', { count: detail.extraEcus })
            : t('piColonies.fix.roomFactories', {
                count: detail.factories,
                product: nameOf(detail.productTypeId),
              }),
      };
  }
}

/** `plan#plan-<slug>`: the card Plan gives this colony. */
export function planColonyHref(name: string | null, planetId: number): string {
  return `/planetary-industry/plan#${planColonyAnchor(name, planetId)}`;
}
