/**
 * The foot of the start page: how to write a Survey start link by hand, for a
 * pilot who wants one in a site, a calendar invite or a chat. Its first line is
 * that link, built from the Additional information beside it and copyable.
 */
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { appUrl } from '@/features/share/shareStore';
import { writeToClipboard } from '@/lib/clipboard';
import { useCopyFeedback } from '@/lib/useCopyFeedback';
import { START_LINK_PATH } from './startLink';

const PARAMS = ['place', 'placeId', 'payee', 'payeeId', 'rate', 'notes'] as const;

const FIND = ['findPlace', 'findStructure', 'findPayee', 'findLoggedIn'] as const;

const EXAMPLE_PATH = '/survey?place=Efa&payee=Bob%20Corp&rate=10&notes=Fleet%20at%2019%3A00';

/**
 * `path` is the start link built from the Additional information beside it
 * (`startLinkPath`); with nothing filled in there, a made-up example shows instead.
 */
export function StartLinkHelp({ path = START_LINK_PATH }: { path?: string }) {
  const { t } = useTranslation();
  const made = path !== START_LINK_PATH;
  const url = appUrl(made ? path : EXAMPLE_PATH);
  const { copied, flash } = useCopyFeedback<'copied' | 'failed'>(2000);
  return (
    <details className="rounded-xs border border-line bg-panel/60 text-sm">
      <summary className="cursor-pointer select-none px-3 py-2 text-text-dim touch:py-3">
        {t('survey.start.help.title')}
      </summary>
      <div className="space-y-3 border-t border-line px-3 py-3">
        <p className="text-text-dim">
          {made ? t('survey.start.help.yourLink') : t('survey.start.help.example')}
        </p>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 overflow-x-auto rounded-xs bg-bg p-2 text-xs whitespace-nowrap">
            {url}
          </code>
          <Button
            size="sm"
            onClick={() =>
              void writeToClipboard(url).then(
                () => flash('copied'),
                () => flash('failed')
              )
            }
          >
            {copied === null
              ? t('survey.start.copyLink')
              : t(copied === 'copied' ? 'survey.start.copied' : 'survey.start.copyFailed')}
          </Button>
        </div>
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
