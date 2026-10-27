import * as Icon from '@/components/ui/icons';
import type { MakeMethod, MakeOrBuy } from '@/engine/industry/makeOrBuy';
import { formatIsk } from '@/lib/isk';
import { formatCount } from '@/lib/formatCount';

/** Structural, not i18next's TFunction, so this stays easy to pass around without fighting its generics. */
export type Translate = (key: string, opts?: Record<string, unknown>) => string;

/** The "build" glyph per method — a fourth method needs an entry here, never another ternary branch at a call site. */
export const BUILD_GLYPH: Record<MakeMethod, typeof Icon.Build> = {
  manufacturing: Icon.Build,
  planetary: Icon.Planetary,
  reaction: Icon.Reaction,
};

/**
 * The prose behind a make-or-buy verdict: both unit prices, at ME, and — when
 * there is a remainder left to spend the difference on — what it's worth.
 * Shared by the advice-only marker below and the build-here toggle in the
 * materials column, so a row's tooltip and its control never say something
 * different about the same number.
 */
export function makeOrBuyVerdict(advice: MakeOrBuy, t: Translate): string {
  return t('industry.makeOrBuy.suggestion', {
    verdict: t(`industry.makeOrBuy.${advice.verdict === 'build' ? 'actionBuild' : 'actionBuy'}`),
  });
}

/**
 * The reasoning under the verdict: the two unit prices the call turns on, and
 * what the gap is worth. Deliberately terse fragments rather than sentences —
 * this is read at a glance off a hover, where a paragraph is worse than a
 * comparison. One string per method, not one per method-and-verdict: the
 * verdict is the heading now, so the numbers no longer have to restate it.
 */
export function makeOrBuyReason(advice: MakeOrBuy, remaining: number, t: Translate): string {
  const method =
    advice.method === 'manufacturing'
      ? 'Manufacturing'
      : advice.method === 'reaction'
        ? 'Reaction'
        : 'Planetary';
  const parts = [
    // Two decimals on the unit prices, unlike the whole-ISK columns beside
    // them: the verdict turns on the gap between these two numbers, and
    // rounding a 5.4-vs-5.6 call to "5 against 5" would make it unreadable.
    t(`industry.makeOrBuy.reason${method}`, {
      make: formatIsk(advice.makeUnitPrice, 2),
      buy: formatIsk(advice.buyUnitPrice, 2),
      me: advice.me,
    }),
  ];
  // Already inside the build price above — named so a "buy" verdict on a
  // cheap recipe reads as the blueprint's doing, not a pricing error.
  if (advice.blueprintCost > 0) {
    parts.push(t('industry.makeOrBuy.blueprintCost', { amount: formatIsk(advice.blueprintCost) }));
  }
  // Nothing is riding on a fully owned row: there is no remainder to spend
  // the difference on either way.
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

/** Plain text for an accessible name, which cannot take a node. */
export function makeOrBuyLabel(advice: MakeOrBuy, remaining: number, t: Translate): string {
  return `${makeOrBuyVerdict(advice, t)}. ${makeOrBuyReason(advice, remaining, t)}`;
}
