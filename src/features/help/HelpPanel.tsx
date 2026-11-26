import { ExternalLink } from '@/components/ui/ExternalLink';
import { Trans, useTranslation } from 'react-i18next';
import { Panel } from '@/components/ui';
import { DISCORD_URL, REPO_URL } from '@/lib/links';

const PROSE = 'space-y-3 text-sm';

export function HelpPanel() {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <Panel title={t('settings.help.communityTitle')}>
        <div className={PROSE}>
          <p>
            <Trans
              i18nKey="settings.help.communityBody"
              components={{
                discord: <ExternalLink href={DISCORD_URL} />,
              }}
            />
          </p>
          <p className="text-text-dim">{t('settings.help.communityHint')}</p>
        </div>
      </Panel>

      <Panel title={t('settings.help.sourceTitle')}>
        <div className={PROSE}>
          <p>
            <Trans
              i18nKey="settings.help.sourceBody"
              components={{
                repo: <ExternalLink href={REPO_URL} />,
              }}
            />
          </p>
          <p className="text-text-dim">{t('settings.help.sourceHint')}</p>
        </div>
      </Panel>

      <Panel title={t('settings.help.thanksTitle')}>
        <div className={PROSE}>
          <p>
            <Trans
              i18nKey="settings.help.thanksBody"
              components={{ pilot: <span className="font-semibold text-text" /> }}
            />
          </p>
          <p className="text-text-dim">{t('settings.help.thanksHint')}</p>
        </div>
      </Panel>
    </div>
  );
}
