import { useTranslation } from 'react-i18next';
import { Button, Panel, TextInput, Tooltip, LiveNote, Field, Fields } from '@/components/ui';
import { parseInviteInput } from '../taxBook/feederClient';

export type SetupChoice = 'own' | 'consent' | 'collect';

export function MoonsChoices({
  canOwn,
  left,
  error,
  paste,
  onPaste,
  onChoose,
}: {
  canOwn: boolean;
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
        <LiveNote className="text-center text-sm">{t('corpTaxBook.moons.setup.left')}</LiveNote>
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
            variant={canOwn ? 'primary' : 'ghost'}
            aria-disabled={!canOwn || undefined}
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
              <Fields variant="stacked">
                <Field label={t('corpTaxBook.moons.setup.paste')}>
                  <TextInput value={paste} onChange={(e) => onPaste(e.target.value)} />
                </Field>
              </Fields>
              <Tooltip
                content={
                  parseInviteInput(paste) === null
                    ? t('corpTaxBook.moons.setup.handled.needsLink')
                    : null
                }
              >
                <Button
                  variant={canOwn ? 'ghost' : 'primary'}
                  aria-disabled={parseInviteInput(paste) === null || undefined}
                  onClick={() => onChoose('consent')}
                >
                  {t('corpTaxBook.moons.setup.handled.action')}
                </Button>
              </Tooltip>
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
            <Button
              aria-disabled={!canOwn || undefined}
              onClick={() => onChoose('collect')}
              className="self-start"
            >
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
