import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { clearRetryBudget } from '@/auth/session';
import { beginAddCharacterLogin, retryLastLogin } from '@/app/loginFlow';
import { Button, NeedsConnection, Panel, Spinner } from '@/components/ui';
import { callbackRun, type ErrorKind } from './callbackRun';

const MESSAGE_KEY: Record<Exclude<ErrorKind, null>, string> = {
  'no-login-in-progress': 'callback.errorSpent',
  'state-mismatch': 'callback.errorMismatch',
  denied: 'callback.errorDenied',
  offline: 'callback.errorOffline',
  generic: 'callback.errorMessage',
};

/**
 * EVE SSO redirect target. Exchanges the code exactly once — the login inside
 * `addCharacter` consumes the one-time PKCE stash, so every mount of this URL
 * (StrictMode's second effect, or a remount of the route) shares one run.
 *
 * A failure restarts the sign-in once by itself before it is reported at all
 * (issue #649; the decision log has the why). Two rules that are not obvious
 * from the code: the panel is never skipped for a user who already has
 * Characters, since landing them on `/characters` would read as success and
 * hide that the Character they were adding is missing; and a `?error=` from
 * SSO is terminal, because the commonest one is the user pressing Cancel and
 * retrying it bounces them straight back to EVE.
 *
 * The panel never carries the thrown Error's own text, which may hold an
 * ESI/PKCE internal detail.
 */
export function Callback() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { search } = useLocation();
  const [errorKind, setErrorKind] = useState<ErrorKind>(null);

  useEffect(() => {
    let live = true;
    void callbackRun(search, navigate).then((kind) => {
      if (live && kind !== null) setErrorKind(kind);
    });
    return () => {
      live = false;
    };
  }, [search, navigate]);

  return (
    <main className="flex safe-inset min-h-dvh [--safe-x:1.5rem] [--safe-y:1.5rem] items-center justify-center bg-bg text-text">
      {errorKind === null ? (
        <div className="flex items-center gap-3 text-sm text-text-dim">
          <Spinner size="sm" label={t('common.loading')} />
          {t('callback.completing')}
        </div>
      ) : (
        <Panel title={t('callback.errorTitle')} className="w-full max-w-sm">
          <div role="alert" className="space-y-3">
            <p className="text-sm text-danger">{t(MESSAGE_KEY[errorKind])}</p>
            <NeedsConnection>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  // A user-initiated retry is not one of the automatic ones.
                  clearRetryBudget();
                  // Add Character only when this tab has no record of what the
                  // failed login was for.
                  void retryLastLogin()
                    .then((restarted) => (restarted ? undefined : beginAddCharacterLogin()))
                    .catch(() => setErrorKind('generic'));
                }}
              >
                {t('callback.retry')}
              </Button>
            </NeedsConnection>
          </div>
        </Panel>
      )}
    </main>
  );
}
