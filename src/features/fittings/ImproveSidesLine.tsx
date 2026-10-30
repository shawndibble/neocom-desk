import { useTranslation } from 'react-i18next';
import { bestScore, type ImproveResult } from '@/engine/fittings/improve';

interface Props {
  sides: Record<'shield' | 'armor', ImproveResult>;
  /** The options on neither side (Damage Control, hull), shown as "Either". */
  neutral?: ImproveResult;
}

/** Tank goals: what the best shield and the best armor swap would each gain, on one line. */
export function ImproveSidesLine({ sides, neutral }: Props) {
  const { t } = useTranslation();
  return (
    <p className="text-sm" data-testid="improve-sides">
      {[
        ...(['shield', 'armor'] as const).map((side) => ({
          label: t(`fittings.improve.defense.${side}`),
          score: bestScore(sides[side]),
        })),
        // Neutral rows (Damage Control, hull) help either side; shown only when there are some.
        ...(neutral && bestScore(neutral) !== null
          ? [{ label: t('fittings.improve.defense.either'), score: bestScore(neutral) }]
          : []),
      ]
        .map(({ label, score }) =>
          t('fittings.improve.sideResult', {
            side: label,
            result:
              score === null
                ? t('fittings.improve.sideNone')
                : t('fittings.improve.sideGain', { percent: Math.round(score * 100) }),
          })
        )
        .join(' · ')}
    </p>
  );
}
