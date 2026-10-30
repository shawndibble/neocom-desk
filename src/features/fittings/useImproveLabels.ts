/**
 * How Improve words a swap: its short label, the chain of swaps behind a Make
 * Flyable fix, and a conversion's size at a glance.
 */
import { useTranslation } from 'react-i18next';
import { conversionSummary, TANK_RACKS, type ImproveOption } from '@/engine/fittings/improve';
import { catalogueTypeName, type FittingCatalogue } from './useFittingCatalogue';

export interface ImproveLabels {
  /** A type's name, as the catalogue gives it. */
  typeName: (typeId: number) => string;
  moveLabel: (candidate: ImproveOption['candidate']) => string;
  /** The swaps chained behind a Make Flyable fix, each named: what frees the CPU or powergrid it takes. */
  flyableSwaps: (candidate: ImproveOption['candidate']) => string[];
  swapLabel: (option: ImproveOption) => string;
  /** A conversion's size at a glance: what it removes and adds, and the slots it leaves empty. */
  conversionLine: (candidate: ImproveOption['candidate']) => string | null;
}

export function useImproveLabels(catalogue: FittingCatalogue | null): ImproveLabels {
  const { t } = useTranslation();
  const name = (typeId: number) => catalogueTypeName(catalogue, typeId);

  const moveLabel = (candidate: ImproveOption['candidate']) =>
    candidate.fromTypeId === null
      ? t('fittings.improve.fill', { count: candidate.at.length, to: name(candidate.toTypeId) })
      : t('fittings.improve.swap', {
          count: candidate.at.length,
          from: name(candidate.fromTypeId),
          to: name(candidate.toTypeId),
        });

  const flyableSwaps = (candidate: ImproveOption['candidate']): string[] =>
    candidate.pairedWith
      ? [moveLabel(candidate.pairedWith), ...flyableSwaps(candidate.pairedWith)]
      : [];

  const swapLabel = (option: ImproveOption) =>
    option.candidate.conversion
      ? t(`fittings.improve.convert.${option.candidate.conversion.side}`)
      : option.candidate.fixesUnflyable
        ? moveLabel({ ...option.candidate, pairedWith: undefined })
        : option.candidate.pairedWith
          ? t('fittings.improve.pair', {
              add: moveLabel({ ...option.candidate, pairedWith: undefined }),
              downgrade: moveLabel(option.candidate.pairedWith),
            })
          : moveLabel(option.candidate);

  function conversionLine(candidate: ImproveOption['candidate']): string | null {
    if (!candidate.conversion) return null;
    const summary = conversionSummary(candidate);
    const { removed, added } = summary;
    const freed = TANK_RACKS.filter((rack) => summary.freed[rack] > 0).map((rack) =>
      t(`fittings.improve.convert.freedRack.${rack}`, { count: summary.freed[rack] })
    );
    return [
      t('fittings.improve.convert.counts', { count: removed, removed, added }),
      freed.length > 0 ? t('fittings.improve.convert.freed', { slots: freed.join(', ') }) : null,
    ]
      .filter(Boolean)
      .join(' ');
  }

  return { typeName: name, moveLabel, flyableSwaps, swapLabel, conversionLine };
}
