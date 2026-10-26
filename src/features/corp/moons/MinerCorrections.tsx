import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  IconButton,
  MenuItem,
  useOpenAfterMenu,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { DayRow, MinerRow } from '@/engine/corpTaxBook/bookView';
import type { Statement } from '@/engine/corpTaxBook/statements';
import { AdjustmentDialog, RateOverrideDialog, RebillDialog } from './CorrectionDialogs';
import { useBook } from './useBook';

/**
 * A Miner's corrections (D31, D22, issue #4194): a per-record rate, a correction line for the
 * next Statement, and Rebill from date. Each is a logged officer action. They live in the
 * Payments section's ⋮; the correction lines already given are rows of its ledger.
 */
export function CorrectionsMenu({
  miner,
  days,
  statements,
}: {
  miner: MinerRow;
  days: readonly DayRow[];
  statements: readonly Statement[];
}) {
  const { t } = useTranslation();
  const { names, canEdit, data, view } = useBook();
  const [dialog, setDialog] = useState<'rate' | 'adjust' | 'rebill' | null>(null);
  const { run, onCloseAutoFocus } = useOpenAfterMenu();
  if (!canEdit) return null;
  const name = names.character(miner.mainCharacterId);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton
            icon={<Icon.More />}
            size="row"
            label={t('corpTaxBook.moons.corrections.menu')}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onCloseAutoFocus={onCloseAutoFocus}>
          <MenuItem onSelect={() => run(() => setDialog('rate'))}>
            {t('corpTaxBook.moons.corrections.rate.open')}
          </MenuItem>
          <MenuItem onSelect={() => run(() => setDialog('adjust'))}>
            {t('corpTaxBook.moons.corrections.adjust.open')}
          </MenuItem>
          <MenuItem onSelect={() => run(() => setDialog('rebill'))}>
            {t('corpTaxBook.moons.corrections.rebill.open')}
          </MenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {dialog === 'rate' && <RateOverrideDialog open onClose={() => setDialog(null)} days={days} />}
      {dialog === 'adjust' && (
        <AdjustmentDialog
          open
          onClose={() => setDialog(null)}
          miner={miner}
          minerName={name}
          defaultDate={view.billableThrough ?? data.settings.startDate}
        />
      )}
      {dialog === 'rebill' && (
        <RebillDialog
          open
          onClose={() => setDialog(null)}
          miner={miner}
          minerName={name}
          statements={statements as Statement[]}
        />
      )}
    </>
  );
}
