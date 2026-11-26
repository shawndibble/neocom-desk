import { useTranslation } from 'react-i18next';
import { Eyebrow } from '@/components/ui';
import { VETTING_KEEP_DAYS, VETTING_OPEN_KEEP_DAYS } from '@/engine/vetting';

const READS: readonly { id: string }[] = [
  { id: 'history' },
  { id: 'wallet' },
  { id: 'contact' },
  { id: 'mail' },
  { id: 'contract' },
  { id: 'skills' },
];

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
              <span className="block text-xs text-text-dim">
                {t(`vetting.consent.readNotes.${read.id}`)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-4">
        <div className="space-y-2">
          <Eyebrow>{t('vetting.consent.kept')}</Eyebrow>
          <ul className="space-y-1.5">
            <li>{t('vetting.consent.keptRows')}</li>
            <li>
              {t('vetting.consent.deleted', {
                count: VETTING_KEEP_DAYS,
                open: VETTING_OPEN_KEEP_DAYS,
              })}
            </li>
          </ul>
        </div>
        <div className="space-y-2">
          <Eyebrow>{t('vetting.consent.control')}</Eyebrow>
          <ul className="space-y-1.5">
            <li>{t(`vetting.consent.onlyReviewers.${readers}`)}</li>
            <li>{t('vetting.consent.seeOpened')}</li>
            <li>{t('vetting.consent.youDelete')}</li>
          </ul>
        </div>
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
      </div>
    </div>
  );
}
