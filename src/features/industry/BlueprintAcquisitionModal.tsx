/**
 * The Blueprint Acquisition picker/override modal (issue #839): opened from
 * an icon on any Blueprint Acquisition row (the top-level plan or any nested
 * sub-build), it lets a pilot deliberately pick a different owned ME/TE tier
 * than `selectBlueprintTier`'s automatic cheapest one, or force a tier for a
 * copy the app cannot see at all (a private contract, in-person trade) — the
 * escape hatch that used to be the Setup page's own ME/TE fields before #838
 * removed them.
 *
 * Picking anything here writes `MaterialSourcing.acquisitionTierOverride`
 * (keyed by the blueprint's own typeID, same as `overridePrice`) via the
 * caller's `onSourcingChange` — `acquisitionForLookup` (`recipes.ts`) then
 * honors it at every node that resolves this blueprint, not only the one the
 * modal was opened from, the same way `overridePrice` already does.
 *
 * The LP Store section (self-fetched on open, same pattern `ItemDetailModal`
 * uses for its own live ESI read) answers a fourth way to get this
 * blueprint the picker otherwise has no way to mention: an NPC corp's LP
 * store can hand out a blueprint *copy* at a fixed ISK+LP price — no market
 * order, no contract. It reuses `findLpOfferMatches`
 * (`features/market/appraisalLpAcquisition.ts`), the same character-LP-corps
 * lookup Appraisal uses, since a blueprint copy's `type_id` is the
 * blueprint's own typeID (the same `offer.type_id` an ordinary item offer
 * carries — `offerRows.ts`'s `computeBlueprintRow` already keys off exactly
 * this). Informational only, not a pickable tier: the app cannot buy it for
 * the pilot, so this is a fact plus a link, not another `onSourcingChange`.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, TextInput } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { MaterialSourcing } from '@/engine/industry/types';
import { findLpOfferMatches, type LpOfferMatch } from '@/features/market/appraisalLpAcquisition';
import { LpStoreLink } from '@/features/loyalty/LpStoreLink';
import { unmaskNumber } from '@/lib/numberMask';
import { formatIsk } from '@/lib/isk';

/** One owned copy, personal or corp — same shape `ownedCopiesFor` (recipes.ts) adapts to. */
export interface AcquisitionOwnedCopy {
  me: number;
  te: number;
  /** -1 = an original (BPO): unlimited runs. */
  runs: number;
}

interface TierRow {
  me: number;
  te: number;
  /** Summed runs across every owned copy at this tier; `null` for a BPO (unlimited). */
  runs: number | null;
}

/** Groups owned copies into one row per distinct ME/TE tier, for display only — no cost math (that stays in the engine). */
function tierRows(copies: readonly AcquisitionOwnedCopy[]): TierRow[] {
  const byTier = new Map<string, TierRow>();
  for (const copy of copies) {
    const key = `${copy.me}:${copy.te}`;
    const existing = byTier.get(key);
    if (!existing) {
      byTier.set(key, { me: copy.me, te: copy.te, runs: copy.runs === -1 ? null : copy.runs });
      continue;
    }
    if (existing.runs !== null && copy.runs !== -1) existing.runs += copy.runs;
    else existing.runs = null;
  }
  return [...byTier.values()].sort((a, b) => b.me - a.me || b.te - a.te);
}

interface BlueprintAcquisitionModalProps {
  onClose: () => void;
  characterId: number;
  blueprintTypeID: number;
  blueprintName: string;
  /** Every owned copy of this blueprint — personal and (when the plan's Corp Assets toggle is on) corp-owned, already merged. */
  ownedCopies: readonly AcquisitionOwnedCopy[];
  /** This row's own sourcing entry, for the current override/price (if any). */
  sourcing: MaterialSourcing | undefined;
  onSourcingChange: (typeID: number, patch: MaterialSourcing) => void;
  /** Navigates to BPC Sourcing pre-filtered to this blueprint. */
  onSearchBpcSourcing: (blueprintTypeID: number) => void;
}

