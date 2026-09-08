import { useTranslation } from 'react-i18next';
import { Panel } from '@/components/ui';
import { WHAT_WE_STORE_GROUPS, WHAT_WE_STORE_NOTES } from './whatWeStore';

/**
 * Settings' FAQ tab.
 *
 * One section today ("What We Store"). Structured as a list of sections from
 * the start so a second question is an addition, not a rewrite — but only the
 * one that was asked for is here; an FAQ padded out with invented questions
 * reads as filler and dates faster than it helps.
 *
 * No status colours. `docs/DESIGN.md` §6 reserves those for meaning, and
 * "synced" vs "never leaves this device" is a distinction the headings make in
 * words — colour-coding it would both misuse the token and lean on colour as
 * the only signal (§7).
 */
export function FaqPanel() {
  const { t } = useTranslation();

  return (
    <Panel title={t('settings.faq.storeTitle')}>
      <div className="max-w-2xl space-y-4 text-sm">
        {/*
          `max-w-2xl` for the same reason the shortcuts list constrains itself:
          this is prose, and prose set to the full page width at a wide viewport
          is measurably harder to read. The page keeps one container width
          app-wide; content that a wide row would spoil narrows itself here.
        */}
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
  );
}
