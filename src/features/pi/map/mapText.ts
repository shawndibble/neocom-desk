/**
 * The words the Map speaks about a product, in one place: the tile's tooltip,
 * its accessible name and the detail panel all read the same sentence, so what
 * a sighted pointer user sees and what a screen reader hears cannot drift.
 */
import type { TFunction } from 'i18next';
import type { PlanetType } from '@/engine/pi/goalTypes';
import { formatIsk } from '@/lib/isk';
import { withArticle } from '../article';
import { chainFigureSentence } from '../chainEstimateText';
import type { MapProduct, MapTier, ProductFigure } from './mapModel';

export const planetName = (t: TFunction, type: PlanetType): string => t(`pi.planetType.${type}`);

export const tierName = (t: TFunction, tier: MapTier): string => t(`piMap.tier.${tier}.name`);

/** "Refined (P2)". */
export const tierWithCode = (t: TFunction, tier: MapTier): string =>
  t('piMap.tierWithCode', { name: tierName(t, tier), tier });

/** The ▲ ≈ ▼ glyph a figure carries, or null when it has no verdict to show. */
export function verdictGlyph(figure: ProductFigure): '▲' | '≈' | '▼' | null {
  if (figure.kind !== 'ranked') return null;
  if (figure.isReference || figure.verdict === 'same') return '≈';
  if (figure.verdict === 'better') return '▲';
  if (figure.verdict === 'worse') return '▼';
  return null;
}

/** "Better than Proteins, the simplest product on Ice planets", or why there is no comparison. */
export function comparisonSentence(t: TFunction, figure: ProductFigure): string {
  if (figure.kind !== 'ranked') {
    // The chain estimate's own sentence follows and says what the figure is.
    if (figure.chain) return t('piMap.unranked.tierChain');
    return t(`piMap.unranked.${figure.reason}`);
  }
  const type = planetName(t, figure.useType);
  if (figure.isReference) return t('piMap.cmp.reference', { type });
  if (figure.verdict === null || figure.versus === null) return t('piMap.cmp.none');
  return t(`piMap.cmp.${figure.verdict}`, { name: figure.versus.name, type });
}

/**
 * "About 717,234 ISK a day from one Barren planet", a P3/P4's chain estimate
 * sentence, or null when there is no figure.
 * Whole ISK, not shorthand: the tile and the phone row show the shorthand, and
 * this sentence is where their exact figure lives (tooltip, accessible name).
 */
export function figureSentence(t: TFunction, figure: ProductFigure): string | null {
  if (figure.kind !== 'ranked') return figure.chain ? chainFigureSentence(t, figure.chain) : null;
  const sentence = t('piMap.figure', {
    isk: formatIsk(figure.iskPerDay, 0),
    type: planetName(t, figure.useType),
  });
  return figure.needsCcLevel
    ? `${sentence}. ${t('piMap.needsCc', { level: figure.needsCcLevel })}`
    : sentence;
}

/** What a screen reader hears for a product tile: name, tier, comparison, figure, and its marks. */
export function productAccessibleName(
  t: TFunction,
  product: MapProduct,
  figure: ProductFigure,
  marks: { rank: number | null; unlockedBy: PlanetType | null; traced: boolean }
): string {
  const parts: string[] = [product.name, tierWithCode(t, product.tier)];
  if (product.tier === 0) {
    parts.push(
      t('piMap.rawYields', { types: product.hosts.map((type) => planetName(t, type)).join(', ') })
    );
  } else {
    parts.push(comparisonSentence(t, figure));
    const money = figureSentence(t, figure);
    if (money) parts.push(money);
  }
  if (marks.rank !== null) parts.push(t('piMap.pickMark', { rank: marks.rank }));
  if (marks.unlockedBy) {
    parts.push(t('piMap.unlockedMark', { aType: withArticle(planetName(t, marks.unlockedBy)) }));
  }
  if (marks.traced) parts.push(t('piMap.tracedMark'));
  return parts.join('. ');
}
