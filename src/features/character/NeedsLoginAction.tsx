import { useTranslation } from 'react-i18next';
import { Button, NeedsConnection } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { beginEveLogin } from '@/app/loginFlow';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { cx } from '@/lib/cx';
import { useNeedsLogin } from '@/stores/authFailure';

/**
 * "Log in again" on a Character whose login EVE refused (issue #6091): the
 * needs-login mark, shown where the Character is listed (Characters table
 * and cards, the Character switcher), with the same re-login the banner runs.
 * Renders nothing for a Character whose login works.
 */
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
