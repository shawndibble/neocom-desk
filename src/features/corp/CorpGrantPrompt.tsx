/**
 * The one-time offer of the corp grant (issue #295).
 *
 * Corp UI hides rather than locks (CONTEXT.md round 35), which leaves a
 * Character who has just made Director with no sign that there is anything to
 * turn on. This is that sign — offered once, at the moment the state actually
 * becomes `roles-without-grant`, and then never again on its own.
 *
 * "Never again" is the whole design. A prompt that keeps returning is the
 * consent-screen bloat this ticket exists to prevent, wearing a different hat,
 * so both buttons record the dismissal: granting makes the prompt moot, and
 * declining must not be re-litigated on the next boot. The Settings Corp
 * access row is the durable path back, and the hint says so.
 */
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { beginEveLogin } from '@/app/loginFlow';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { useCorpAccess } from './useCorpAccess';
import { corpRoleLabel } from './roles';
import {
  isGrantPromptDismissed,
  useGrantPromptDismissals,
  withGrantPromptDismissed,
} from './grantPromptDismissal';

export function CorpGrantPrompt() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const access = useCorpAccess();
  const dismissals = useGrantPromptDismissals((state) => state.value);
  const hydrated = useGrantPromptDismissals((state) => state.hydrated);
  const hydrate = useGrantPromptDismissals((state) => state.hydrate);
  const setDismissals = useGrantPromptDismissals((state) => state.setValue);
  // Read, never fetched: the corporation name is a nicety this prompt borrows
  // from whatever already loaded it. Firing a public-info read of its own would
  // put an ESI request behind a banner the user may never see.
  const corporationName = usePublicInfo(
    (state) => (activeCharacterId === null ? null : state.byCharacterId[activeCharacterId]) ?? null
  )?.corporationName;

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (!hydrated || activeCharacterId === null) return null;
  // `unknown` renders as nothing, exactly as everywhere else corp state is
  // read: a banner that flickers in on a cold load is worse than one a beat
  // late, and `none`/`ready` have nothing to offer.
  if (access.state !== 'roles-without-grant') return null;
  if (isGrantPromptDismissed(dismissals, activeCharacterId)) return null;

  const remember = () => setDismissals(withGrantPromptDismissed(dismissals, activeCharacterId));

  const grant = async () => {
    // Awaited before leaving the page: `beginEveLogin` navigates away, and a
    // Dexie write racing a full page navigation can lose. Cancel at the SSO
    // screen with the write lost and this comes back — "at most once" gone.
    await remember();
    // A known Character, so the request unions with its existing grant rather
    // than replacing it (app/loginFlow.ts).
    await beginEveLogin({ characterId: activeCharacterId, groups: ['corp'] });
  };

  return (
    <div
      role="alert"
      aria-label={t('corp.grantPromptTitle')}
      // Stacked above `NotificationPermissionPrompt`, which is itself above
      // `InstallPrompt`: all three are fixed banners in the same corner, and a
      // new Director on a fresh device can plausibly meet all three at once.
      className="fixed inset-x-4 bottom-40 z-50 max-w-sm space-y-2 rounded-xs border border-line-bright bg-panel-2 px-3 py-2 text-sm shadow-lg md:bottom-28 md:left-auto"
    >
      <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {t('corp.grantPromptTitle')}
      </p>
      <p>
        {t('corp.grantPromptBody', {
          roles: access.roles.map(corpRoleLabel).join(', '),
          corporation: corporationName ?? t('corp.grantPromptUnnamedCorporation'),
        })}
      </p>
      <p className="text-xs text-text-dim">{t('corp.grantPromptHint')}</p>
      <div className="flex gap-2">
        <Button size="sm" variant="primary" onClick={() => void grant()}>
          {t('corp.grantPromptGrant')}
        </Button>
        <Button size="sm" onClick={() => void remember()}>
          {t('corp.grantPromptDismiss')}
        </Button>
      </div>
    </div>
  );
}
