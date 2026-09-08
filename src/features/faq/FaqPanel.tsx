import { Trans, useTranslation } from 'react-i18next';
import { Panel } from '@/components/ui';
import { ISSUES_URL } from '@/lib/links';
import { WHAT_WE_STORE_GROUPS, WHAT_WE_STORE_NOTES } from './whatWeStore';

/**
 * `max-w-2xl` for the same reason the shortcuts list constrains itself: this is
 * prose, and prose set to the full page width at a wide viewport is measurably
 * harder to read. The page keeps one container width app-wide; content a wide
 * row would spoil narrows itself here.
 */
const PROSE = 'max-w-2xl space-y-3 text-sm';

const LINK = 'text-accent hover:underline';

/**
 * Settings' FAQ tab.
 *
 * One Panel per question, stacked like the General tab's — so a new question is
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
        </div>
      </Panel>

      <Panel title={t('settings.faq.feedbackTitle')}>
        <div className={PROSE}>
          {/*
            `Trans` rather than an interpolated string: the link sits mid-
            sentence, and splitting the sentence into "before"/"after" halves
            around a bare <a> is exactly the shape that becomes untranslatable
            the moment a language wants the clause in a different order.
          */}
          <p>
            <Trans
              i18nKey="settings.faq.feedbackBody"
              components={{
                issues: (
                  <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer" className={LINK} />
                ),
              }}
            />
          </p>
          <p className="text-xs text-text-dim">{t('settings.faq.feedbackHint')}</p>
        </div>
      </Panel>

      <Panel title={t('settings.faq.thanksTitle')}>
        <div className={PROSE}>
          <p>
            <Trans
              i18nKey="settings.faq.thanksBody"
              components={{ pilot: <span className="font-semibold text-text" /> }}
            />
          </p>
          <p className="text-xs text-text-dim">{t('settings.faq.thanksHint')}</p>
        </div>
      </Panel>
    </div>
  );
}
