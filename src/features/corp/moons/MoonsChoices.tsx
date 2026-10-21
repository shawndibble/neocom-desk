import { useTranslation } from 'react-i18next';
import { Button, Panel, TextInput } from '@/components/ui';
import { parseInviteInput } from '../taxBook/feederClient';

export type SetupChoice = 'own' | 'consent' | 'collect';

/**
 * The three choices side by side on the Moons page of a corporation with no book:
 * run its own book, let an accounting corporation handle it (a pasted invite link
 * or code), collect tax for other corporations. Presentational: `MoonsSetup`
 * owns the steps.
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
      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            ['own', 'own', canOwn],
            ['handled', 'consent', true],
            ['collect', 'collect', canOwn],
          ] as const
        ).map(([key, next, enabled]) => (
          <Panel key={key} fill className="flex flex-col text-sm">
            <div className="flex flex-1 flex-col justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-base font-semibold">
                  {t(`corpTaxBook.moons.setup.${key}.title`)}
                </h2>
                <p className="text-text-dim">{t(`corpTaxBook.moons.setup.${key}.hint`)}</p>
              </div>
              {key === 'handled' ? (
                <div className="space-y-2">
                  <label className="block space-y-1">
                    <span className="text-xs text-text-dim">
                      {t('corpTaxBook.moons.setup.paste')}
                    </span>
                    <TextInput value={paste} onChange={(e) => onPaste(e.target.value)} />
                  </label>
                  <Button
                    variant="primary"
                    disabled={parseInviteInput(paste) === null}
                    onClick={() => onChoose(next)}
                  >
                    {t('corpTaxBook.moons.setup.handled.action')}
                  </Button>
                </div>
              ) : (
                <Button variant="primary" disabled={!enabled} onClick={() => onChoose(next)}>
                  {t(`corpTaxBook.moons.setup.${key}.action`)}
                </Button>
              )}
            </div>
          </Panel>
        ))}
      </div>
      {!canOwn && (
        <p className="text-center text-xs text-text-dim">
          {t('corpTaxBook.moons.off.notDirector')}
        </p>
      )}
    </div>
  );
}
