import { useState, type ComponentType, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { BootScreen } from '@/app/BootScreen';
import { beginAddCharacterLogin } from '@/app/loginFlow';
import { db } from '@/db';
import { DataAgeBadge, LogoMark, Panel, Spinner, StatChip } from '@/components/ui';
import { characterAvatarBoxClassName } from '@/components/ui/characterAvatarBox';
import {
  Clones,
  Container,
  ICON_SIZE,
  Industry,
  Market,
  Planetary,
  Skills,
  Social,
  Wallet,
  type IconProps,
} from '@/components/ui/icons';
import {
  tabItemActiveClassName,
  tabItemClassName,
  tabItemIdleClassName,
  tabListClassName,
} from '@/components/ui/tabStyles';
import { formatAge, HOUR_MS, MINUTE_MS } from '@/lib/age';
import { formatIsk } from '@/lib/isk';

const FEATURES: { icon: ComponentType<IconProps>; key: string }[] = [
  { icon: Skills, key: 'skills' },
  { icon: Industry, key: 'industry' },
  { icon: Market, key: 'market' },
  { icon: Wallet, key: 'walletOrders' },
  { icon: Container, key: 'assets' },
  { icon: Planetary, key: 'planetary' },
  { icon: Social, key: 'social' },
  { icon: Clones, key: 'clones' },
];

/** Sample values for the hero preview only — never real character data. */
const PREVIEW = {
  name: 'Aurelia Vex',
  totalSp: (84_213_904).toLocaleString(),
  unallocatedSp: (12_500).toLocaleString(),
  wallet: 1_234_567_890.12,
  // No roman-numeral level here: the real Overview page's active-training
  // line names the skill alone (Overview.tsx reads catalog skill names,
  // never a level-suffixed one) — matching that exactly, not just its shape.
  trainingSkill: 'Gunnery',
};

/** Landing page for signed-out users: what NeoCom Desk does, and the EVE SSO login button. */
export function Login() {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);

  // Wall-clock reads for illustrative "how fresh is this" values in the
  // static preview panel — same class of impurity Overview.tsx and
  // NotificationFeedPanel.tsx already accept for the real thing. Lazy
  // initializers run once on mount rather than every render.
  const [previewFetchedAt] = useState(() => new Date(Date.now() - 2 * MINUTE_MS));
  const [previewFinishDate] = useState(() =>
    new Date(Date.now() + 4 * HOUR_MS + 12 * MINUTE_MS).toLocaleString()
  );

  // Bookmark/back-button case: a Character already exists, so the marketing
  // page is not the right thing to show — mirror App.tsx's root gate.
  const characterCount = useLiveQuery(() => db.characters.count());

  function onLogin() {
    setPending(true);
    // The add-a-character branch: nobody is signed in yet, so there is no
    // grant to union with and the base set is the whole request (#295).
    void beginAddCharacterLogin().catch(() => setPending(false));
  }

  if (characterCount === undefined) return <BootScreen />;
  if (characterCount > 0) return <Navigate to="/characters" replace />;

  return (
    <main className="bg-bg text-text">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-6 py-4">
          <LogoMark className="size-7" />
          <span className="text-sm font-bold tracking-wide">{t('app.name')}</span>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-12 px-6 py-16 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="text-[0.6875rem] font-bold tracking-[0.14em] text-accent uppercase">
            {t('login.eyebrow')}
          </p>
          <h1 className="mt-3 text-3xl leading-tight font-semibold text-balance sm:text-4xl">
            {t('login.heading')}
          </h1>
          <p className="mt-4 max-w-md text-text-dim">{t('app.tagline')}</p>
          <div className="mt-7 flex flex-col items-start gap-3">
            <SsoButton pending={pending} onClick={onLogin} label={t('login.button')} />
            <span className="text-[0.6875rem] text-text-faint">{t('login.trustLine')}</span>
          </div>
          <p className="mt-6 max-w-md text-[0.6875rem] text-text-faint">
            {t('login.permissionsHint')}
          </p>
        </div>

        <div
          role="group"
          aria-labelledby="login-preview-label"
          className="relative rounded-xs border border-line bg-panel/85 p-4 shadow-[0_0_60px_-20px_rgba(87,199,244,0.25)] backdrop-blur-sm"
        >
          <span
            id="login-preview-label"
            className="absolute -top-3 right-4 bg-bg px-1.5 text-[0.625rem] tracking-widest text-text-faint uppercase"
          >
            {t('login.previewLabel')}
          </span>

          <div className="flex flex-wrap items-center gap-3 border-b border-line pb-3">
            <div
              aria-hidden="true"
              className={`${characterAvatarBoxClassName('lg')} border-line bg-panel-2`}
            />
            <div className="min-w-0 flex-1 basis-48">
              <p className="truncate text-sm font-semibold tracking-widest uppercase">
                {PREVIEW.name}
              </p>
              <p className="truncate text-xs text-text-dim">{t('login.previewCorp')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatChip label={t('skills.totalSp')} value={PREVIEW.totalSp} />
              <StatChip label={t('skills.unallocatedSp')} value={PREVIEW.unallocatedSp} />
            </div>
          </div>

          <div className={`${tabListClassName} mt-3`}>
            <span className={`${tabItemClassName} ${tabItemActiveClassName}`}>
              {t('nav.overview')}
            </span>
            <span className={`${tabItemClassName} ${tabItemIdleClassName}`}>{t('nav.clones')}</span>
            <span className={`${tabItemClassName} ${tabItemIdleClassName}`}>
              {t('nav.employmentHistory')}
            </span>
          </div>

          <div className="mt-3 flex flex-col gap-2">
            <Panel title={t('overview.wallet')} actions={<DataAgeBadge date={previewFetchedAt} />}>
              <p className="text-lg font-medium tabular-nums text-isk-pos">
                {formatIsk(PREVIEW.wallet, 2)} {t('overview.isk')}
              </p>
            </Panel>

            <Panel title={t('overview.queue')} actions={<DataAgeBadge date={previewFetchedAt} />}>
              <p className="text-sm">
                {t('overview.training', { name: PREVIEW.trainingSkill })}
                <span className="ml-2 text-xs text-text-dim">
                  {t('overview.finishes', { date: previewFinishDate })}
                </span>
              </p>
            </Panel>

            <Panel title={t('overview.notifications')}>
              <ul className="divide-y divide-line">
                <PreviewNotification
                  title={t('notifications.fired.skillLevelComplete.title')}
                  body={t('notifications.fired.skillLevelComplete.body', {
                    character: PREVIEW.name,
                    skill: 'Gunnery',
                    level: 'IV',
                  })}
                  ageMs={5 * MINUTE_MS}
                />
                <PreviewNotification
                  title={t('notifications.fired.industryJobComplete.title')}
                  body={t('notifications.fired.industryJobComplete.body', {
                    character: PREVIEW.name,
                    item: 'Depleted Uranium Charge M ×500',
                  })}
                  ageMs={2 * HOUR_MS}
                />
              </ul>
            </Panel>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16">
        <h2 className="text-xl font-semibold">{t('login.featuresHeading')}</h2>
        <div className="mt-6 border-t border-line">
          {FEATURES.map(({ icon: Icon, key }) => (
            <div key={key} className="flex flex-wrap items-center gap-4 border-b border-line py-4">
              <Icon size={ICON_SIZE.lg} className="shrink-0 text-accent" />
              <span className="w-44 shrink-0 text-sm font-semibold">
                {t(`login.features.${key}.name`)}
              </span>
              <span className="flex-1 text-sm text-text-dim">
                {t(`login.features.${key}.desc`)}
              </span>
              <span className="rounded-xs border border-line bg-panel-2 px-2 py-0.5 text-[0.6875rem] text-text-dim">
                {t(`login.features.${key}.tag`)}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-line px-6 py-14 text-center">
        <h2 className="text-2xl font-semibold">{t('login.bottomCtaHeading')}</h2>
        <div className="mt-6 flex justify-center">
          <SsoButton pending={pending} onClick={onLogin} label={t('login.button')} />
        </div>
      </section>

      <footer className="flex flex-wrap justify-center gap-6 px-6 py-6 text-[0.75rem] text-text-faint">
        <span>{t('login.footerMultiChar')}</span>
        <span>{t('login.footerOffline')}</span>
        <a
          href="https://github.com/shawndibble/neocom-desk"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-text-dim hover:underline"
        >
          {t('login.footerOpenSource')}
        </a>
      </footer>
    </main>
  );
}

function SsoButton({
  pending,
  onClick,
  label,
}: {
  pending: boolean;
  onClick: () => void;
  label: string;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex h-11 items-center gap-2 rounded-xs border border-line-bright bg-black px-5 text-sm font-semibold tracking-wider text-white transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40"
    >
      {pending ? (
        <Spinner size="sm" label={t('common.loading')} />
      ) : (
        <span aria-hidden="true" className="text-accent">
          ▶
        </span>
      )}
      {label}
    </button>
  );
}

function PreviewNotification({
  title,
  body,
  ageMs,
}: {
  title: ReactNode;
  body: ReactNode;
  ageMs: number;
}) {
  const { t } = useTranslation();
  // eslint-disable-next-line react-hooks/purity -- illustrative fired-at stamp, same as previewFetchedAt above
  const firedAt = new Date(Date.now() - ageMs);
  return (
    <li className="flex items-start gap-3 py-2 first:pt-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-text-dim">{body}</p>
      </div>
      <time
        dateTime={firedAt.toISOString()}
        title={firedAt.toLocaleString()}
        className="shrink-0 pt-0.5 text-[0.6875rem] tabular-nums text-text-dim"
      >
        {formatAge(ageMs, t)}
      </time>
    </li>
  );
}
