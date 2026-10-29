import { useEffect, useId, useMemo, useState } from 'react';
import { InlineError } from '@/components/ui/InlineError';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  InfoTooltip,
  Modal,
  NativeSelect,
  SegmentedControl,
  Spinner,
  TextArea,
  TextInput,
} from '@/components/ui';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { Pill } from '@/components/ui/Pill';
import {
  DEFAULT_HOLD_BACK_PCT,
  MAX_FLEET_SHARES,
  MAX_HOLD_BACK_PCT,
  MAX_PAYOUT_ISK,
  MAX_PAYOUT_NAME_LENGTH,
  MAX_PILOT_NAME_LENGTH,
  MAX_SHARE_WEIGHT,
  fleetNames,
  holdBackIsk,
  splitIsk,
  type SplitRule,
} from '@/engine/communities/fleetPayouts';
import { useMarketHub } from '@/features/market/hub';
import { appraisePaste, type AppraisalOutcome } from '@/features/market/appraisalData';
import { isValidPricePercent, useMarketPricePercent } from '@/features/market/pricePercent';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { formatIsk } from '@/lib/isk';
import { TRADE_HUBS, getTradeHub, type TradeHub } from '@/market/hubs';
import { callableErrorReason } from './callableError';
import { createFleetPayout } from './fleetPayoutStore';
import { resolveFleetRoster, type RosterRow } from './fleetRoster';

const DEBOUNCE_MS = 400;

type Basis = 'buy' | 'sell';

interface Pilot extends RosterRow {
  /** What ticks, weights and the preview are filed under. */
  key: string;
}

const pilotKey = (row: RosterRow) =>
  row.characterId === null ? `n${row.pilotName.toLowerCase()}` : `c${row.characterId}`;

/** A whole-number weight as typed, or null when out of range. */
function parseWeight(text: string | undefined): number | null {
  const trimmed = (text ?? '1').trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= 1 && value <= MAX_SHARE_WEIGHT ? value : null;
}

const clampHoldBack = (pct: number) => Math.min(MAX_HOLD_BACK_PCT, Math.max(0, Math.round(pct)));

/**
 * A new Fleet Payout (issue #4779), one page: a name, the pasted fleet list
 * (resolved through ESI with Member markers, each pilot tickable), the pasted
 * loot priced by the Appraisal engine, the split rule and hold-back, and a
 * live ISK preview per pilot. Names ESI does not know stay as typed.
 */
