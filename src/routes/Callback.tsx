import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { clearRetryBudget } from '@/auth/session';
import { beginAddCharacterLogin, retryLastLogin } from '@/app/loginFlow';
import { Button, NeedsConnection, Panel, Spinner, buttonClassName } from '@/components/ui';
import { callbackRun, type ErrorKind } from './callbackRun';

const MESSAGE_KEY: Record<Exclude<ErrorKind, null>, string> = {
  'no-login-in-progress': 'callback.errorSpent',
  'state-mismatch': 'callback.errorMismatch',
  denied: 'callback.errorDenied',
  offline: 'callback.errorOffline',
  generic: 'callback.errorMessage',
};

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
            <div className="flex flex-wrap gap-2">
              <NeedsConnection>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    clearRetryBudget();
                    void retryLastLogin()
                      .then((restarted) => (restarted ? undefined : beginAddCharacterLogin()))
                      .catch(() => setErrorKind('generic'));
                  }}
                >
                  {t('callback.retry')}
                </Button>
              </NeedsConnection>
              <Link to="/" className={buttonClassName({ size: 'sm' })}>
                {t('notFound.home')}
              </Link>
            </div>
          </div>
        </Panel>
      )}
    </main>
  );
}
