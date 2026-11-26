import { useTranslation } from 'react-i18next';
import { InfoTooltip } from '@/components/ui';
import type { RecipeComparison } from '@/engine/pi/planRecipes';
import { formatIsk } from '@/lib/isk';
import { PiProductLink } from './PiProductLink';
import { Sentence } from './sentence';

export function ComparisonText({
  comparison,
  referenceText,
}: {
  comparison: RecipeComparison;
  referenceText: string;
}) {
  const { t } = useTranslation();
  const { verdict, isReference, versus } = comparison;
  const type = t(`pi.planetType.${versus.planetType}`);
  return (
    <>
      {isReference ? (
        referenceText
      ) : (
        <Sentence
          text={t(`piPlan.find.cmp.${verdict}`, { item: '{item}', type })}
          slots={{ item: <PiProductLink typeId={versus.typeId}>{versus.name}</PiProductLink> }}
        />
      )}
      {'\u00a0'}
      <InfoTooltip
        glyph="info"
        className="align-middle"
        label={t('piPlan.find.cmpHintLabel', { item: versus.name })}
        content={t('piPlan.find.cmpHint', {
          item: versus.name,
          isk: formatIsk(versus.iskPerDay, 0),
          type,
        })}
      />
    </>
  );
}
