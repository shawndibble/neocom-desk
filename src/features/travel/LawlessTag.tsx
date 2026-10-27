import { useTranslation } from 'react-i18next';
import { HintText } from '@/components/ui/HintText';

/** Route Safety's marker for a system under a lawless insurgency (issue #2870). */
export function LawlessTag() {
  const { t } = useTranslation();
  return (
    <HintText
      content={t('travel.lawlessHint')}
      className="text-[0.6875rem] whitespace-nowrap text-warning"
    >
      {t('travel.lawless')}
    </HintText>
  );
}
