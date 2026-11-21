import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { guarded } from '@/app/routeChunks';
import { PageSettingsModal } from '@/features/settings/PageSettingsModal';
import { MiningTaxSettingsForm } from '@/features/settings/MiningTaxSettingsForm';
import type { PayeeRecord } from '@/db';
import type { BookCorporation, PayeeOwed } from '@/features/miningTax/PayeeManagerDialog';
import type { PayeeRunningAccount } from '@/engine/miningTax/payeeRunningAccount';
import type { TrackedCharacter } from '@/features/miningTax/snapshot';
import { TypeOverridesDialog } from '@/features/miningTax/TypeOverridesDialog';

const PayeeManagerDialog = lazy(() =>
  guarded(() => import('@/features/miningTax/PayeeManagerDialog')).then((m) => ({
    default: m.PayeeManagerDialog,
  }))
);

const NO_PAYEES_BY_CHARACTER: ReadonlyMap<number, PayeeRecord[]> = new Map();

interface TaxPageDialogsProps {
  oreTagsOpen: boolean;
  onCloseOreTags: () => void;
  settingsOpen: boolean;
  onCloseSettings: () => void;
  onAutoContinueChange: (next: boolean) => void;
  /** The Character the Payee manager opens on; null keeps it closed. */
  payeeManagerCharacterId: number | null;
  onClosePayeeManager: () => void;
  characters: TrackedCharacter[];
  payeesByCharacter: ReadonlyMap<number, PayeeRecord[]> | undefined;
  owedByPayee: ReadonlyMap<string, PayeeOwed>;
  systemsByPayee: ReadonlyMap<string, ReadonlySet<number>>;
  systemNames: ReadonlyMap<number, string>;
  /** The Corp Tax Books' corporations, offered as links for a Payee named for one. */
  bookCorporations: readonly BookCorporation[];
  /** Each personal Payee's Running account: Manage Payees reads credit off it. */
  accountOf?: (payeeId: string) => PayeeRunningAccount | undefined;
  /** Opens a Payee's ledger from its Manage Payees row. */
  onOpenLedger?: (payeeId: string) => void;
  refresh: () => void;
}

/** The dialogs opened from the page header's menus: ore tags, the page settings, and the Payee manager. */
export function TaxPageDialogs({
  oreTagsOpen,
  onCloseOreTags,
  settingsOpen,
  onCloseSettings,
  onAutoContinueChange,
  payeeManagerCharacterId,
  onClosePayeeManager,
  characters,
  payeesByCharacter,
  owedByPayee,
  systemsByPayee,
  systemNames,
  bookCorporations,
  accountOf,
  onOpenLedger,
  refresh,
}: TaxPageDialogsProps) {
  const { t } = useTranslation();
  return (
    <>
      {oreTagsOpen && (
        <TypeOverridesDialog open={oreTagsOpen} onClose={onCloseOreTags} onChanged={refresh} />
      )}

      <PageSettingsModal
        open={settingsOpen}
        onClose={onCloseSettings}
        pageName={t('miningTax.title')}
        section="miningTax"
      >
        <MiningTaxSettingsForm onAutoContinueChange={onAutoContinueChange} />
      </PageSettingsModal>

      {payeeManagerCharacterId !== null && (
        <Suspense fallback={null}>
          <PayeeManagerDialog
            open={payeeManagerCharacterId !== null}
            onClose={onClosePayeeManager}
            characters={characters}
            payeesByCharacter={payeesByCharacter ?? NO_PAYEES_BY_CHARACTER}
            initialCharacterId={payeeManagerCharacterId}
            onChanged={refresh}
            owedByPayee={owedByPayee}
            systemsByPayee={systemsByPayee}
            systemNames={systemNames}
            bookCorporations={bookCorporations}
            {...(accountOf ? { accountOf } : {})}
            {...(onOpenLedger ? { onOpenLedger } : {})}
          />
        </Suspense>
      )}
    </>
  );
}
