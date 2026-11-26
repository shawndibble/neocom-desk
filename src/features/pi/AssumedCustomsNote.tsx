import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { PLAN_CUSTOMS_HREF, PLAN_PATH } from './piPlanLink';
import { customsRatePercent } from './customsRate';
import { ASSUMED_UNKNOWN_CUSTOMS } from './colonyCustoms';

export function AssumedCustomsNote({
  names,
  className,
}: {
  names: readonly string[];
  className?: string;
}) {
  const { t } = useTranslation();
  const onPlan = useLocation().pathname.startsWith(PLAN_PATH);
  if (names.length === 0) return null;
  return (
    <p
      className={`flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-warning ${className ?? ''}`}
    >
      <Icon.Warn aria-hidden="true" size={Icon.ICON_SIZE.sm} />
      <span>
        {t('piPlan.customsAssumedNote', {
          names: names.join(', '),
          percent: customsRatePercent(ASSUMED_UNKNOWN_CUSTOMS),
        })}
      </span>
      <Link className={inlineLinkClassName} to={PLAN_CUSTOMS_HREF}>
        {t(onPlan ? 'piPlan.customsSetInPlanner' : 'piPlan.customsSetOnPlan')}
      </Link>
    </p>
  );
}
