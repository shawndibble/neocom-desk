import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { Panel } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import {
  ICON_SIZE,
  Offline,
  OpenSource,
  ReadOnly,
  TokenPrivacy,
  type IconProps,
} from '@/components/ui/icons';
import { AUTHORIZED_APPS_URL, REPO_URL } from '@/lib/links';
import { ScopesAccordion } from './ScopesAccordion';

const TRUST: { icon: ComponentType<IconProps>; key: string }[] = [
  { icon: ReadOnly, key: 'readOnly' },
  { icon: TokenPrivacy, key: 'token' },
  { icon: Offline, key: 'offline' },
  { icon: OpenSource, key: 'openSource' },
];

export function TrustSection() {
  const { t } = useTranslation();
  return (
    <>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TRUST.map(({ icon: Icon, key }) => (
          <Panel key={key} className="border-t-2 border-t-accent">
            <Icon size={ICON_SIZE.lg} aria-hidden="true" className="text-accent" />
            <h3 className="mt-3 text-sm font-semibold">{t(`login.trust.${key}.name`)}</h3>
            <p className="mt-1 text-sm text-text-dim">{t(`login.trust.${key}.desc`)}</p>
            {key === 'openSource' && (
              <p className="mt-2 text-sm">
                <ExternalLink href={REPO_URL}>{t('login.trustRepoLink')}</ExternalLink>
              </p>
            )}
          </Panel>
        ))}
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
