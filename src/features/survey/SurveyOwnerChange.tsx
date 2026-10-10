/**
 * "Change owner" on the survey's footer (owner only): a dialog that finds any EVE
 * Character by name (ESI's character search, so not just people who use the app),
 * then asks to confirm before the survey's owner is rewritten. The warning says the
 * new owner may need to log into Neocom Desk before they can edit it. The previous
 * owner is a viewer afterwards: the survey tab reads `owned` off the owner name.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, TextInput, textActionClassName } from '@/components/ui';
import { focusRingClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import {
  MIN_RECIPIENT_SEARCH_LENGTH,
  searchMailRecipients,
  type RecipientSearchHit,
} from '@/features/character/mailRecipientSearch';
import { setSurveyOwner } from './surveyStore';

const DEBOUNCE_MS = 300;

export function SurveyOwnerChange({
  characterId,
  surveyId,
  onChanged,
}: {
  /** The pilot searching (any logged-in Character can search names). */
  characterId: number;
  surveyId: string;
  /** The owner was rewritten; the caller reloads the survey. */
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<{ key: string; list: RecipientSearchHit[] } | null>(null);
  const [chosen, setChosen] = useState<RecipientSearchHit | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const typed = query.trim();
  const searchKey =
    open && chosen === null && typed.length >= MIN_RECIPIENT_SEARCH_LENGTH ? typed : '';
  useEffect(() => {
    if (searchKey === '') return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void searchMailRecipients(characterId, searchKey, controller.signal)
        .catch(() => [])
        .then((list) => {
          if (!controller.signal.aborted) setHits({ key: searchKey, list });
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchKey, characterId]);

  function close() {
    setOpen(false);
    setQuery('');
    setChosen(null);
    setFailed(false);
  }

  async function confirm() {
    if (chosen === null || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await setSurveyOwner({ id: surveyId, owner: chosen.name });
      close();
      onChanged();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const list = hits?.key === searchKey ? hits.list : [];

  return (
    <>
      <button type="button" className={textActionClassName()} onClick={() => setOpen(true)}>
        {t('survey.changeOwner.open')}
      </button>
      <Modal open={open} onClose={close} title={t('survey.changeOwner.title')}>
        {chosen === null ? (
          <div className="flex flex-col gap-2">
            <TextInput
              autoFocus
              aria-label={t('survey.changeOwner.search')}
              placeholder={t('survey.changeOwner.searchPlaceholder')}
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {searchKey !== '' && hits?.key === searchKey && list.length === 0 && (
              <p className="text-sm text-text-dim">{t('survey.changeOwner.noMatches')}</p>
            )}
            <ul className="flex max-h-64 flex-col overflow-auto">
              {list.map((hit) => (
                <li key={hit.characterId}>
                  <button
                    type="button"
                    className={cx(
                      'w-full rounded-xs px-2 py-1 text-left hover:bg-panel-2 touch:min-h-11',
                      focusRingClassName
                    )}
                    onClick={() => setChosen(hit)}
                  >
                    {hit.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="font-semibold">
              {t('survey.changeOwner.confirm', { name: chosen.name })}
            </p>
            <p className="text-sm text-text-dim">
              {t('survey.changeOwner.warning', { name: chosen.name })}
            </p>
            {failed && (
              <p role="alert" className="text-sm text-danger">
                {t('survey.changeOwner.failed')}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setChosen(null)}>
                {t('survey.changeOwner.back')}
              </Button>
              <Button variant="primary" size="sm" loading={busy} onClick={() => void confirm()}>
                {t('survey.changeOwner.submit')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
