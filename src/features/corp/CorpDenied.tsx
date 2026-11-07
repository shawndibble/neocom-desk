/**
 * The `/corp*` routes' denied-access state. A Character whose Corporation
 * Permission was never granted (or whose roles cannot be judged without it) is
 * told which role the route needs and offered the Grant here — the corp nav
 * item is hidden for them, so this page is often their only way in besides
 * Settings. `none` and a capability miss on an already-granted Character keep
 * the route's own copy, with no Grant, because granting would change nothing.
 * Nor would it for a Character in a known NPC corporation, whatever the
 * reason: they are told so instead (issue #6009).
 */
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, NeedsConnection } from '@/components/ui';
import { beginEveLogin } from '@/app/loginFlow';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { npcCorporationText, useActiveNpcCorporation } from './useActiveNpcCorporation';
import type { CorpDenialReason } from './useCorpRouteGate';

interface CorpDeniedProps {
  reason: CorpDenialReason;
  /** The route's own explanation, already translated — used when a Grant would not help. */
  title: string;
  hint: string;
  /** Which role the route needs, already translated — shown above the Grant. */
  roleLine: string;
}

export function CorpDenied({ reason, title, hint, roleLine }: CorpDeniedProps) {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const npc = useActiveNpcCorporation();

  if (npc != null) {
    return <EmptyState title={t('corp.officerPagesTitle')} hint={npcCorporationText(t, npc)} />;
  }
  const grantable = reason === 'not-granted' || reason === 'roles-without-grant';
  if (!grantable || activeCharacterId === null) return <EmptyState title={title} hint={hint} />;
  // Not until the corporation is known: an NPC pilot must never see the Grant flash in.
  if (npc === undefined) return null;

  return (
    <EmptyState
      title={t('corp.officerPagesTitle')}
      hint={t('corp.notGrantedHint', { roles: roleLine })}
      action={
        <NeedsConnection>
          <Button
            variant="primary"
            onClick={() => void beginEveLogin({ characterId: activeCharacterId, groups: ['corp'] })}
          >
            {t('corp.notGrantedAction')}
          </Button>
        </NeedsConnection>
      }
    />
  );
}
