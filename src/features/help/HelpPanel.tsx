import { Trans, useTranslation } from 'react-i18next';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { Panel } from '@/components/ui';
import { DISCORD_URL, ISSUES_URL } from '@/lib/links';

const PROSE = 'max-w-2xl space-y-3 text-sm';

const LINK = inlineLinkClassName;

/**
 * Settings' Help & Support tab: report a bug, join the Discord, thank the
 * translator/artist. Split out from the FAQ tab (which now answers only "what
 * does this app store") so a pilot looking for help finds one clearly-named
 * destination instead of scrolling past a data-storage explainer first.
 */
export function HelpPanel() {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <Panel title={t('settings.help.reportTitle')}>
        <div className={PROSE}>
          {/*
            `Trans` rather than an interpolated string: the link sits mid-
            sentence, and splitting the sentence into "before"/"after" halves
            around a bare <a> is exactly the shape that becomes untranslatable
            the moment a language wants the clause in a different order.
          */}
          <p>
            <Trans
              i18nKey="settings.help.reportBody"
              components={{
                issues: (
                  <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer" className={LINK} />
                ),
              }}
            />
          </p>
          <p className="text-xs text-text-dim">{t('settings.help.reportHint')}</p>
        </div>
      </Panel>

      <Panel title={t('settings.help.communityTitle')}>
        <div className={PROSE}>
          <p>
            <Trans
              i18nKey="settings.help.communityBody"
              components={{
                discord: (
                  <a
                    href={DISCORD_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={LINK}
                  />
                ),
              }}
            />
          </p>
          <p className="text-xs text-text-dim">{t('settings.help.communityHint')}</p>
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
          <p className="text-xs text-text-dim">{t('settings.help.thanksHint')}</p>
        </div>
      </Panel>
    </div>
  );
}
