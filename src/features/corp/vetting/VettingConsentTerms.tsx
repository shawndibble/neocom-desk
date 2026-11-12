import { useTranslation } from 'react-i18next';
import { Eyebrow } from '@/components/ui';
import { VETTING_KEEP_DAYS } from '@/engine/vetting';

/** What one read covers, in the pilot's words. A `note` narrows a line that would otherwise worry. */
const READS: readonly { id: string; note?: boolean }[] = [
  { id: 'history' },
  { id: 'wallet', note: true },
  { id: 'contact' },
  { id: 'mail', note: true },
  { id: 'contract' },
  { id: 'skills' },
];

/**
 * What the read covers, what it leaves alone and how long it is kept, stated before the sign-in
 * in three short groups. The list is exactly what `VETTING_SCOPES` lets the server read, plus
 * corporation history, which is public.
 */
export function VettingConsentTerms({ readers }: { readers: 'recruiters' | 'officers' }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 text-sm sm:grid-cols-2">
      <div className="space-y-2">
        <Eyebrow>{t(`vetting.consent.willSee.${readers}`)}</Eyebrow>
        <ul className="space-y-1.5">
          {READS.map((read) => (
            <li key={read.id}>
              {t(`vetting.consent.reads.${read.id}`)}
              {read.note && (
                <span className="block text-xs text-text-dim">
                  {t(`vetting.consent.readNotes.${read.id}`)}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-4">
        <div className="space-y-2">
          <Eyebrow>{t('vetting.consent.notRead')}</Eyebrow>
          <ul className="space-y-1.5">
            <li>{t('vetting.consent.mailText')}</li>
            <li>
              {t('vetting.consent.signIn')}
              <span className="block text-xs text-text-dim">{t('vetting.consent.signInNote')}</span>
            </li>
          </ul>
        </div>
        <div className="space-y-2">
          <Eyebrow>{t('vetting.consent.control')}</Eyebrow>
          <ul className="space-y-1.5">
            <li>{t('vetting.consent.onlyReviewers')}</li>
            <li>{t('vetting.consent.seeOpened')}</li>
            <li>{t('vetting.consent.deleted', { count: VETTING_KEEP_DAYS })}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
