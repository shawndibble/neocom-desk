import { useTranslation } from 'react-i18next';
import { Button, NeedsConnection } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { beginEveLogin } from '@/app/loginFlow';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { cx } from '@/lib/cx';
import { useNeedsLogin } from '@/stores/authFailure';

export function NeedsLoginAction({
  characterId,
  name,
  className,
}: {
  characterId: number;
  name: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const marked = useNeedsLogin((state) => state.value.includes(characterId));
  useHydratedStore(useNeedsLogin);
  if (!marked) return null;
  return (
    <NeedsConnection>
      <Button
        size="sm"
        variant="warning"
        aria-label={t('characters.logInAgainFor', { name })}
        onClick={() => void beginEveLogin({ characterId })}
        className={cx('shrink-0', className)}
      >
        <Icon.Warn />
        {t('characters.logInAgain')}
      </Button>
    </NeedsConnection>
  );
}
