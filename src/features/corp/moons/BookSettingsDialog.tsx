import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useMemo, useState, type ReactNode } from 'react';
import { chunkRateFor } from '@/engine/corpTaxBook/extraction';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  IskInput,
  Modal,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextInput,
} from '@/components/ui';
import type { TaxRate } from '@/engine/corpTaxBook/rates';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { TRADE_HUBS } from '@/market/hubs';
import { editErrorMessage, useBook } from './useBook';
import { isk } from './moonsFormat';
import { AutomaticSyncSection } from './AutomaticSyncSection';
import { DeleteBookSection } from './DeleteBookSection';
import { ReclaimBookSection } from './ReclaimBookSection';
import { createNumberFormat } from '@/lib/numberLocale';

const formatDecimal = createNumberFormat({ maximumFractionDigits: 3 });

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className={eyebrowClassName}>{title}</h3>
      {children}
    </section>
  );
}

function Label({ text, children }: { text: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs text-text-dim">{text}</span>
      {children}
    </label>
  );
}

/** A UTC day in the viewer's locale, the way a native date input prints it. */
const displayDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC' });

const DIVISIONS = [1, 2, 3, 4, 5, 6, 7] as const;
const RATE_SCOPES = ['corp', 'guest', 'miner', 'moon'] as const;

function rateLabel(rate: TaxRate, character: (minerId: string) => string): string {
  switch (rate.scope) {
    case 'miner':
      return character(rate.minerId);
    case 'moon':
      return `Moon ${rate.moonId}`;
    case 'record':
      return rate.recordKey;
    default:
      return '';
  }
}

/**
 * The book's settings (D21: from the page header's gear): the dated rates
 * (corp default, Guest default, per-Miner, per-moon), hub and Ore Form, grace,
 * minimum Statement, Overdue days, divisions, cadence, chunk rate, per-structure
 * expiry and the dismissal approval limit. A rate is never retroactive, so a
 * new one starts today or later; everything else saves as one patch.
 */
