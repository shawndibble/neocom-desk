import * as Icon from '@/components/ui/icons';
import type { MakeMethod, MakeOrBuy } from '@/engine/industry/makeOrBuy';
import { formatIsk } from '@/lib/isk';
import { formatCount } from '@/lib/formatCount';
import type { Translate } from '@/lib/translate';

export const BUILD_GLYPH: Record<MakeMethod, typeof Icon.Build> = {
  manufacturing: Icon.Build,
  planetary: Icon.Planetary,
  reaction: Icon.Reaction,
};

export function makeOrBuyVerdict(advice: MakeOrBuy, t: Translate): string {
  return t('industry.makeOrBuy.suggestion', {
    verdict: t(`industry.makeOrBuy.${advice.verdict === 'build' ? 'actionBuild' : 'actionBuy'}`),
  });
}

export function makeOrBuyReason(advice: MakeOrBuy, remaining: number, t: Translate): string {
  const method =
    advice.method === 'manufacturing'
      ? 'Manufacturing'
      : advice.method === 'reaction'
        ? 'Reaction'
        : 'Planetary';
  const parts = [
    t(`industry.makeOrBuy.reason${method}`, {
      make: formatIsk(advice.makeUnitPrice, 2),
      buy: formatIsk(advice.buyUnitPrice, 2),
      me: advice.me,
    }),
  ];
  if (advice.blueprintCost > 0) {
    parts.push(t('industry.makeOrBuy.blueprintCost', { amount: formatIsk(advice.blueprintCost) }));
  }
  if (remaining > 0 && advice.savings > 0) {
    parts.push(
      t('industry.makeOrBuy.savings', {
        amount: formatIsk(advice.savings),
        quantity: formatCount(remaining),
      })
    );
  }
  return parts.join(' ');
}

export function makeOrBuyLabel(advice: MakeOrBuy, remaining: number, t: Translate): string {
  return `${makeOrBuyVerdict(advice, t)}. ${makeOrBuyReason(advice, remaining, t)}`;
}
