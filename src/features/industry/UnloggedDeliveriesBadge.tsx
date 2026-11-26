import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { industryTabHref } from './industryTabs';
import { useUnloggedDeliveryCount } from './useJobHistory';

export function UnloggedDeliveriesBadge({
  characterId,
  blueprintTypeId,
}: {
  characterId: number;
  blueprintTypeId: number;
}) {
  const { t } = useTranslation();
  const count = useUnloggedDeliveryCount(characterId, blueprintTypeId);
  if (count === 0) return null;
  return (
    <Link
      to={`${industryTabHref('plans')}?jobs.view=history`}
      className="inline-flex w-fit items-center rounded-xs bg-warning/15 px-2 py-1 text-xs font-semibold text-warning hover:bg-warning/25"
    >
      {t('industry.planUnloggedDeliveries', { count })}
    </Link>
  );
}
