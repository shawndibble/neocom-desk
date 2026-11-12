import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoMark } from '@/components/ui';

/** The public apply page's frame: a visitor with no account sees the mark, not the rail. */
export function VettingPublicFrame({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <LogoMark className="size-6" />
        <span className="text-sm font-semibold tracking-wide">{t('app.name')}</span>
      </header>
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">{children}</main>
    </div>
  );
}

/** The apply page's one `<h1>`: the corporation applied to, and a line on where the pilot is. */
export function ApplyHeading({ name, ticker, sub }: { name: string; ticker: string; sub: string }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      <h1 className="text-xl font-semibold">
        {t('vetting.apply.heading', { corp: name })}{' '}
        {ticker && <span className="text-text-dim">[{ticker}]</span>}
      </h1>
      <p className="text-sm text-text-dim">{sub}</p>
    </div>
  );
}

/** Numbered steps: "How it works" and "What happens next". */
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
