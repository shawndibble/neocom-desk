import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { PLAN_CUSTOMS_HREF } from './piPlanLink';
import { customsRatePercent } from './customsRate';
import { ASSUMED_UNKNOWN_CUSTOMS } from './colonyCustoms';

/**
 * Says an ISK figure leans on the assumed customs rate, and sends the pilot to
 * where it is set (Plan's colony customs fields). Renders nothing when no figure is assumed.
 */
export function AssumedCustomsNote({
  names,
  className,
}: {
  names: readonly string[];
  className?: string;
}) {
  const { t } = useTranslation();
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
        {t('piPlan.customsSetOnPlan')}
      </Link>
    </p>
  );
}
