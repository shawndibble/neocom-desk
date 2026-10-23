import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { chunkRateFor } from '@/engine/corpTaxBook/extraction';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  Field,
  Fields,
  IskInput,
  Modal,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TabPanel,
  Tabs,
  TextInput,
  useTabsId,
  type TabItem,
} from '@/components/ui';
import type { TaxRate } from '@/engine/corpTaxBook/rates';
import { Pill } from '@/components/ui/Pill';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { TRADE_HUBS } from '@/market/hubs';
import { callableErrorText } from './feederErrorText';
import { useBook } from './useBook';
import { Label } from './BookDialogs';
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

/** A UTC day in the viewer's locale, the way a native date input prints it. */
const displayDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC' });

const DIVISIONS = [1, 2, 3, 4, 5, 6, 7] as const;
const RATE_SCOPES = ['corp', 'guest', 'miner', 'moon', 'structure', 'feeder'] as const;

function rateLabel(
  rate: TaxRate,
  character: (minerId: string) => string,
  refinery: (structureId: number) => string,
  corporation: (corporationId: number) => string
): string {
  switch (rate.scope) {
    case 'miner':
      return character(rate.minerId);
    case 'moon':
      return `Moon ${rate.moonId}`;
    case 'structure':
      return refinery(rate.structureId);
    case 'feeder':
      return corporation(rate.feederId);
    case 'record':
      return rate.recordKey;
    default:
      return '';
  }
}

/** The settings dialog's four tabs. */
export type SettingsTab = 'rates' | 'billing' | 'extractions' | 'access';

/**
 * The book's settings (D21: from the page header's gear): the dated rates
 * (corp default, Guest default, per-Miner, per-moon, per-refinery, per-moon-owner), hub and Ore Form, grace,
 * minimum Statement, Overdue days, divisions, cadence, chunk rate, per-structure
 * expiry and the dismissal approval limit. A rate is never retroactive, so a
 * new one starts today or later; everything else saves as one patch.
 */
