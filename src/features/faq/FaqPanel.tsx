import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { Panel } from '@/components/ui';
import { tabPath } from '@/lib/pageTabs';
import { HELP_TABS } from '@/app/pageTabs';
import { WHAT_WE_STORE_GROUPS, WHAT_WE_STORE_NOTES } from './whatWeStore';

/**
 * `max-w-2xl` for the same reason the shortcuts list constrains itself: this is
 * prose, and prose set to the full page width at a wide viewport is measurably
 * harder to read. The page keeps one container width app-wide; content a wide
 * row would spoil narrows itself here.
 */
const PROSE = 'max-w-2xl space-y-3 text-sm';

const LINK = inlineLinkClassName;

/**
 * Settings' FAQ tab.
 *
 * One Panel per question, stacked like Settings' other sections — so a new question is
 * an addition rather than a rewrite, and each is independently linkable-to by
 * eye when someone is scanning for one answer.
 *
 * No status colours anywhere. `docs/DESIGN.md` §6 reserves those for meaning,
 * and "synced" versus "never leaves this device" is a distinction the headings
 * make in words — colour-coding it would both misuse the token and lean on
 * colour as the only signal (§7).
 */
export function FaqPanel() {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <Panel title={t('settings.faq.storeTitle')}>
        <div className={PROSE}>
          <p className="text-text-dim">{t('settings.faq.storeIntro')}</p>

          {WHAT_WE_STORE_GROUPS.map((group) => (
            <section key={group.id} className="space-y-1.5 border-t border-line pt-3">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-text">
                {t(group.titleKey)}
              </h3>
              <p className="text-xs text-text-dim">{t(group.descriptionKey)}</p>
              <ul className="list-disc space-y-1 pl-5 marker:text-text-faint">
                {group.items.map((item) => (
                  <li key={item.id}>
                    {t(item.labelKey)}
                    {item.noteKey !== undefined && (
                      <span className="text-text-dim"> {t(item.noteKey)}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <section className="space-y-1.5 border-t border-line pt-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-text">
              {t('settings.faq.store.notesTitle')}
            </h3>
            <ul className="space-y-2 text-xs text-text-dim">
              {WHAT_WE_STORE_NOTES.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ul>
          </section>

          <p className="text-xs text-text-dim">
            <Trans
              i18nKey="settings.faq.store.privacyLink"
              components={{
                privacy: <a href="/privacy.html" target="_blank" rel="noopener" className={LINK} />,
              }}
            />
          </p>
        </div>
      </Panel>

      <p className="text-sm text-text-dim">
        <Trans
          i18nKey="settings.faq.helpPointer"
          components={{
            help: <Link to={tabPath(HELP_TABS, 'support')} className={LINK} />,
          }}
        />
      </p>
    </div>
  );
}
