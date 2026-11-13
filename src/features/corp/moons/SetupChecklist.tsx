import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, IconButton, Panel, ProgressBar, Toast } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { utcDay } from '@/engine/localDay';
import { readLocal, writeLocal } from '@/lib/safeLocalStorage';
import { cx } from '@/lib/cx';
import { tabPath } from '@/lib/pageTabs';
import { BookSettingsDialog, type SettingsTab } from './BookSettingsDialog';
import { DeleteBookDialog } from './DeleteBookSection';
import { MOONS_TABS } from './moonsPaths';
import { setupChecklist, type SetupStep } from './setupChecklist';
import { useBook } from './useBook';

const k = (key: string) => `corpTaxBook.moons.setupChecklist.${key}`;

/** Per viewer and device: a convenience, so `localStorage` (one key per book). */
const dismissedKey = (corporationId: number) =>
  `corpTaxBook.setupChecklistDismissed:${corporationId}`;

/** Where each step is done: a Settings tab, or the Statements tab. */
const SETTINGS_TAB: Partial<Record<SetupStep['id'], SettingsTab>> = {
  rate: 'rates',
  autoSync: 'access',
};

/**
 * "Set up the book" on the Overview: a short checklist for an officer who can edit,
 * shown until every step is done or it is dismissed. Each step is read off the book the page
 * already holds; a step to do carries the one button that goes where it is done.
 */
export function SetupChecklist() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { view, names, data, canEdit, corporationId } = useBook();
  const [dismissed, setDismissed] = useState(() => readLocal(dismissedKey(corporationId)) !== null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  const list = useMemo(() => {
    const own = new Set(
      view.input.extractions
        .filter((x) => x.sourceCorporationId === undefined)
        .map((x) => x.structureId)
    );
    return setupChecklist({
      rates: view.input.rates,
      scheduledSync: data.scheduledSync,
      refineries: [...own].map((id) => ({ id, name: names.refinery(id) })),
      statementCount: view.input.statements.length,
      today: utcDay(Date.parse(view.input.now)),
    });
  }, [view, names, data.scheduledSync]);

  const dialogs = (
    <>
      {settingsTab && (
        <BookSettingsDialog
          open
          initialTab={settingsTab}
          onClose={() => setSettingsTab(null)}
          onSaved={() => setSaved(true)}
          onDeleteBook={() => setDeleteOpen(true)}
        />
      )}
      {deleteOpen && <DeleteBookDialog onClose={() => setDeleteOpen(false)} />}
      {saved && (
        <Toast message={t('corpTaxBook.moons.settings.saved')} onClose={() => setSaved(false)} />
      )}
    </>
  );
  if (!canEdit || dismissed || list.complete) return dialogs;

  const dismiss = () => {
    writeLocal(dismissedKey(corporationId), '1');
    setDismissed(true);
  };
  const action = (step: SetupStep) => {
    if (step.state !== 'todo') return null;
    const tab = SETTINGS_TAB[step.id];
    if (tab) {
      return (
        <Button size="sm" onClick={() => setSettingsTab(tab)}>
          {t(k(`${step.id}.action`))}
        </Button>
      );
    }
    if (step.id === 'firstStatement') {
      return (
        <Button size="sm" onClick={() => navigate(tabPath(MOONS_TABS, 'statements'))}>
          {t(k('firstStatement.action'))}
        </Button>
      );
    }
    return null;
  };
  const hint = (step: SetupStep) => {
    if (step.id === 'rate' && step.state === 'done' && list.corpRatePct !== undefined) {
      return t(k('rate.done'), { pct: list.corpRatePct });
    }
    if (step.state === 'checking') return t(k('checking'));
    if (step.state === 'done') return null;
    if (step.id === 'refineryNames') return t(k('refineryNames.todo'), { count: step.unreadable });
    return t(k(`${step.id}.todo`));
  };

  return (
    <>
      <Panel
        title={t(k('title'))}
        meta={
          <span className="text-xs text-text-dim tabular-nums">
            {t(k('progress'), { done: list.done, total: list.steps.length })}
          </span>
        }
        actions={<IconButton icon={<Icon.Close />} label={t(k('dismiss'))} onClick={dismiss} />}
      >
        <ProgressBar
          label={t(k('title'))}
          value={list.done}
          max={list.steps.length}
          className="mb-3"
        />
        <ul className="divide-y divide-line text-sm">
          {list.steps.map((step) => {
            const done = step.state === 'done';
            const note = hint(step);
            return (
              <li key={step.id} className="flex items-start gap-3 py-2 first:pt-0 last:pb-0">
                <span
                  className="inline-flex size-5 shrink-0 items-center justify-center"
                  aria-hidden
                >
                  {done ? (
                    <Icon.SeverityClear size={Icon.ICON_SIZE.md} className="text-success" />
                  ) : (
                    <span className="size-4 rounded-full border border-line-bright" />
                  )}
                </span>
                {/* A phone drops the button under the words, never squeezing them. */}
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="min-w-0 flex-1 basis-60">
                    <span className={cx('block', done && 'text-text-dim')}>
                      {t(k(`${step.id}.title`))}
                      {/* The visible note already says "Checking…". */}
                      {step.state !== 'checking' && (
                        <span className="sr-only"> {t(k(done ? 'stateDone' : 'stateTodo'))}</span>
                      )}
                    </span>
                    {note && <span className="block text-xs text-text-dim">{note}</span>}
                  </span>
                  {action(step)}
                </span>
              </li>
            );
          })}
        </ul>
      </Panel>
      {dialogs}
    </>
  );
}
