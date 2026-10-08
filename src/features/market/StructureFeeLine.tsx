import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, Popover, PopoverContent, PopoverTrigger, TextInput } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { textActionClassName } from '@/components/ui/textActionClassName';
import { useIsPhone } from '@/lib/useIsPhone';
import { formatMarketIsk } from '@/lib/isk';
import {
  listingNet,
  STRUCTURE_SCC_SURCHARGE_PCT,
  structureBrokerPct,
} from '@/engine/market/structureFee';
import { useStructureFees, withoutStructureFee, withStructureFee } from './structureFees';

interface StructureFeeLineProps {
  structureId: number;
  /** The order's gross value (price x remaining), for the live net preview. */
  gross: number;
  accountingLevel: number | undefined;
}

/** `2` or `2.5`, trimmed the way a pilot would type it. */
function pctText(pct: number): string {
  return String(Math.round(pct * 100) / 100);
}

/**
 * The quiet line on a player-structure order: either "Assuming NPC station
 * fees" (amber, the fee is a default the pilot has not confirmed) or the fee
 * they set, with a button that opens the field. A popover on desktop and a
 * bottom sheet on a phone (issue #2911).
 */
export function StructureFeeLine({ structureId, gross, accountingLevel }: StructureFeeLineProps) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const fees = useStructureFees((state) => state.value);
  const setFees = useStructureFees((state) => state.setValue);
  useEffect(() => {
    void useStructureFees.getState().hydrate();
  }, []);

  const ownerPct = fees[structureId];
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const openEditor = () => {
    setDraft(ownerPct === undefined ? '' : pctText(ownerPct));
    setOpen(true);
  };
  const draftPct = draft.trim() === '' ? Number.NaN : Number(draft);
  const valid = Number.isFinite(draftPct) && draftPct >= 0 && draftPct <= 100;

  const preview =
    valid && accountingLevel !== undefined && gross > 0
      ? listingNet({
          gross,
          accountingLevel,
          brokerPct: structureBrokerPct(draftPct),
        })
      : null;

  const save = () => {
    if (!valid) return;
    void setFees(withStructureFee(fees, structureId, draftPct));
    setOpen(false);
  };
  const clear = () => {
    void setFees(withoutStructureFee(fees, structureId));
    setOpen(false);
  };

  const form = (
    <form
      className="space-y-3 text-sm"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <label className="block space-y-1">
        <span className="text-text-dim">{t('market.structureFee.ownerLabel')}</span>
        <TextInput
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          step="0.01"
          className="w-28"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label={t('market.structureFee.ownerLabel')}
        />
      </label>
      <p className="text-text-dim">
        {t('market.structureFee.sccLine', { pct: STRUCTURE_SCC_SURCHARGE_PCT.toFixed(2) })}
      </p>
      <p aria-live="polite" className="text-text-dim">
        {preview === null
          ? t('market.structureFee.previewNone')
          : t('market.structureFee.preview', {
              net: formatMarketIsk(preview),
              pct: pctText(structureBrokerPct(draftPct)),
            })}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={!valid}>
          {t('common.save')}
        </Button>
        {ownerPct !== undefined && (
          <Button type="button" size="sm" variant="ghost" onClick={clear}>
            {t('market.structureFee.useNpc')}
          </Button>
        )}
      </div>
    </form>
  );

  const trigger = (
    <button
      type="button"
      className={textActionClassName()}
      onClick={isPhone ? openEditor : undefined}
    >
      {t('market.structureFee.setFee')}
    </button>
  );

  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
      {ownerPct === undefined ? (
        <span className="flex items-center gap-1 text-warning">
          <Icon.Warn aria-hidden="true" size={Icon.ICON_SIZE.sm} />
          {t('market.structureFee.assumed')}
        </span>
      ) : (
        <span className="text-text-dim">
          {t('market.structureFee.set', { pct: pctText(structureBrokerPct(ownerPct)) })}
        </span>
      )}
      {isPhone ? (
        <>
          {trigger}
          <Modal
            open={open}
            onClose={() => setOpen(false)}
            title={t('market.structureFee.title')}
            placement="sheet"
          >
            {form}
          </Modal>
        </>
      ) : (
        <Popover open={open} onOpenChange={(next) => (next ? openEditor() : setOpen(false))}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-3">
            {form}
          </PopoverContent>
        </Popover>
      )}
    </p>
  );
}
