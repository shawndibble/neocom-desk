import { ExternalLink } from '@/components/ui/ExternalLink';
import { Trans, useTranslation } from 'react-i18next';
import { Panel } from '@/components/ui';
import { DISCORD_URL, REPO_URL } from '@/lib/links';

/** No width cap of its own: the Help page narrows itself to a readable measure (`routes/Help.tsx`). */
const PROSE = 'space-y-3 text-sm';

const SKILLS_PATHS = [
  'settings.help.skillsQueue',
  'settings.help.skillsCertified',
  'settings.help.skillsShip',
  'settings.help.skillsFit',
  'settings.help.skillsSearch',
  'settings.help.skillsPaste',
] as const;

/**
 * Settings' Help & Support tab: Discord is the one destination for bug
 * reports, feature requests, and discussion — GitHub is for reading the
 * source or contributing a pull request, not for filing anything. Split out
 * from the FAQ tab (which now answers only "what does this app store") so a
 * pilot looking for help finds one clearly-named destination instead of
 * scrolling past a data-storage explainer first.
 */
export function HelpPanel() {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <Panel title={t('settings.help.communityTitle')}>
        <div className={PROSE}>
          {/*
            `Trans` rather than an interpolated string: the link sits mid-
            sentence, and splitting the sentence into "before"/"after" halves
            around a bare <a> is exactly the shape that becomes untranslatable
            the moment a language wants the clause in a different order.
          */}
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

      <Panel title={t('settings.help.skillsTitle')}>
        <div className={PROSE}>
          <p>{t('settings.help.skillsIntro')}</p>
          <ul className="list-disc space-y-1 pl-5">
            {SKILLS_PATHS.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
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
