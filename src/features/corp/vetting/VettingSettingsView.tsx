import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataTable,
  EmptyState,
  Panel,
  SegmentedControl,
  TextInput,
  type DataTableColumn,
} from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { Pill } from '@/components/ui/Pill';
import {
  VETTING_WATCHLIST_MAX,
  type VettingKind,
  type VettingSettings,
  type VettingWatchEntry,
} from '@/engine/vetting';
import { callableErrorReason } from '@/lib/callableError';
import { VettingEntity } from './VettingEntity';
import type { VettingSettingsPatch } from './vettingBackend';
import { vettingErrorKey } from './vettingView';

const KINDS: readonly VettingKind[] = ['application', 'promotion'];
const SIGN_OFF_CHOICES = ['1', '2', '3'] as const;

interface VettingSettingsViewProps {
  settings: VettingSettings;
  /** Saves one change; rejects with the server's refusal. */
  onSave: (patch: VettingSettingsPatch) => Promise<void>;
}

/**
 * Vetting settings, for a Director: on or off, how many sign-offs each kind of review needs,
 * and the watchlist the checks look for. Each change saves by itself.
 */
export function VettingSettingsView({ settings, onSave }: VettingSettingsViewProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');

  const save = async (what: string, patch: VettingSettingsPatch): Promise<boolean> => {
    if (busy !== null) return false;
    setBusy(what);
    setError(null);
    try {
      await onSave(patch);
      return true;
    } catch (err) {
      setError(t(vettingErrorKey(callableErrorReason(err))));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const columns: DataTableColumn<VettingWatchEntry>[] = [
    {
      id: 'name',
      header: t('vetting.settings.watchlist.name'),
      primary: true,
      render: (row) => (
        <VettingEntity id={row.id} category={row.category}>
          {row.name}
        </VettingEntity>
      ),
    },
    {
      id: 'category',
      header: t('vetting.settings.watchlist.kind'),
      render: (row) => t(`vetting.settings.watchlist.category.${row.category}`),
    },
    {
      id: 'remove',
      header: '',
      align: 'right',
      cardActions: true,
      render: (row) => (
        <Button
          size="sm"
          loading={busy === `remove:${row.id}`}
          aria-label={t('vetting.settings.watchlist.removeNamed', { name: row.name })}
          onClick={() => void save(`remove:${row.id}`, { removeWatch: [row.id] })}
        >
          {t('vetting.settings.watchlist.remove')}
        </Button>
      ),
    },
  ];

  const full = settings.watchlist.length >= VETTING_WATCHLIST_MAX;
  const add = async () => {
    const wanted = name.trim();
    if (wanted === '' || full) return;
    if (await save('add', { addWatchNames: [wanted] })) setName('');
  };

  return (
    <div className="space-y-4">
      <Panel
        title={t('vetting.settings.state.title')}
        meta={
          <Pill tone={settings.on ? 'success' : 'neutral'}>
            {t(settings.on ? 'vetting.settings.state.on' : 'vetting.settings.state.off')}
          </Pill>
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-text-dim">
            {t(settings.on ? 'vetting.settings.state.onHint' : 'vetting.settings.state.offHint')}
          </p>
          <Button
            variant={settings.on ? 'ghost' : 'primary'}
            loading={busy === 'on'}
            onClick={() => void save('on', { on: !settings.on })}
          >
            {t(settings.on ? 'vetting.settings.state.turnOff' : 'vetting.settings.state.turnOn')}
          </Button>
        </div>
      </Panel>
      <Panel title={t('vetting.settings.signOffs.title')}>
        <div className="space-y-3 text-sm">
          {KINDS.map((kind) => (
            <div key={kind} className="flex flex-wrap items-center justify-between gap-3">
              <span>{t(`vetting.settings.signOffs.${kind}`)}</span>
              <SegmentedControl
                label={t(`vetting.settings.signOffs.${kind}`)}
                uppercase={false}
                value={String(settings.signOffs[kind]) as (typeof SIGN_OFF_CHOICES)[number]}
                onChange={(value) =>
                  void save(`signOffs:${kind}`, {
                    signOffs: { ...settings.signOffs, [kind]: Number(value) },
                  })
                }
                options={SIGN_OFF_CHOICES.map((value) => ({ value, label: value }))}
              />
            </div>
          ))}
          <p className="text-xs text-text-dim">{t('vetting.settings.signOffs.hint')}</p>
        </div>
      </Panel>
      <Panel
        title={t('vetting.settings.watchlist.title')}
        meta={t('vetting.settings.watchlist.count', { count: settings.watchlist.length })}
        padded={false}
      >
        {settings.watchlist.length === 0 ? (
          <EmptyState
            title={t('vetting.settings.watchlist.emptyTitle')}
            hint={t('vetting.settings.watchlist.emptyHint')}
          />
        ) : (
          <DataTable
            label={t('vetting.settings.watchlist.title')}
            columns={columns}
            rows={settings.watchlist}
            rowKey={(row) => row.id}
          />
        )}
        <form
          className="flex flex-wrap items-end gap-2 border-t border-line p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <label className="block min-w-0 flex-1 space-y-1">
            <span className="text-xs text-text-dim">
              {t('vetting.settings.watchlist.addLabel')}
            </span>
            <TextInput
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <Button
            type="submit"
            loading={busy === 'add'}
            aria-disabled={name.trim() === '' || full || undefined}
          >
            {t('vetting.settings.watchlist.add')}
          </Button>
          {full && (
            <p className="w-full text-xs text-text-dim">
              {t('vetting.settings.watchlist.full', { count: VETTING_WATCHLIST_MAX })}
            </p>
          )}
        </form>
      </Panel>
      {error && <InlineError>{error}</InlineError>}
    </div>
  );
}
