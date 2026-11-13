import { useTranslation } from 'react-i18next';
import { Button, Panel, TextInput } from '@/components/ui';
import { parseInviteInput } from '../taxBook/feederClient';

export type SetupChoice = 'own' | 'consent' | 'collect';

/**
 * The three choices on the Moons page of a corporation with no book. Running its own
 * book is the common path, so it leads: a full-width row with the one primary button.
 * Letting an accounting corporation handle it (a pasted invite link or code) and
 * collecting tax for other corporations sit beneath it, side by side, with ghost
 * buttons. Presentational: `MoonsSetup` owns the steps.
 */
export function MoonsChoices({
  canOwn,
  left,
  error,
  paste,
  onPaste,
  onChoose,
}: {
  /** Directors may turn a book on; the paste-an-invite choice is for any officer. */
  canOwn: boolean;
  /** The corporation just left an accounting corporation. */
  left?: boolean;
  error?: string | null;
  paste: string;
  onPaste: (value: string) => void;
  onChoose: (next: SetupChoice) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {left && (
        <p role="status" className="text-center text-sm">
          {t('corpTaxBook.moons.setup.left')}
        </p>
      )}
      {error && (
        <p role="alert" className="text-center text-sm text-danger">
          {error}
        </p>
      )}
      <Panel className="text-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">{t('corpTaxBook.moons.setup.own.title')}</h2>
            <p className="text-text-dim">{t('corpTaxBook.moons.setup.own.hint')}</p>
          </div>
          <Button
            variant="primary"
            disabled={!canOwn}
            onClick={() => onChoose('own')}
            className="shrink-0 self-start sm:self-center"
          >
            {t('corpTaxBook.moons.setup.own.action')}
          </Button>
        </div>
      </Panel>
      <div className="grid gap-3 sm:grid-cols-2">
        <Panel fill className="flex flex-col text-sm">
          <div className="flex flex-1 flex-col justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-base font-semibold">
                {t('corpTaxBook.moons.setup.handled.title')}
              </h2>
              <p className="text-text-dim">{t('corpTaxBook.moons.setup.handled.hint')}</p>
            </div>
            <div className="space-y-2">
              <label className="block space-y-1">
                <span className="block text-xs text-text-dim">
                  {t('corpTaxBook.moons.setup.paste')}
                </span>
                <TextInput value={paste} onChange={(e) => onPaste(e.target.value)} />
              </label>
              {/* With the book choices off, this is the one way forward, so it leads. */}
              <Button
                variant={canOwn ? 'ghost' : 'primary'}
                disabled={parseInviteInput(paste) === null}
                onClick={() => onChoose('consent')}
              >
                {t('corpTaxBook.moons.setup.handled.action')}
              </Button>
            </div>
          </div>
        </Panel>
        <Panel fill className="flex flex-col text-sm">
          <div className="flex flex-1 flex-col justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-base font-semibold">
                {t('corpTaxBook.moons.setup.collect.title')}
              </h2>
              <p className="text-text-dim">{t('corpTaxBook.moons.setup.collect.hint')}</p>
            </div>
            <Button disabled={!canOwn} onClick={() => onChoose('collect')} className="self-start">
              {t('corpTaxBook.moons.setup.collect.action')}
            </Button>
          </div>
        </Panel>
      </div>
      {!canOwn && (
        <p className="text-center text-xs text-text-dim">
          {t('corpTaxBook.moons.off.notDirector')}
        </p>
      )}
    </div>
  );
}
