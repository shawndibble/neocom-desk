import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { Panel } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { AUTHORIZED_APPS_URL, REPO_URL } from '@/lib/links';
import { hudLabelClassName } from './hudLabel';
import { ScopesAccordion } from './ScopesAccordion';

const WRITE_ITEMS = ['mail', 'calendar', 'send', 'fitting', 'waypoints', 'window'] as const;

function TrustCard({ id, children }: { id: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Panel padded={false} className="border-t-2 border-t-accent px-5 py-5.5">
      <p className={cx(hudLabelClassName, 'text-[0.6875rem] text-accent')}>
        {t(`login.trust.${id}.eyebrow`)}
      </p>
      <h3 className="mt-2 text-lg leading-tight font-semibold text-balance">
        {t(`login.trust.${id}.name`)}
      </h3>
      {children}
    </Panel>
  );
}

export function TrustSection() {
  const { t } = useTranslation();
  const [listOpen, setListOpen] = useState(false);
  const listId = useId();
  return (
    <>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TrustCard id="reads">
          <p className="mt-2.5 text-sm text-text-dim">{t('login.trust.reads.desc')}</p>
        </TrustCard>
        <TrustCard id="writes">
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
        </TrustCard>
        <TrustCard id="stays">
          <p className="mt-2.5 text-sm text-text-dim">{t('login.trust.stays.desc')}</p>
        </TrustCard>
        <TrustCard id="costs">
          <p className="mt-2.5 text-sm text-text-dim">{t('login.trust.costs.desc')}</p>
          <p className="mt-2 text-sm">
            <ExternalLink href={REPO_URL}>{t('login.trustRepoLink')}</ExternalLink>
          </p>
        </TrustCard>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border border-line bg-panel px-5 py-4 text-sm text-text-dim">
        <p>{t('login.permissionsBar')}</p>
        <button
          type="button"
          aria-expanded={listOpen}
          aria-controls={listId}
          onClick={() => setListOpen(!listOpen)}
          className={inlineLinkClassName}
        >
          {t(listOpen ? 'login.permissionsClose' : 'login.permissionsOpen')}
        </button>
      </div>
      <div id={listId} hidden={!listOpen} className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-10">
        <ScopesAccordion />
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
