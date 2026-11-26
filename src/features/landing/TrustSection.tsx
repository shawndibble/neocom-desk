import { useTranslation } from 'react-i18next';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { Panel } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { AUTHORIZED_APPS_URL, REPO_URL } from '@/lib/links';
import { hudLabelClassName } from './hudLabel';
import { ScopesAccordion } from './ScopesAccordion';

const WRITE_ITEMS = ['mail', 'calendar', 'send', 'fitting', 'waypoints', 'window'] as const;

function Eyebrow({ children }: { children: string }) {
  return <p className={`${hudLabelClassName} text-[0.6875rem] text-accent`}>{children}</p>;
}

export function TrustSection() {
  const { t } = useTranslation();
  return (
    <>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Panel className="border-t-2 border-t-accent">
          <Eyebrow>{t('login.trust.reads.eyebrow')}</Eyebrow>
          <h3 className="mt-2 text-lg leading-tight font-semibold text-balance">
            {t('login.trust.reads.name')}
          </h3>
          <p className="mt-2.5 text-sm text-text-dim">{t('login.trust.reads.desc')}</p>
        </Panel>
        <Panel className="border-t-2 border-t-accent">
          <Eyebrow>{t('login.trust.writes.eyebrow')}</Eyebrow>
          <h3 className="mt-2 text-lg leading-tight font-semibold text-balance">
            {t('login.trust.writes.name')}
          </h3>
          <ul className="mt-3 space-y-1.5 text-sm text-text-dim">
            {WRITE_ITEMS.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden="true" className="text-accent">
                  —
                </span>
                {t(`login.trust.writes.items.${item}`)}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm font-semibold">{t('login.trust.writes.note')}</p>
        </Panel>
        <Panel className="border-t-2 border-t-accent">
          <Eyebrow>{t('login.trust.stays.eyebrow')}</Eyebrow>
          <h3 className="mt-2 text-lg leading-tight font-semibold text-balance">
            {t('login.trust.stays.name')}
          </h3>
          <p className="mt-2.5 text-sm text-text-dim">{t('login.trust.stays.desc')}</p>
        </Panel>
        <Panel className="border-t-2 border-t-accent">
          <Eyebrow>{t('login.trust.costs.eyebrow')}</Eyebrow>
          <h3 className="mt-2 text-lg leading-tight font-semibold text-balance">
            {t('login.trust.costs.name')}
          </h3>
          <p className="mt-2.5 text-sm text-text-dim">{t('login.trust.costs.desc')}</p>
          <p className="mt-2 text-sm">
            <ExternalLink href={REPO_URL}>{t('login.trustRepoLink')}</ExternalLink>
          </p>
        </Panel>
      </div>
      <div className="mt-8 grid gap-8 lg:grid-cols-2 lg:gap-10">
        <div>
          <p className="text-sm text-text-dim">{t('login.permissionsHint')}</p>
          <div className="mt-3">
            <ScopesAccordion />
          </div>
        </div>
        <div className="space-y-3 text-sm text-text-dim lg:border-l lg:border-line lg:pl-10">
          <p>{t('login.scopes.planetsNote')}</p>
          <p>{t('login.scopes.oneLoginNote')}</p>
          <p>
            {t('login.permissionsPrivacy')}{' '}
            <a href="/privacy.html" className={inlineLinkClassName}>
              {t('login.footerPrivacy')}
            </a>
          </p>
          <p>
            {t('login.scopes.revoke')}{' '}
            <ExternalLink href={AUTHORIZED_APPS_URL}>{t('login.scopes.revokeLink')}</ExternalLink>
          </p>
        </div>
      </div>
    </>
  );
}