export function BookSettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { settings, view, names, edit, canEdit, verdict } = useBook();
  const [hubId, setHubId] = useState(settings.hubId);
  const [oreForm, setOreForm] = useState(settings.oreForm);
  const [grace, setGrace] = useState(String(settings.graceHours));
  const [minimum, setMinimum] = useState(String(settings.minimumStatement));
  const [overdue, setOverdue] = useState(String(settings.overdueDays));
  const [divisions, setDivisions] = useState<number[]>(settings.divisions);
  const [cadence, setCadence] = useState(settings.cadence.kind);
  const [cadenceDays, setCadenceDays] = useState(
    settings.cadence.kind === 'days' ? String(settings.cadence.days) : '14'
  );
  const [chunk, setChunk] = useState(
    settings.chunkM3PerHour ? String(settings.chunkM3PerHour) : ''
  );
  const [approval, setApproval] = useState(
    settings.dismissApprovalAboveIsk === null ? '' : String(settings.dismissApprovalAboveIsk)
  );
  const [expiry, setExpiry] = useState<Record<string, string>>(
    Object.fromEntries(
      Object.entries(settings.structureExpiryHours).map(([k, v]) => [k, String(v)])
    )
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [rateScope, setRateScope] = useState<(typeof RATE_SCOPES)[number]>('corp');
  const [rateMiner, setRateMiner] = useState('');
  const [rateMoon, setRateMoon] = useState('');
  const [ratePct, setRatePct] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const [rateFrom, setRateFrom] = useState(today);

  const structures = useMemo(
    () => [...new Set(view.input.extractions.map((x) => x.structureId))],
    [view.input.extractions]
  );
  const moons = useMemo(
    () => [...new Set(view.input.extractions.map((x) => x.moonId))],
    [view.input.extractions]
  );
  const minerName = (id: string) => {
    const m = view.miners.find((x) => x.id === id);
    return m ? names.character(m.mainCharacterId) : id;
  };

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(editErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      const patch: Record<string, unknown> = {
        hubId,
        oreForm,
        graceHours: Number(grace),
        minimumStatement: Number(minimum),
        overdueDays: Number(overdue),
        divisions: [...divisions].sort(),
        cadence:
          cadence === 'monthly'
            ? { kind: 'monthly' }
            : { kind: 'days', days: Number(cadenceDays), anchor: settings.startDate },
        structureExpiryHours: Object.fromEntries(
          Object.entries(expiry)
            .filter(([, v]) => v !== '' && Number(v) > 0)
            .map(([k, v]) => [k, Number(v)])
        ),
      };
      if (chunk !== '') patch.chunkM3PerHour = Number(chunk);
      if (verdict.isDirector)
        patch.dismissApprovalAboveIsk = approval === '' ? null : Number(approval);
      await edit({ action: 'updateSettings', patch });
      onClose();
    });

  const addRate = () =>
    run(async () => {
      const base = { pct: Number(ratePct), effectiveFrom: rateFrom };
      const rate =
        rateScope === 'miner'
          ? { scope: 'miner', minerId: rateMiner, ...base }
          : rateScope === 'moon'
            ? { scope: 'moon', moonId: Number(rateMoon), ...base }
            : { scope: rateScope, ...base };
      await edit({ action: 'addRate', rate });
      setRatePct('');
    });

  const rateReady =
    ratePct !== '' &&
    Number(ratePct) >= 0 &&
    Number(ratePct) <= 100 &&
    rateFrom >= today &&
    (rateScope !== 'miner' || rateMiner !== '') &&
    (rateScope !== 'moon' || rateMoon !== '');
  const rates = [...settings.rates]
    .filter((r): r is Exclude<TaxRate, { scope: 'record' }> => r.scope !== 'record')
    .sort(
      (a, b) => a.scope.localeCompare(b.scope) || b.effectiveFrom.localeCompare(a.effectiveFrom)
    );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('corpTaxBook.moons.settings.title')}
      placement="wide"
      footer={
        <div className="flex items-center justify-between gap-2">
          {error ? (
            <span role="alert" className="text-sm text-danger">
              {error}
            </span>
          ) : (
            <span className="text-xs text-text-dim">{t('corpTaxBook.moons.dialogs.logged')}</span>
          )}
          <span className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              {t('common.close')}
            </Button>
            <Button variant="primary" onClick={() => void save()} disabled={!canEdit || busy}>
              {t('common.save')}
            </Button>
          </span>
        </div>
      }
    >
      <div className="space-y-5 text-sm">
        <Section title={t('corpTaxBook.moons.settings.rates')}>
          <p className="text-xs text-text-dim">{t('corpTaxBook.moons.settings.ratesHint')}</p>
          <ul className="divide-y divide-line">
            {rates.map((r) => (
              <li
                key={`${r.scope}-${'minerId' in r ? r.minerId : ''}-${'moonId' in r ? r.moonId : ''}-${r.effectiveFrom}`}
                className="flex flex-wrap justify-between gap-2 py-1.5"
              >
                <span>
                  {t(`corpTaxBook.moons.settings.rateScope.${r.scope}`)}
                  {rateLabel(r, minerName) && ` · ${rateLabel(r, minerName)}`}
                </span>
                <span className="tabular-nums text-text-dim">
                  {r.pct}% ·{' '}
                  {t('corpTaxBook.moons.settings.from', { date: displayDate(r.effectiveFrom) })}
                </span>
              </li>
            ))}
          </ul>
          {canEdit && (
            <div className="grid gap-2 sm:grid-cols-4">
              <Label text={t('corpTaxBook.moons.settings.rateFor')}>
                <Select
                  value={rateScope}
                  onValueChange={(v) => setRateScope(v as typeof rateScope)}
                >
                  <SelectTrigger
                    aria-label={t('corpTaxBook.moons.settings.rateFor')}
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RATE_SCOPES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(`corpTaxBook.moons.settings.rateScope.${s}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Label>
              {rateScope === 'miner' && (
                <Label text={t('corpTaxBook.moons.cols.miner')}>
                  <Select value={rateMiner} onValueChange={setRateMiner}>
                    <SelectTrigger
                      aria-label={t('corpTaxBook.moons.cols.miner')}
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {view.miners.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {names.character(m.mainCharacterId)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Label>
              )}
              {rateScope === 'moon' && (
                <Label text={t('corpTaxBook.moons.settings.moon')}>
                  <Select value={rateMoon} onValueChange={setRateMoon}>
                    <SelectTrigger
                      aria-label={t('corpTaxBook.moons.settings.moon')}
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {moons.map((m) => (
                        <SelectItem key={m} value={String(m)}>
                          {names.moon(m)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Label>
              )}
              <Label text={t('corpTaxBook.moons.settings.pct')}>
                <TextInput
                  className="w-full"
                  inputMode="decimal"
                  value={ratePct}
                  onChange={(e) => setRatePct(e.target.value)}
                />
              </Label>
              <Label text={t('corpTaxBook.moons.settings.effectiveFrom')}>
                <TextInput
                  className="w-full"
                  type="date"
                  min={today}
                  value={rateFrom}
                  onChange={(e) => setRateFrom(e.target.value)}
                />
              </Label>
              <div className="flex items-end">
                <Button onClick={() => void addRate()} disabled={!rateReady || busy}>
                  {t('corpTaxBook.moons.settings.addRate')}
                </Button>
              </div>
            </div>
          )}
        </Section>

        <Section title={t('corpTaxBook.moons.settings.pricing')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Label text={t('corpTaxBook.moons.settings.hub')}>
              <Select value={hubId} onValueChange={setHubId}>
                <SelectTrigger aria-label={t('corpTaxBook.moons.settings.hub')} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRADE_HUBS.map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.systemName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Label>
            <Label text={t('corpTaxBook.moons.settings.oreForm')}>
              <SegmentedControl
                label={t('corpTaxBook.moons.settings.oreForm')}
                value={oreForm}
                onChange={setOreForm}
                options={[
                  { value: 'compressed', label: t('corpTaxBook.moons.settings.form.compressed') },
                  { value: 'raw', label: t('corpTaxBook.moons.settings.form.raw') },
                ]}
                uppercase={false}
              />
            </Label>
          </div>
        </Section>

        <Section title={t('corpTaxBook.moons.settings.billing')}>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <span className="block text-xs text-text-dim">
                {t('corpTaxBook.moons.settings.startDate')}
              </span>
              {/* Chosen once when the Director turns the book on (D10); the server never changes it. */}
              <p className="py-1.5 tabular-nums">{displayDate(settings.startDate)}</p>
            </div>
            <Label text={t('corpTaxBook.moons.settings.grace')}>
              <TextInput
                className="w-full"
                inputMode="numeric"
                value={grace}
                onChange={(e) => setGrace(e.target.value)}
              />
            </Label>
            <Label text={t('corpTaxBook.moons.settings.overdue')}>
              <TextInput
                className="w-full"
                inputMode="numeric"
                value={overdue}
                onChange={(e) => setOverdue(e.target.value)}
              />
            </Label>
            <Label text={t('corpTaxBook.moons.settings.minimum')}>
              <IskInput
                value={minimum}
                onChange={setMinimum}
                aria-label={t('corpTaxBook.moons.settings.minimum')}
              />
            </Label>
            <Label text={t('corpTaxBook.moons.settings.cadenceLabel')}>
              <SegmentedControl
                label={t('corpTaxBook.moons.settings.cadenceLabel')}
                value={cadence}
                onChange={setCadence}
                options={[
                  { value: 'monthly', label: t('corpTaxBook.moons.settings.cadence.monthly') },
                  { value: 'days', label: t('corpTaxBook.moons.settings.cadence.days') },
                ]}
                uppercase={false}
              />
            </Label>
            {cadence === 'days' && (
              <Label text={t('corpTaxBook.moons.settings.cadenceDays')}>
                <TextInput
                  className="w-full"
                  inputMode="numeric"
                  value={cadenceDays}
                  onChange={(e) => setCadenceDays(e.target.value)}
                />
              </Label>
            )}
          </div>
          <fieldset className="space-y-1">
            <legend className="text-xs text-text-dim">
              {t('corpTaxBook.moons.settings.divisions')}
            </legend>
            <div className="flex flex-wrap gap-3">
              {DIVISIONS.map((d) => (
                <label key={d} className={cx(touchCheckboxLabelClassName, 'gap-1.5')}>
                  <Checkbox
                    checked={divisions.includes(d)}
                    onChange={() =>
                      setDivisions((prev) =>
                        prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
                      )
                    }
                    aria-label={t('corpTaxBook.moons.settings.division', { n: d })}
                  />
                  {d}
                </label>
              ))}
            </div>
          </fieldset>
        </Section>

        <Section title={t('corpTaxBook.moons.settings.extractions')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Label text={t('corpTaxBook.moons.settings.chunk')}>
              <TextInput
                className="w-full"
                inputMode="numeric"
                value={chunk}
                onChange={(e) => setChunk(e.target.value)}
                placeholder="30000"
              />
            </Label>
            <ul className="space-y-0.5 text-xs text-text-dim sm:col-span-2">
              <li>{t('corpTaxBook.moons.settings.chunkHint')}</li>
              {structures.map((id) => {
                const learned = view.chunkRates.get(id);
                return (
                  <li key={id}>
                    {learned
                      ? t('corpTaxBook.moons.settings.measured', {
                          name: names.refinery(id),
                          rate: formatDecimal(learned.m3PerHour),
                          count: learned.cycles,
                        })
                      : t('corpTaxBook.moons.settings.notMeasured', {
                          name: names.refinery(id),
                          rate: formatDecimal(
                            chunkRateFor(undefined, settings.chunkM3PerHour ?? undefined).m3PerHour
                          ),
                        })}
                  </li>
                );
              })}
            </ul>
            {structures.map((id) => (
              <Label
                key={id}
                text={t('corpTaxBook.moons.settings.expiry', { name: names.refinery(id) })}
              >
                <TextInput
                  className="w-full"
                  inputMode="numeric"
                  value={expiry[String(id)] ?? ''}
                  placeholder="48"
                  onChange={(e) => setExpiry((prev) => ({ ...prev, [String(id)]: e.target.value }))}
                />
              </Label>
            ))}
          </div>
        </Section>

        <Section title={t('corpTaxBook.moons.settings.approvals')}>
          <Label text={t('corpTaxBook.moons.settings.approvalLimit')}>
            <IskInput
              value={approval}
              onChange={setApproval}
              disabled={!verdict.isDirector}
              aria-label={t('corpTaxBook.moons.settings.approvalLimit')}
            />
          </Label>
          <p className="text-xs text-text-dim">
            {verdict.isDirector
              ? settings.dismissApprovalAboveIsk === null
                ? t('corpTaxBook.moons.settings.approvalHintNone')
                : t('corpTaxBook.moons.settings.approvalHint', {
                    limit: isk(settings.dismissApprovalAboveIsk),
                  })
              : t('corpTaxBook.moons.settings.approvalDirector')}
          </p>
        </Section>

        <AutomaticSyncSection />

        <ReclaimBookSection />

        <DeleteBookSection />
      </div>
    </Modal>
  );
}
