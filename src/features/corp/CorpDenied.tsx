/**
 * The `/corp*` routes' denied-access state. A Character whose Corporation
 * Permission was never granted (or whose roles cannot be judged without it) is
 * told so and offered the Grant here — the corp nav item is hidden for them,
 * so this page is often their only way in besides Settings. `none` and a
 * capability miss on an already-granted Character keep the route's own copy,
 * with no Grant, because granting would change nothing.
 */
import { useTranslation } from 'react-i18next';
import { Button, EmptyState } from '@/components/ui';
import { beginEveLogin } from '@/app/loginFlow';
import { useActiveCharacter } from '@/stores/activeCharacter';
import type { CorpDenialReason } from './useCorpRouteGate';

interface CorpDeniedProps {
  reason: CorpDenialReason;
  /** The route's own explanation, already translated — used when a Grant would not help. */
  title: string;
  hint: string;
}

export function CorpDenied({ reason, title, hint }: CorpDeniedProps) {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);

  const grantable = reason === 'not-granted' || reason === 'roles-without-grant';
  if (!grantable || activeCharacterId === null) return <EmptyState title={title} hint={hint} />;

  return (
    <EmptyState
      title={t('corp.notGrantedTitle')}
      hint={t('corp.notGrantedHint')}
      action={
        <Button
          variant="primary"
          onClick={() => void beginEveLogin({ characterId: activeCharacterId, groups: ['corp'] })}
        >
          {t('corp.notGrantedAction')}
        </Button>
      }
    />
  );
}
