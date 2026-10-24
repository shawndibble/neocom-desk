/**
 * Pieces of the corp data export mockup (#4946): the Export block in the
 * "Delete the book?" confirmation (variants A and B), the book settings'
 * Access tab with a standing Export section, and the SRP settings' Export
 * panel. Composed by `CorpDataExport.stories.tsx`. New copy is hard-coded, as
 * in the other mockups; copy that exists today comes from `en.json`.
 */
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Field,
  Fields,
  IskInput,
  Modal,
  Panel,
  TabPanel,
  Tabs,
  TextInput,
  useTabsId,
  type TabItem,
} from '@/components/ui';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import * as Icon from '@/components/ui/icons';
import { ActionResult } from '@/features/settings/settingsFields';
import { AutomaticSyncSection } from '@/features/corp/moons/AutomaticSyncSection';
import { BookProvider } from '@/features/corp/moons/BookContext';
import { Label } from '@/features/corp/moons/BookDialogs';
import { DeleteBookSection } from '@/features/corp/moons/DeleteBookSection';
import { bookSettingsValue } from '@/features/corp/moons/bookSettingsFixture';
import { useIsPhone } from '@/lib/useIsPhone';
import { NewComponent } from './NewComponent';

const TICKER = 'ASHF';
const BOOK_FILE = 'ASHF-corp-tax-book-2026-10-24.xlsx';
const BOOK_SHEETS =
  'Sheets: Mining lines, Statements, Payments, Adjustments, Write-offs, Dismissals, Miners, Settings, Activity log.';
const SRP_SHEETS = 'Sheets: Settings, SRP Claims (every state), SRP log, Doctrine Fits.';

/** A Director who turned the book on: the one who sees Delete the book (and not the CEO's Reclaim). */
function bookValue() {
  const value = bookSettingsValue({ isDirector: true });
  return { ...value, settings: { ...value.settings, createdBy: value.characterId } };
}

function Book({ children }: { children: ReactNode }) {
  return <BookProvider value={bookValue()}>{children}</BookProvider>;
}

/** The download button every entry point shares: one format, so a button, not a menu. */
function DownloadButton({ label, wide = false }: { label: string; wide?: boolean }) {
  return (
    <Button size="sm" className={wide ? 'max-sm:w-full' : undefined}>
      <Icon.Download size={Icon.ICON_SIZE.sm} aria-hidden="true" />
      {label}
    </Button>
  );
}

function Downloaded({ file, rows }: { file: string; rows: string }) {
  return (
    <ActionResult kind="success">
      Downloaded {file} · {rows}
    </ActionResult>
  );
}

// ---------------------------------------------------------------- Delete the book?

export type DeleteVariant = 'today' | 'a' | 'b' | 'b-done';

/**
 * `DeleteBookDialog` as it ships (`today`), or with an "Export first" block.
 * A: Delete stays usable once the ticker is typed. B: Delete is inert until
 * the export has downloaded from this dialog. Composed on `Modal` (not
 * `DialogShell`) so B's Delete can be `aria-disabled` with a visible reason.
 */
export function DeleteBookDialogMock({ variant }: { variant: DeleteVariant }) {
  const { t } = useTranslation();
  const phone = useIsPhone();
  const [typed, setTyped] = useState(TICKER);
  const downloaded = variant === 'b-done';
  const gated = variant === 'b' && !downloaded;
  const tickerOk = typed.trim().toUpperCase() === TICKER;
  const reasonId = 'delete-book-reason';
  const reason = gated ? 'Download the book first, then delete.' : null;

  return (
    <Modal
      open
      onClose={() => {}}
      title={t('corpTaxBook.moons.settings.delete.confirmTitle')}
      placement={phone ? 'sheet' : 'center'}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {reason && (
            <span id={reasonId} className="mr-auto text-sm text-text-dim">
              {reason}
            </span>
          )}
          <Button variant="ghost">{t('common.cancel')}</Button>
          <Button
            variant="danger"
            aria-disabled={gated || !tickerOk ? true : undefined}
            aria-describedby={reason ? reasonId : undefined}
            className={gated || !tickerOk ? 'cursor-not-allowed opacity-40' : undefined}
          >
            {t('corpTaxBook.moons.settings.delete.confirm')}
          </Button>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <p>{t('corpTaxBook.moons.settings.delete.body')}</p>
        {variant !== 'today' && (
          <NewComponent name="ExportFirst">
            <section aria-labelledby="export-first-heading" className="space-y-2">
              <h3 id="export-first-heading" className={eyebrowClassName}>
                {variant === 'a' ? 'Export first' : 'Step 1 · Export first'}
              </h3>
              <p className="text-xs text-text-dim">
                Keep a copy: one Excel workbook with every record the book holds, a sheet per kind.
                SRP isn't part of the book and is kept.
              </p>
              <DownloadButton label="Download the book (.xlsx)" wide />
              {downloaded ? (
                <Downloaded file={BOOK_FILE} rows="9 sheets, 18,412 rows" />
              ) : (
                <p className="text-xs text-text-dim">{BOOK_SHEETS}</p>
              )}
            </section>
          </NewComponent>
        )}
        <Label
          text={
            (variant === 'b' || variant === 'b-done' ? 'Step 2 · ' : '') +
            t('corpTaxBook.moons.settings.delete.typeTicker', { ticker: TICKER })
          }
        >
          <TextInput
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
          />
        </Label>
      </div>
    </Modal>
  );
}

