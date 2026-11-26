import { useTranslation } from 'react-i18next';
import { HintText } from '@/components/ui/HintText';
import * as Icon from '@/components/ui/icons';
import { useUnknownMutation, useUnknownMutationTip, type MutableItem } from './useUnknownMutation';

export function MutationBadge({
  items,
  fixable,
}: {
  items: readonly MutableItem[];
  fixable?: boolean;
}) {
  const { t } = useTranslation();
  const status = useUnknownMutation(items);
  const tip = useUnknownMutationTip(status, fixable);
  if (status === null) return null;
  return (
    <HintText
      content={tip}
      className="inline-flex shrink-0 items-center gap-1 text-[0.6875rem] font-semibold text-warning"
    >
      <Icon.Warn aria-hidden className="size-3" />
      {t(`fittings.mutation.badge.${status}`)}
    </HintText>
  );
}