export function BookSettingsDialog({
  open,
  onClose,
  initialTab,
}: {
  open: boolean;
  onClose: () => void;
  /** The tab it opens on; a return from EVE's opt-in opens Access either way. */
  initialTab?: SettingsTab;
}) {
  const { t } = useTranslation();
  const { settings, view, names, edit, canEdit, verdict, data } = useBook();
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
  const [rateRefinery, setRateRefinery] = useState('');
  const [rateOwner, setRateOwner] = useState('');
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
  // Every refinery the book reads, a moon owner's included: its rows never carry a moon (#4621).
  const refineries = useMemo(
    () =>
      [...new Set([...structures, ...view.input.entries.map((e) => e.structureId)])].sort(
        (a, b) => a - b
      ),
    [structures, view.input.entries]
  );
  // The moon owners still in the book: one that left or was removed mines here no more.
  const owners = useMemo(
    () =>
      (data.feeders ?? [])
        .filter((f) => f.status !== 'left' && f.status !== 'removed')
        .map((f) => f.corporationId),
    [data.feeders]
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
      setError(callableErrorText(t, e, 'corpTaxBook.moons.dialogs.failed'));
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
            : rateScope === 'structure'
              ? { scope: 'structure', structureId: Number(rateRefinery), ...base }
              : rateScope === 'feeder'
                ? { scope: 'feeder', feederId: Number(rateOwner), ...base }
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
    (rateScope !== 'moon' || rateMoon !== '') &&
    (rateScope !== 'structure' || rateRefinery !== '') &&
    (rateScope !== 'feeder' || rateOwner !== '');
  const rates = [...settings.rates]
    .filter((r): r is Exclude<TaxRate, { scope: 'record' }> => r.scope !== 'record')
    .sort(
      (a, b) => a.scope.localeCompare(b.scope) || b.effectiveFrom.localeCompare(a.effectiveFrom)
    );

  const tabsId = useTabsId();
  const fieldId = useId();
  // Back from EVE's page after the Automatic sync opt-in: open where its notice is shown.
  const { state: routerState } = useLocation();
  const [tab, setTab] = useState<SettingsTab>(() =>
    (routerState as { corpSyncGrant?: unknown } | null)?.corpSyncGrant !== undefined
      ? 'access'
      : (initialTab ?? 'rates')
  );
  const tabs: TabItem[] = [
    { id: 'rates', label: t('corpTaxBook.moons.settings.tabs.rates') },
    { id: 'billing', label: t('corpTaxBook.moons.settings.tabs.billing') },
    { id: 'extractions', label: t('corpTaxBook.moons.settings.tabs.extractions') },
    { id: 'access', label: t('corpTaxBook.moons.settings.tabs.access') },
  ];

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
      <div className="space-y-4 text-sm">
        <Tabs
          tabsId={tabsId}
          tabs={tabs}
          value={tab}
          onChange={(id) => setTab(id as SettingsTab)}
          label={t('corpTaxBook.moons.settings.sections')}
        />
        <TabPanel tabsId={tabsId} tabId={tab} className="space-y-5">
          {tab === 'rates' && (
            <>
              <p className="max-w-2xl text-xs text-text-dim">
                {t('corpTaxBook.moons.settings.ratesHint')}
              </p>
              <ul className="divide-y divide-line rounded-xs border border-line">
                {rates.map((r) => {
                  const target = rateLabel(r, minerName, names.refinery, names.corporation);
                  const scheduled = r.effectiveFrom > today;
                  return (
                    <li
                      key={`${r.scope}-${'minerId' in r ? r.minerId : ''}-${'moonId' in r ? r.moonId : ''}-${'structureId' in r ? r.structureId : ''}-${'feederId' in r ? r.feederId : ''}-${r.effectiveFrom}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
                    >
                      <Pill>{t(`corpTaxBook.moons.settings.rateScope.${r.scope}`)}</Pill>
                      {target && (
                        <span className="min-w-0 flex-1 basis-44 break-words">{target}</span>
                      )}
                      <span className="ml-auto flex items-center gap-3">
                        <span className="text-xs text-text-dim tabular-nums">
                          {t('corpTaxBook.moons.settings.from', {
                            date: displayDate(r.effectiveFrom),
                          })}
                        </span>
                        {scheduled && (
                          <Pill tone="warning">{t('corpTaxBook.moons.settings.scheduled')}</Pill>
                        )}
                        <span className="w-14 text-right font-semibold tabular-nums">{r.pct}%</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              {canEdit && (
                <div className="space-y-3 rounded-xs bg-panel-2 p-3">
                  <h3 className={eyebrowClassName}>
                    {t('corpTaxBook.moons.settings.addRateTitle')}
                  </h3>
                  <div className="grid items-end gap-3 sm:grid-cols-4">
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
                          {RATE_SCOPES.filter((s) => s !== 'feeder' || owners.length > 0).map(
                            (s) => (
                              <SelectItem key={s} value={s}>
                                {t(`corpTaxBook.moons.settings.rateScope.${s}`)}
                              </SelectItem>
                            )
                          )}
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
                    {rateScope === 'structure' && (
                      <Label text={t('corpTaxBook.moons.settings.rateScope.structure')}>
                        <Select value={rateRefinery} onValueChange={setRateRefinery}>
                          <SelectTrigger
                            aria-label={t('corpTaxBook.moons.settings.rateScope.structure')}
                            className="w-full"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {refineries.map((id) => (
                              <SelectItem key={id} value={String(id)}>
                                {names.refinery(id)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Label>
                    )}
                    {rateScope === 'feeder' && (
                      <Label text={t('corpTaxBook.moons.settings.rateScope.feeder')}>
                        <Select value={rateOwner} onValueChange={setRateOwner}>
                          <SelectTrigger
                            aria-label={t('corpTaxBook.moons.settings.rateScope.feeder')}
                            className="w-full"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {owners.map((id) => (
                              <SelectItem key={id} value={String(id)}>
                                {names.corporation(id)}
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
                    <Button
                      variant="primary"
                      onClick={() => void addRate()}
                      disabled={!rateReady || busy}
                    >
                      {t('corpTaxBook.moons.settings.addRate')}
                    </Button>
                  </div>
                  <p className="text-xs text-text-dim">
                    {t('corpTaxBook.moons.settings.ratesLive')}
                  </p>
                </div>
              )}
            </>
          )}

          {tab === 'billing' && (
            <>
              <Section title={t('corpTaxBook.moons.settings.pricing')}>
                <Fields variant="form">
                  <Field label={t('corpTaxBook.moons.settings.hub')}>
                    <Select value={hubId} onValueChange={setHubId}>
                      <SelectTrigger aria-label={t('corpTaxBook.moons.settings.hub')}>
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
                  </Field>
                  <Field label={t('corpTaxBook.moons.settings.oreForm')}>
                    <SegmentedControl
                      label={t('corpTaxBook.moons.settings.oreForm')}
                      value={oreForm}
                      onChange={setOreForm}
                      options={[
                        {
                          value: 'compressed',
                          label: t('corpTaxBook.moons.settings.form.compressed'),
                        },
                        { value: 'raw', label: t('corpTaxBook.moons.settings.form.raw') },
                      ]}
                      uppercase={false}
                    />
                  </Field>
                </Fields>
              </Section>

              <Section title={t('corpTaxBook.moons.settings.statements')}>
                <Fields variant="form">
                  {/* Chosen once when the Director turns the book on (D10); the server never changes it. */}
                  <Field label={t('corpTaxBook.moons.settings.startDate')}>
                    <span className="tabular-nums">{displayDate(settings.startDate)}</span>
                  </Field>
                  <Field label={t('corpTaxBook.moons.settings.cadenceLabel')}>
                    <SegmentedControl
                      label={t('corpTaxBook.moons.settings.cadenceLabel')}
                      value={cadence}
                      onChange={setCadence}
                      options={[
                        {
                          value: 'monthly',
                          label: t('corpTaxBook.moons.settings.cadence.monthly'),
                        },
                        { value: 'days', label: t('corpTaxBook.moons.settings.cadence.days') },
                      ]}
                      uppercase={false}
                    />
                    {cadence === 'days' && (
                      <TextInput
                        className="w-20"
                        inputMode="numeric"
                        aria-label={t('corpTaxBook.moons.settings.cadenceDays')}
                        value={cadenceDays}
                        onChange={(e) => setCadenceDays(e.target.value)}
                      />
                    )}
                  </Field>
                  <Field label={t('corpTaxBook.moons.settings.minimum')}>
                    <IskInput
                      value={minimum}
                      onChange={setMinimum}
                      aria-label={t('corpTaxBook.moons.settings.minimum')}
                    />
                  </Field>
                  <Field label={t('corpTaxBook.moons.settings.grace')} htmlFor={`${fieldId}-grace`}>
                    <TextInput
                      className="w-20"
                      inputMode="numeric"
                      id={`${fieldId}-grace`}
                      value={grace}
                      onChange={(e) => setGrace(e.target.value)}
                    />
                  </Field>
                  <Field
                    label={t('corpTaxBook.moons.settings.overdue')}
                    htmlFor={`${fieldId}-overdue`}
                  >
                    <TextInput
                      className="w-20"
                      inputMode="numeric"
                      id={`${fieldId}-overdue`}
                      value={overdue}
                      onChange={(e) => setOverdue(e.target.value)}
                    />
                  </Field>
                  <Field label={t('corpTaxBook.moons.settings.divisions')}>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
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
                  </Field>
                </Fields>
              </Section>
            </>
          )}

          {tab === 'extractions' && (
            <Section title={t('corpTaxBook.moons.settings.extractions')}>
              <Fields variant="form">
                <Field
                  label={t('corpTaxBook.moons.settings.chunk')}
                  htmlFor={`${fieldId}-chunk`}
                  note={t('corpTaxBook.moons.settings.chunkHint')}
                >
                  <TextInput
                    className="w-28"
                    inputMode="numeric"
                    id={`${fieldId}-chunk`}
                    value={chunk}
                    onChange={(e) => setChunk(e.target.value)}
                    placeholder="30000"
                  />
                </Field>
                {structures.map((id) => {
                  const learned = view.chunkRates.get(id);
                  return (
                    <Field
                      key={id}
                      label={t('corpTaxBook.moons.settings.expiry', { name: names.refinery(id) })}
                      htmlFor={`${fieldId}-expiry-${id}`}
                      note={
                        learned
                          ? t('corpTaxBook.moons.settings.measured', {
                              name: names.refinery(id),
                              rate: formatDecimal(learned.m3PerHour),
                              count: learned.cycles,
                            })
                          : t('corpTaxBook.moons.settings.notMeasured', {
                              name: names.refinery(id),
                              rate: formatDecimal(
                                chunkRateFor(undefined, settings.chunkM3PerHour ?? undefined)
                                  .m3PerHour
                              ),
                            })
                      }
                    >
                      <TextInput
                        className="w-20"
                        inputMode="numeric"
                        id={`${fieldId}-expiry-${id}`}
                        value={expiry[String(id)] ?? ''}
                        placeholder="48"
                        onChange={(e) =>
                          setExpiry((prev) => ({ ...prev, [String(id)]: e.target.value }))
                        }
                      />
                    </Field>
                  );
                })}
              </Fields>
            </Section>
          )}

          {tab === 'access' && (
            <>
              <Section title={t('corpTaxBook.moons.settings.approvals')}>
                <Fields variant="form">
                  <Field
                    label={t('corpTaxBook.moons.settings.approvalLimit')}
                    note={
                      verdict.isDirector
                        ? settings.dismissApprovalAboveIsk === null
                          ? t('corpTaxBook.moons.settings.approvalHintNone')
                          : t('corpTaxBook.moons.settings.approvalHint', {
                              limit: isk(settings.dismissApprovalAboveIsk),
                            })
                        : t('corpTaxBook.moons.settings.approvalDirector')
                    }
                  >
                    <IskInput
                      value={approval}
                      onChange={setApproval}
                      disabled={!verdict.isDirector}
                      aria-label={t('corpTaxBook.moons.settings.approvalLimit')}
                    />
                  </Field>
                </Fields>
              </Section>

              <AutomaticSyncSection />

              <ReclaimBookSection />

              <DeleteBookSection />
            </>
          )}
        </TabPanel>
      </div>
    </Modal>
  );
}