export function DeleteBookStory({ variant }: { variant: DeleteVariant }) {
  return (
    <Book>
      <DeleteBookDialogMock variant={variant} />
    </Book>
  );
}

// ---------------------------------------------------------------- Book settings › Access

/**
 * `BookSettingsDialog` on its Access tab, rebuilt around the real
 * `AutomaticSyncSection` and `DeleteBookSection` so a new Export section can sit
 * between them. The Approvals field mirrors the real one.
 */
export function BookSettingsAccessMock() {
  const { t } = useTranslation();
  const tabsId = useTabsId();
  const [approval, setApproval] = useState('');
  const tabs: TabItem[] = [
    { id: 'rates', label: t('corpTaxBook.moons.settings.tabs.rates') },
    { id: 'billing', label: t('corpTaxBook.moons.settings.tabs.billing') },
    { id: 'extractions', label: t('corpTaxBook.moons.settings.tabs.extractions') },
    { id: 'access', label: t('corpTaxBook.moons.settings.tabs.access') },
  ];
  return (
    <Book>
      <Modal
        open
        onClose={() => {}}
        title={t('corpTaxBook.moons.settings.title')}
        placement="wide"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost">{t('common.close')}</Button>
            <Button variant="primary">{t('common.save')}</Button>
          </div>
        }
      >
        <div className="space-y-4 text-sm">
          <Tabs
            tabsId={tabsId}
            tabs={tabs}
            value="access"
            onChange={() => {}}
            label={t('corpTaxBook.moons.settings.sections')}
          />
          <TabPanel tabsId={tabsId} tabId="access" className="space-y-5">
            <section className="space-y-2">
              <h3 className={eyebrowClassName}>{t('corpTaxBook.moons.settings.approvals')}</h3>
              <Fields variant="form">
                <Field
                  label={t('corpTaxBook.moons.settings.approvalLimit')}
                  note={t('corpTaxBook.moons.settings.approvalHintNone')}
                >
                  <IskInput
                    value={approval}
                    onChange={setApproval}
                    aria-label={t('corpTaxBook.moons.settings.approvalLimit')}
                  />
                </Field>
              </Fields>
            </section>

            <AutomaticSyncSection />

            <NewComponent name="ExportBookSection">
              <section aria-labelledby="export-book-heading" className="space-y-2">
                <h3 id="export-book-heading" className={eyebrowClassName}>
                  Export the book
                </h3>
                <p className="text-xs text-text-dim">
                  One Excel workbook with every record the book holds, a sheet per kind. A copy to
                  keep or work in: it can't be imported back.
                </p>
                <DownloadButton label="Download the book (.xlsx)" />
                <p className="text-xs text-text-dim">{BOOK_SHEETS}</p>
              </section>
            </NewComponent>

            <DeleteBookSection onDelete={() => {}} />
          </TabPanel>
        </div>
      </Modal>
    </Book>
  );
}

// ---------------------------------------------------------------- SRP settings

/** The Export panel at the foot of SRP Settings, after Claims. Laid out like the editor's own fields. */
export function SrpExportPanel() {
  return (
    <div className="mx-auto max-w-5xl px-4 pb-4">
      <NewComponent name="SrpExportPanel">
        <Panel title="Export">
          <Fields variant="form">
            <Field
              label="SRP data"
              note={`One Excel workbook, a sheet per kind. A copy to keep or work in: it can't be imported back. ${SRP_SHEETS}`}
            >
              <DownloadButton label="Download SRP data (.xlsx)" wide />
            </Field>
          </Fields>
        </Panel>
      </NewComponent>
    </div>
  );
}