export function BlueprintAcquisitionModal({
  onClose,
  characterId,
  blueprintTypeID,
  blueprintName,
  ownedCopies,
  sourcing,
  onSourcingChange,
  onSearchBpcSourcing,
}: BlueprintAcquisitionModalProps) {
  const { t } = useTranslation();
  const override = sourcing?.acquisitionTierOverride;
  const [manualMe, setManualMe] = useState(String(override?.me ?? 0));
  const [manualTe, setManualTe] = useState(String(override?.te ?? 0));
  const [manualPrice, setManualPrice] = useState(
    sourcing?.overridePrice === undefined ? '' : String(sourcing.overridePrice)
  );
  // Empty until the fetch resolves, same as "nothing to show yet" — no
  // spinner: this is a secondary, optional section, and a section that
  // appears once the lookup lands reads fine without one.
  const [lpMatches, setLpMatches] = useState<readonly LpOfferMatch[]>([]);

  useEffect(() => {
    let cancelled = false;
    void findLpOfferMatches(characterId, [blueprintTypeID]).then((result) => {
      if (cancelled) return;
      setLpMatches(result.matchesByTypeId.get(blueprintTypeID) ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [characterId, blueprintTypeID]);

  function pickTier(me: number, te: number) {
    onSourcingChange(blueprintTypeID, {
      acquisitionTierOverride: { me, te },
      overridePrice: undefined,
    });
    onClose();
  }

  function useAutomatic() {
    onSourcingChange(blueprintTypeID, {
      acquisitionTierOverride: undefined,
      overridePrice: undefined,
    });
    onClose();
  }

  function applyManual() {
    const me = unmaskNumber(manualMe);
    const te = unmaskNumber(manualTe);
    if (me === undefined || te === undefined) return;
    const price = unmaskNumber(manualPrice);
    onSourcingChange(blueprintTypeID, {
      acquisitionTierOverride: {
        me: Math.min(10, Math.max(0, Math.round(me))),
        te: Math.max(0, Math.round(te)),
      },
      overridePrice: price,
    });
    onClose();
  }

  const rows = tierRows(ownedCopies);

  return (
    <Modal
      open
      onClose={onClose}
      title={t('industry.blueprintAcquisitionModalTitle', { name: blueprintName })}
    >
      <div className="flex flex-col gap-4 text-xs">
        <section className="flex flex-col gap-2">
          <h3 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            {t('industry.blueprintAcquisitionOwnedTiers')}
          </h3>
          {rows.length === 0 ? (
            <p className="text-text-dim">{t('industry.blueprintAcquisitionNoOwnedTiers')}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {rows.map((row) => {
                const isCurrent = override?.me === row.me && override?.te === row.te;
                return (
                  <li
                    key={`${row.me}:${row.te}`}
                    className="flex items-center justify-between gap-2"
                  >
                    <span>
                      {t('industry.blueprintAcquisitionTier', { me: row.me, te: row.te })}
                      {' — '}
                      {row.runs === null
                        ? t('industry.blueprintAcquisitionUnlimitedRuns')
                        : t('industry.blueprintAcquisitionRunsOwned', { count: row.runs })}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isCurrent}
                      onClick={() => pickTier(row.me, row.te)}
                    >
                      {isCurrent
                        ? t('industry.blueprintAcquisitionSelected')
                        : t('industry.blueprintAcquisitionUseThis')}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          {override && (
            <Button size="sm" variant="ghost" onClick={useAutomatic}>
              {t('industry.blueprintAcquisitionUseAutomatic')}
            </Button>
          )}
        </section>

        {lpMatches.length > 0 && (
          <section className="flex flex-col gap-2 border-t border-line pt-3">
            <h3 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('industry.blueprintAcquisitionLpHeading')}
            </h3>
            <ul className="flex flex-col gap-1">
              {lpMatches.map((match) => {
                const label = t('industry.blueprintAcquisitionLpOffer', {
                  isk: formatIsk(match.offer.isk_cost),
                  lp: formatIsk(match.offer.lp_cost),
                  corp: match.corpName,
                });
                return (
                  <li key={match.corporationId} className="flex items-center justify-between gap-2">
                    <span>
                      {label}
                      {match.offer.quantity > 1 &&
                        ` — ${t('industry.blueprintAcquisitionLpQuantity', { count: match.offer.quantity })}`}
                      {match.offer.required_items.length > 0 &&
                        ` (${t('industry.blueprintAcquisitionLpRequiredItems', { count: match.offer.required_items.length })})`}
                    </span>
                    <LpStoreLink corporationId={match.corporationId} label={label} />
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="flex flex-col gap-2 border-t border-line pt-3">
          <h3 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            {t('industry.blueprintAcquisitionSearchHeading')}
          </h3>
          <p className="text-text-dim">{t('industry.blueprintAcquisitionSearchHint')}</p>
          <Button size="sm" variant="ghost" onClick={() => onSearchBpcSourcing(blueprintTypeID)}>
            <Icon.Search /> {t('industry.blueprintAcquisitionSearchAction')}
          </Button>
        </section>

        <section className="flex flex-col gap-2 border-t border-line pt-3">
          <h3 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            {t('industry.blueprintAcquisitionManualHeading')}
          </h3>
          <p className="text-text-dim">{t('industry.blueprintAcquisitionManualHint')}</p>
          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-1">
              {t('industry.blueprintAcquisitionManualMe')}
              <TextInput
                size="sm"
                className="w-16"
                inputMode="numeric"
                value={manualMe}
                onChange={(e) => setManualMe(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              {t('industry.blueprintAcquisitionManualTe')}
              <TextInput
                size="sm"
                className="w-16"
                inputMode="numeric"
                value={manualTe}
                onChange={(e) => setManualTe(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              {t('industry.blueprintAcquisitionManualPrice')}
              <TextInput
                size="sm"
                className="w-28"
                inputMode="decimal"
                value={manualPrice}
                onChange={(e) => setManualPrice(e.target.value)}
              />
            </label>
            <Button size="sm" variant="primary" onClick={applyManual}>
              {t('industry.blueprintAcquisitionApply')}
            </Button>
          </div>
        </section>
      </div>
    </Modal>
  );
}