export function ComposeFleetPayoutDialog({
  characterId,
  communityId,
  members,
  onClose,
  onCreated,
}: {
  characterId: number;
  communityId: string;
  members: { uid: string }[];
  onClose: () => void;
  /** The Payout exists: refetch the list and open it. */
  onCreated: (payoutId: string) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [name, setName] = useState('');
  const [fleetText, setFleetText] = useState('');
  const [lootText, setLootText] = useState('');
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [rule, setRule] = useState<SplitRule>('equal');
  const [holdText, setHoldText] = useState(String(DEFAULT_HOLD_BACK_PCT));
  const [basis, setBasis] = useState<Basis>('buy');
  const [hubPick, setHubPick] = useState<TradeHub['id'] | null>(null);
  const [percentPick, setPercentPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const savedHub = useMarketHub((state) => state.value);
  const savedPercent = useMarketPricePercent((state) => state.value);
  useHydratedStore(useMarketHub, useMarketPricePercent);
  const hub = getTradeHub(hubPick ?? savedHub) ?? TRADE_HUBS[0];
  const percentText = percentPick ?? String(savedPercent);
  const percent = percentText.trim() === '' ? NaN : Number(percentText);
  const percentValid = isValidPricePercent(percent);

  // Roster: debounced and abortable; stale answers (another list since) are ignored by key.
  const names = useMemo(() => fleetNames(fleetText), [fleetText]);
  const overLimit = names.length > MAX_FLEET_SHARES;
  const namesKey = names.join('\n');
  const [roster, setRoster] = useState<{ key: string; rows: RosterRow[]; failed: boolean } | null>(
    null
  );
  useEffect(() => {
    if (names.length === 0 || overLimit) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      resolveFleetRoster(names, members, { signal: controller.signal }).then(
        (rows) => setRoster({ key: namesKey, rows, failed: false }),
        () => {
          if (controller.signal.aborted) return;
          const rows = names.map((pilotName) => ({
            pilotName,
            characterId: null,
            isMember: false,
            notFound: true,
          }));
          setRoster({ key: namesKey, rows, failed: true });
        }
      );
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // names is derived from namesKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesKey, overLimit, members]);
  const resolving = names.length > 0 && !overLimit && roster?.key !== namesKey;
  const pilots = useMemo((): Pilot[] => {
    if (names.length === 0 || overLimit || roster?.key !== namesKey) return [];
    const seen = new Set<string>();
    const out: Pilot[] = [];
    for (const row of roster.rows) {
      const key = pilotKey(row);
      if (seen.has(key)) continue; // two spellings of one character
      seen.add(key);
      out.push({ ...row, key });
    }
    return out;
  }, [names.length, overLimit, roster, namesKey]);

  // Loot: priced once the box has settled, with the Appraisal tab's engine.
  const priceKey = `${lootText}|${hub.id}|${percent}`;
  const wantsPrice = lootText.trim() !== '' && percentValid;
  const [priced, setPriced] = useState<{
    key: string;
    outcome: AppraisalOutcome | null;
  } | null>(null);
  useEffect(() => {
    if (!wantsPrice) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      appraisePaste(lootText, hub, percent, null).then(
        (outcome) => !cancelled && setPriced({ key: priceKey, outcome }),
        () => !cancelled && setPriced({ key: priceKey, outcome: null })
      );
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // hub and percent are folded into priceKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceKey, wantsPrice]);
  const pricing = wantsPrice && priced?.key !== priceKey;
  const outcome = wantsPrice && priced?.key === priceKey ? priced.outcome : null;
  const priceFailed = wantsPrice && priced?.key === priceKey && priced.outcome === null;
  const pile = outcome
    ? Math.min(
        MAX_PAYOUT_ISK,
        Math.floor(basis === 'buy' ? outcome.appraisal.totals.buy : outcome.appraisal.totals.sell)
      )
    : 0;

  const holdParsed = holdText.trim() === '' ? NaN : Number(holdText);
  const holdBackPct = Number.isFinite(holdParsed)
    ? clampHoldBack(holdParsed)
    : DEFAULT_HOLD_BACK_PCT;

  const ticked = pilots.filter((p) => !unticked.has(p.key));
  const weightOf = (p: Pilot) => (rule === 'equal' ? 1 : parseWeight(weights[p.key]));
  const weightsValid = ticked.every((p) => weightOf(p) !== null);
  const rosterFailed = roster?.key === namesKey && roster.failed;
  const nameTooLong = ticked.some((p) => p.pilotName.length > MAX_PILOT_NAME_LENGTH);
  const iskEach = splitIsk(
    pile,
    holdBackPct,
    rule,
    ticked.map((p) => weightOf(p) ?? 1)
  );
  const iskByKey = new Map(ticked.map((p, i) => [p.key, iskEach[i]]));

  const canSubmit =
    name.trim() !== '' &&
    ticked.length >= 1 &&
    ticked.length <= MAX_FLEET_SHARES &&
    weightsValid &&
    !rosterFailed &&
    !nameTooLong &&
    pile > 0;

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const { payoutId } = await createFleetPayout(characterId, communityId, {
        name: name.trim(),
        totalIsk: pile,
        holdBackPct,
        rule,
        shares: ticked.map((p, i) => ({
          pilotName: p.pilotName,
          characterId: p.characterId,
          weight: weightOf(p) ?? 1,
          isk: iskEach[i],
        })),
      });
      onCreated(payoutId);
      onClose();
    } catch (err) {
      setError(
        callableErrorReason(err) === 'too-many-open-payouts'
          ? t('communities.payouts.compose.tooManyOpen')
          : t('communities.payouts.compose.failed')
      );
      setBusy(false);
    }
  };

  const toggleTick = (key: string, on: boolean) =>
    setUnticked((current) => {
      const next = new Set(current);
      if (on) next.delete(key);
      else next.add(key);
      return next;
    });
  const unreadable = outcome?.unmatched.length ?? 0;

  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      title={t('communities.payouts.compose.title')}
      placement="wide"
    >
      <form
        className="space-y-4 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit && !busy) void create();
        }}
      >
        <label className="block space-y-1">
          <span className="block text-xs text-text-dim">
            {t('communities.payouts.compose.name')}
          </span>
          <TextInput
            className="w-full"
            value={name}
            maxLength={MAX_PAYOUT_NAME_LENGTH}
            placeholder={t('communities.payouts.compose.namePlaceholder')}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label className="block space-y-1">
          <span className="block text-xs text-text-dim">
            {t('communities.payouts.compose.fleet')}
          </span>
          <TextArea
            rows={4}
            value={fleetText}
            aria-describedby={`${id}-fleet`}
            onChange={(e) => setFleetText(e.target.value)}
          />
        </label>
        <div id={`${id}-fleet`} className="space-y-1 text-xs">
          {overLimit && (
            <p role="alert" className="text-danger">
              {t('communities.payouts.compose.tooManyPilots', {
                count: names.length,
                max: MAX_FLEET_SHARES,
              })}
            </p>
          )}
          {resolving && <Spinner size="sm" label={t('communities.payouts.compose.resolving')} />}
          {rosterFailed && (
            <p role="alert" className="text-warning">
              {t('communities.payouts.compose.resolveFailed')}
            </p>
          )}
          {nameTooLong && (
            <p role="alert" className="text-warning">
              {t('communities.payouts.compose.nameTooLong', { max: MAX_PILOT_NAME_LENGTH })}
            </p>
          )}
        </div>

        <label className="block space-y-1">
          <span className="block text-xs text-text-dim">
            {t('communities.payouts.compose.loot')}
          </span>
          <TextArea
            rows={4}
            value={lootText}
            aria-describedby={`${id}-loot`}
            onChange={(e) => setLootText(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1">
            <span className="block text-xs text-text-dim">
              {t('communities.payouts.compose.hub')}
            </span>
            <NativeSelect
              size="sm"
              value={hub.id}
              onChange={(e) => setHubPick(e.target.value as TradeHub['id'])}
            >
              {TRADE_HUBS.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.systemName}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-text-dim">
              {t('communities.payouts.compose.percent')}
            </span>
            <TextInput
              size="sm"
              type="number"
              inputMode="decimal"
              aria-invalid={!percentValid || undefined}
              className="field-no-spinner w-20 text-right"
              value={percentText}
              onChange={(e) => setPercentPick(e.target.value)}
            />
          </label>
          <SegmentedControl
            size="sm"
            label={t('communities.payouts.compose.basis')}
            value={basis}
            onChange={setBasis}
            options={[
              { value: 'buy', label: t('communities.payouts.compose.basisBuy') },
              { value: 'sell', label: t('communities.payouts.compose.basisSell') },
            ]}
          />
        </div>
        <div id={`${id}-loot`} className="space-y-1 text-xs" role="status">
          {pricing && <Spinner size="sm" label={t('communities.payouts.compose.pricing')} />}
          {priceFailed && (
            <p role="alert" className="text-danger">
              {t('communities.payouts.compose.priceFailed')}
            </p>
          )}
          {outcome?.pricesUnreachable && (
            <p className="text-warning">{t('communities.payouts.compose.pricesUnreachable')}</p>
          )}
          {outcome && !outcome.pricesUnreachable && (
            <p className="text-sm font-medium tabular-nums">
              {t('communities.payouts.compose.pileValue', { isk: formatIsk(pile) })}
            </p>
          )}
          {unreadable > 0 && (
            <p className="text-warning">
              {t('communities.payouts.compose.unreadable', { count: unreadable })}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <SegmentedControl
            size="sm"
            label={t('communities.payouts.compose.rule')}
            value={rule}
            onChange={setRule}
            options={[
              { value: 'equal', label: t('communities.payouts.compose.ruleEqual') },
              { value: 'weighted', label: t('communities.payouts.compose.ruleWeighted') },
            ]}
          />
          <label className="space-y-1">
            <span className="block text-xs text-text-dim">
              {t('communities.payouts.compose.holdBack')}
            </span>
            <TextInput
              size="sm"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_HOLD_BACK_PCT}
              className="field-no-spinner w-20 text-right"
              value={holdText}
              aria-describedby={`${id}-hold`}
              onChange={(e) => setHoldText(e.target.value)}
              onBlur={() => setHoldText(String(holdBackPct))}
            />
          </label>
          <p id={`${id}-hold`} className="min-w-0 flex-1 text-xs text-text-dim">
            {t('communities.payouts.compose.holdBackHint', { max: MAX_HOLD_BACK_PCT })}
          </p>
        </div>

        {pilots.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-text-dim">{t('communities.payouts.compose.preview')}</p>
            <ul
              aria-label={t('communities.payouts.compose.pilotsLabel')}
              className="divide-y divide-line rounded-xs border border-line"
            >
              {pilots.map((pilot) => {
                const on = !unticked.has(pilot.key);
                const weightText = weights[pilot.key] ?? '1';
                return (
                  <li key={pilot.key} className="flex items-center gap-3 px-3 py-1.5">
                    <label className={touchCheckboxLabelClassName}>
                      <Checkbox
                        aria-label={t('communities.payouts.compose.include', {
                          name: pilot.pilotName,
                        })}
                        checked={on}
                        onChange={(e) => toggleTick(pilot.key, e.target.checked)}
                      />
                    </label>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{pilot.pilotName}</span>
                      <span className="flex flex-wrap items-center gap-1 text-xs text-text-dim">
                        {pilot.isMember && <Pill>{t('communities.payouts.compose.member')}</Pill>}
                        {pilot.notFound && (
                          <span className="inline-flex items-center gap-1">
                            {t('communities.payouts.compose.notFound')}
                            <InfoTooltip
                              label={t('communities.payouts.compose.notFound')}
                              content={t('communities.payouts.compose.notFoundHint')}
                              glyph="info"
                            />
                          </span>
                        )}
                      </span>
                    </span>
                    {rule === 'weighted' && on && (
                      <TextInput
                        size="sm"
                        inputMode="numeric"
                        aria-label={t('communities.payouts.compose.weightOf', {
                          name: pilot.pilotName,
                        })}
                        aria-invalid={parseWeight(weightText) === null || undefined}
                        className="w-16 text-right tabular-nums"
                        value={weightText}
                        onChange={(e) =>
                          setWeights((current) => ({ ...current, [pilot.key]: e.target.value }))
                        }
                      />
                    )}
                    <span className="w-32 text-right tabular-nums">
                      {on
                        ? t('communities.payouts.compose.previewRow', {
                            isk: formatIsk(iskByKey.get(pilot.key) ?? 0),
                          })
                        : ''}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-text-dim tabular-nums">
              {t('communities.payouts.compose.heldBack', {
                isk: formatIsk(holdBackIsk(pile, holdBackPct)),
              })}
            </p>
          </div>
        )}

        {error && <InlineError>{error}</InlineError>}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" variant="primary" type="submit" loading={busy} disabled={!canSubmit}>
            {t('communities.payouts.compose.create')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
