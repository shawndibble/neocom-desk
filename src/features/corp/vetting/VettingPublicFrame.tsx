import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { LogoMark } from '@/components/ui';

export function VettingPublicFrame({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-dvh bg-bg text-text">
      <header className="border-b border-line px-4 py-3">
        <Link to="/" className="inline-flex items-center gap-2">
          <LogoMark className="size-6" />
          <span className="text-sm font-semibold tracking-wide">{t('app.name')}</span>
        </Link>
      </header>
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">{children}</main>
    </div>
  );
}

export function ApplyHeading({ name, ticker, sub }: { name: string; ticker: string; sub: string }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      <h1 className="text-xl font-semibold tracking-widest uppercase">
        {t('vetting.apply.heading', { corp: name })}{' '}
        {ticker && <span className="text-text-dim">[{ticker}]</span>}
      </h1>
      <p className="text-sm text-text-dim">{sub}</p>
    </div>
  );
}

export function VettingSteps({ steps }: { steps: readonly string[] }) {
  return (
    <ol className="space-y-2 text-sm">
      {steps.map((step, index) => (
        <li key={step} className="grid grid-cols-[1.5rem_1fr] gap-2">
          <span className="font-semibold text-text-dim tabular-nums">{index + 1}</span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}
