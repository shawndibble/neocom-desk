import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { beginEveLogin } from '@/app/loginFlow';

/** Landing page for signed-out users: app mark + EVE SSO login button. */
export function Login() {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);

  function onLogin() {
    setPending(true);
    void beginEveLogin().catch(() => setPending(false));
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-bg p-6 text-text">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-widest uppercase">{t('app.name')}</h1>
        <p className="max-w-sm text-sm text-text-dim">{t('app.tagline')}</p>
      </div>
      {/* Styled after the official EVE SSO dark button. */}
      <button
        type="button"
        onClick={onLogin}
        disabled={pending}
        className="inline-flex h-11 items-center gap-2 rounded-xs border border-line-bright bg-black px-5 text-sm font-semibold tracking-wider text-white transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40"
      >
        <span aria-hidden="true" className="text-accent">
          ▶
        </span>
        {t('login.button')}
      </button>
    </main>
  );
}
