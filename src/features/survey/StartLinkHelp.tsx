/**
 * The foot of the start page: how to write a Survey start link by hand, for a
 * pilot who wants one in a site, a calendar invite or a chat. The "Copy start
 * link" button on the Survey tab builds the same link from a filled-in panel.
 */
import { useTranslation } from 'react-i18next';
import { appUrl } from '@/features/share/shareStore';

const PARAMS = ['place', 'placeId', 'payee', 'payeeId', 'rate', 'notes'] as const;

const FIND = ['findPlace', 'findStructure', 'findPayee', 'findLoggedIn'] as const;

export function StartLinkHelp() {
  const { t } = useTranslation();
  return (
    <details className="rounded-xs border border-line bg-panel/60 text-sm">
      <summary className="cursor-pointer select-none px-3 py-2 text-text-dim touch:py-3">
        {t('survey.start.help.title')}
      </summary>
      <div className="space-y-3 border-t border-line px-3 py-3">
        <p>{t('survey.start.help.intro')}</p>
        <dl className="space-y-2">
          {PARAMS.map((name) => (
            <div key={name}>
              <dt>
                <code className="rounded-xs bg-bg px-1">{name}</code>
              </dt>
              <dd className="text-text-dim">{t(`survey.start.help.${name}`)}</dd>
            </div>
          ))}
        </dl>
        <p className="text-text-dim">{t('survey.start.help.example')}</p>
        <code className="block overflow-x-auto rounded-xs bg-bg p-2 text-xs whitespace-nowrap">
          {appUrl('/survey?place=Efa&payee=Bob%20Corp&rate=10&notes=Fleet%20at%2019%3A00')}
        </code>
        <p className="text-text-dim">{t('survey.start.help.encode')}</p>
        <h3 className="font-medium">{t('survey.start.help.findTitle')}</h3>
        <ul className="list-disc space-y-1 pl-5 text-text-dim">
          {FIND.map((key) => (
            <li key={key}>{t(`survey.start.help.${key}`)}</li>
          ))}
        </ul>
      </div>
    </details>
  );
}
