import type { TFunction } from 'i18next';
import type { QuickWin } from '@/engine/pi/planAdvice';
import { planColonyAnchor } from '../planAdviceModel';
import { hoursLabel } from './coloniesFormat';

export interface QuickWinLine {
  verb: 'restart' | 'fix' | 'haul' | 'add';
  /** The sentence; a `{product}` token marks where `products` go, each a product link (`Sentence`). */
  text: string;
  products: readonly { typeId: number; name: string }[];
}

/** One quick win as a sentence, with the verb a pilot would do it with. */
export function quickWinLine(
  win: QuickWin,
  typeNames: ReadonlyMap<number, string>,
  t: TFunction
): QuickWinLine {
  const { detail } = win;
  const named = (id: number) => ({ typeId: id, name: typeNames.get(id) || t('pi.unknownProduct') });
  switch (detail.kind) {
    case 'restart':
      return {
        verb: 'restart',
        text: t(
          detail.reason === 'stopped'
            ? 'piColonies.fix.restartStopped'
            : 'piColonies.fix.restartDecayed',
          { count: detail.extractors, product: '{product}' }
        ),
        products: detail.resourceTypeIds.map(named),
      };
    case 'idle-factories':
      return {
        verb: 'fix',
        text: t(detail.headsToAdd ? 'piColonies.fix.idleWithHeads' : 'piColonies.fix.idle', {
          count: detail.pinCount,
          heads: detail.headsToAdd ?? 0,
        }),
        products: [],
      };
    case 'storage':
      return {
        verb: 'haul',
        text: t('piColonies.fix.storage', { in: hoursLabel(detail.hoursToFull) }),
        products: [],
      };
    case 'spare-room':
      return {
        verb: 'add',
        text:
          detail.what === 'extractors'
            ? t('piColonies.fix.roomExtractors', { count: detail.extraEcus })
            : t('piColonies.fix.roomFactories', {
                count: detail.factories,
                product: '{product}',
              }),
        products: detail.what === 'factories' ? [named(detail.productTypeId)] : [],
      };
  }
}

/** `plan#plan-<slug>`: the card Plan gives this colony. */
export function planColonyHref(name: string | null, planetId: number): string {
  return `/planetary-industry/plan#${planColonyAnchor(name, planetId)}`;
}
