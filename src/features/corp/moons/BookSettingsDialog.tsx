import { parsePercent } from '@/lib/parsePercent';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { chunkRateFor } from '@/engine/corpTaxBook/extraction';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  Field,
  FieldsHeading,
  Fields,
  InfoTooltip,
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
  Tooltip,
  useTabsId,
  type TabItem,
} from '@/components/ui';
import { earliestRateStart, type TaxRate } from '@/engine/corpTaxBook/rates';
import { Pill } from '@/components/ui/Pill';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { COMPARED_HUBS } from '@/market/hubs';
import { callableErrorText } from './feederErrorText';
import { useBook } from './useBook';
import { Label } from './BookDialogs';
import { SharingTab } from './SharingTab';
import type { SettingsTab } from './moonsPaths';
import { isk } from './moonsFormat';
import { datedRateReady } from './rateForm';
import { AutomaticSyncSection } from './AutomaticSyncSection';
import { DeleteBookSection } from './DeleteBookSection';
import { ExportBookSection } from './ExportBook';
import { ReclaimBookSection } from './ReclaimBookSection';
import { TaxContactSection } from './TaxContactSection';
import { draftFromContact, taxContactPatch } from './taxContactDraft';
import { createNumberFormat } from '@/lib/numberLocale';
import { useCorpAccess } from '../useCorpAccess';
import { loadCorporationDivisions } from '../wallet';
import { divisionNamesFor } from '../taxBook/pushDivisionNames';
import { primaryDivisionOf } from '@/engine/corpTaxBook/uncounted';
import { utcDay } from '@/engine/localDay';
import { formatIsoDay } from '@/lib/formatDateTick';
import { lockDateFor } from '../../../../functions/src/corpTaxBookCheckpoint';
import {
  DEFAULT_NOTICE_RULES,
  parseNoticeRules,
  type NoticeAfter,
  type NoticeRules,
} from '@/engine/corpTaxBook/notices';
import { DividedList } from '@/components/ui/DividedList';

const formatDecimal = createNumberFormat({ maximumFractionDigits: 3 });
const behindDefault =
  DEFAULT_NOTICE_RULES.after.kind === 'behind' ? DEFAULT_NOTICE_RULES.after.days : 14;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className={eyebrowClassName}>{title}</h3>
      {children}
    </section>
  );
}

const DIVISIONS = [1, 2, 3, 4, 5, 6, 7] as const;
const RATE_SCOPES = [
  'corp',
  'guest',
  'miner',
  'moon',
  'structure',
  'feeder',
  'feeder-member',
] as const;
const OWNER_SCOPES: readonly string[] = ['feeder', 'feeder-member'];

type NewRate = Exclude<TaxRate, { scope: 'record' }>;

const pendingKey = (r: NewRate) =>
  [
    r.scope,
    'minerId' in r ? r.minerId : '',
    'moonId' in r ? r.moonId : '',
    'structureId' in r ? r.structureId : '',
    'feederId' in r ? r.feederId : '',
    r.effectiveFrom,
  ].join(':');

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
    case 'feeder-member':
      return corporation(rate.feederId);
    case 'record':
      return rate.recordKey;
    default:
      return '';
  }
}

const NO_DIVISION_NAMES = new Map<number, string>();

function useWalletDivisionNames(characterId: number, corporationId: number): Map<number, string> {
  const canRead = useCorpAccess().capabilities.canReadDivisions;
  const load = useCallback(
    () =>
      loadCorporationDivisions(characterId, corporationId, canRead).then((result) => {
        const next = new Map<number, string>();
        for (const entry of result.cached?.data.wallet ?? []) {
          const name = entry.name?.trim();
          if (entry.division !== undefined && name) next.set(entry.division, name);
        }
        return next;
      }),
    [characterId, corporationId, canRead]
  );
  return useKeyedLoad(`${characterId}:${corporationId}`, load).data ?? NO_DIVISION_NAMES;
}

export function BookSettingsDialog({
  open,
  onClose,
  initialTab,
  onSaved,
  onDeleteBook,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  onDeleteBook?: () => void;
  initialTab?: SettingsTab;
}) {
  const { t } = useTranslation();
  const {
    settings,
    view,
    names,
    edit,
    canEdit,
    verdict,
    data,
    characterId,
    corporationId,
    requestRows,
  } = useBook();
  useEffect(() => {
    if (open) requestRows?.();
  }, [open, requestRows]);
  const divisionNames = useWalletDivisionNames(characterId, corporationId);
  const canReadDivisions = useCorpAccess().capabilities.canReadDivisions;
  const [hubId, setHubId] = useState(settings.hubId);
  const [oreForm, setOreForm] = useState(settings.oreForm);
  const [grace, setGrace] = useState(String(settings.graceHours));
  const [divisions, setDivisions] = useState<number[]>(settings.divisions);
  const divisionsBase = useRef(settings.divisions).current;
  const [primaryPick, setPrimaryPick] = useState(
    primaryDivisionOf(settings.divisions, settings.primaryDivision)
  );
  const primary = primaryDivisionOf(divisions, primaryPick);
  const [startDate, setStartDate] = useState(settings.startDate);
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
  const [taxContact, setTaxContact] = useState(() => draftFromContact(settings.taxContact));
  const rules = settings.noticeRules;
  const [noticeAfter, setNoticeAfter] = useState<NoticeAfter['kind']>(rules.after.kind);
  const [noticeDays, setNoticeDays] = useState(
    String(rules.after.kind === 'behind' ? rules.after.days : behindDefault)
  );
  const [noticeDay, setNoticeDay] = useState(
    String(rules.after.kind === 'dayOfMonth' ? rules.after.day : 1)
  );
  const [noticeMinimum, setNoticeMinimum] = useState(String(rules.minimum));
  const [cooldown, setCooldown] = useState(String(rules.cooldownDays));
  const [earlyAt, setEarlyAt] = useState(rules.earlyAt === undefined ? '' : String(rules.earlyAt));
  const [tolerance, setTolerance] = useState(String(settings.dayTolerancePct));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [rateScope, setRateScope] = useState<(typeof RATE_SCOPES)[number]>('corp');
  const [rateMiner, setRateMiner] = useState('');
  const [rateMoon, setRateMoon] = useState('');
  const [rateRefinery, setRateRefinery] = useState('');
  const [rateOwner, setRateOwner] = useState('');
  const [ratePct, setRatePct] = useState('');
  const today = utcDay();
  const [rateFrom, setRateFrom] = useState(today);
  const [pending, setPending] = useState<{ id: number; rate: NewRate }[]>([]);
  const nextPendingId = useRef(0);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const structures = useMemo(
    () => [...new Set(view.input.extractions.map((x) => x.structureId))],
    [view.input.extractions]
  );
  const moons = useMemo(
    () => [...new Set(view.input.extractions.map((x) => x.moonId))],
    [view.input.extractions]
  );
  const refineries = useMemo(
    () =>
      [...new Set([...structures, ...view.input.entries.map((e) => e.structureId)])].sort(
        (a, b) => a - b
      ),
    [structures, view.input.entries]
  );
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

  const rateReady =
    datedRateReady(ratePct, rateFrom, today) &&
    rateFrom >= settings.startDate &&
    (rateScope !== 'miner' || rateMiner !== '') &&
    (rateScope !== 'moon' || rateMoon !== '') &&
    (rateScope !== 'structure' || rateRefinery !== '') &&
    (!OWNER_SCOPES.includes(rateScope) || rateOwner !== '');
  const rateFilled = ratePct !== '';

  const formRate = (): NewRate => {
    const base = { pct: parsePercent(ratePct) ?? 0, effectiveFrom: rateFrom };
    return rateScope === 'miner'
      ? { scope: 'miner', minerId: rateMiner, ...base }
      : rateScope === 'moon'
        ? { scope: 'moon', moonId: Number(rateMoon), ...base }
        : rateScope === 'structure'
          ? { scope: 'structure', structureId: Number(rateRefinery), ...base }
          : rateScope === 'feeder' || rateScope === 'feeder-member'
            ? { scope: rateScope, feederId: Number(rateOwner), ...base }
            : { scope: rateScope, ...base };
  };

  const pendingProblems = useMemo(() => {
    const seen = new Set<string>();
    const out = new Map<number, 'start' | 'past' | 'duplicate'>();
    for (const { id, rate } of pending) {
      const key = pendingKey(rate);
      if (rate.effectiveFrom < earliestRateStart(today)) out.set(id, 'past');
      else if (rate.effectiveFrom < settings.startDate) out.set(id, 'start');
      else if (seen.has(key)) out.set(id, 'duplicate');
      seen.add(key);
    }
    return out;
  }, [pending, today, settings.startDate]);

  const rateIsDuplicate =
    rateReady && pending.some((p) => pendingKey(p.rate) === pendingKey(formRate()));
  const lockDate = lockDateFor(today);
  const startIsLocked = settings.startDate < lockDate;
  const startMovedBeforeLock = startDate !== settings.startDate && startDate < lockDate;
  const problem =
    pendingProblems.size > 0
      ? 'pending'
      : rateFilled && !rateReady
        ? 'form'
        : startMovedBeforeLock
          ? 'start'
          : null;

  const addPending = () => {
    const rate = formRate();
    setPending((p) => [...p, { id: nextPendingId.current++, rate }]);
    setRatePct('');
    setRateMiner('');
    setRateMoon('');
    setRateRefinery('');
    setRateOwner('');
    setRateFrom(today);
  };

  const requestClose = () => {
    if (pending.length > 0 && !confirmDiscard) setConfirmDiscard(true);
    else onClose();
  };

  const save = () =>
    run(async () => {
      if (problem || rateIsDuplicate) return;
      const toWrite = [...pending.map((p) => p.rate), ...(rateFilled ? [formRate()] : [])];
      const rateAdded = toWrite.length > 0;
      if (rateAdded) {
        await edit(
          toWrite.length === 1
            ? { action: 'addRate', rate: toWrite[0] }
            : { action: 'addRates', rates: toWrite }
        );
        setPending([]);
        setRatePct('');
      }
      const sortedDivisions = [...divisions].sort((a, b) => a - b);
      const patch: Record<string, unknown> = {
        hubId,
        oreForm,
        graceHours: Number(grace.replace(',', '.')),
        structureExpiryHours: Object.fromEntries(
          Object.entries(expiry)
            .filter(([, v]) => v !== '' && Number(v) > 0)
            .map(([k, v]) => [k, Number(v)])
        ),
      };
      Object.assign(patch, taxContactPatch(taxContact, settings.taxContact));
      const noticeRules: NoticeRules = {
        after:
          noticeAfter === 'behind'
            ? { kind: 'behind', days: Number(noticeDays) }
            : { kind: 'dayOfMonth', day: Number(noticeDay) },
        minimum: Number(noticeMinimum),
        cooldownDays: Number(cooldown),
        ...(Number(earlyAt) > 0 ? { earlyAt: Number(earlyAt) } : {}),
      };
      const asStored = JSON.stringify(parseNoticeRules(noticeRules));
      if (
        asStored === JSON.stringify(noticeRules) &&
        asStored !== JSON.stringify(parseNoticeRules(settings.noticeRules))
      )
        patch.noticeRules = noticeRules;
      const tolerancePct = Number(tolerance.replace(',', '.'));
      if (
        tolerance.trim() !== '' &&
        tolerancePct >= 0 &&
        tolerancePct <= 5 &&
        tolerancePct !== settings.dayTolerancePct
      )
        patch.dayTolerancePct = tolerancePct;
      if (chunk !== '') patch.chunkM3PerHour = Number(chunk);
      const baseDivisions = [...divisionsBase].sort((a, b) => a - b);
      const divisionsChanged = sortedDivisions.join() !== baseDivisions.join();
      if (divisionsChanged) {
        patch.divisions = sortedDivisions;
        patch.divisionsBase = baseDivisions;
      }
      if (
        sortedDivisions.length > 1 &&
        primary !== primaryDivisionOf(settings.divisions, settings.primaryDivision)
      )
        patch.primaryDivision = primary;
      const names = divisionsChanged
        ? await divisionNamesFor(
            characterId,
            corporationId,
            canReadDivisions,
            sortedDivisions,
            settings.divisionNames
          )
        : null;
      if (names) patch.divisionNames = names;
      if (verdict.isDirector) {
        patch.dismissApprovalAboveIsk = approval === '' ? null : Number(approval);
        if (startDate !== settings.startDate) patch.startDate = startDate;
      }
      try {
        await edit({ action: 'updateSettings', patch });
      } catch (e) {
        if (!rateAdded) throw e;
        setError(
          `${t('corpTaxBook.moons.settings.rateAddedSettingsFailed')} ${callableErrorText(t, e, 'corpTaxBook.moons.dialogs.failed')}`
        );
        return;
      }
      onSaved?.();
      onClose();
    });

  const rates = [...settings.rates]
    .filter((r): r is Exclude<TaxRate, { scope: 'record' }> => r.scope !== 'record')
    .sort(
      (a, b) => a.scope.localeCompare(b.scope) || b.effectiveFrom.localeCompare(a.effectiveFrom)
    );

  const tabsId = useTabsId();
  const rateHintId = useId();
  const fieldId = useId();
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
    { id: 'sharing', label: t('corpTaxBook.moons.settings.tabs.sharing') },
    { id: 'access', label: t('corpTaxBook.moons.settings.tabs.access') },
  ];

  return (
    <Modal
      open={open}
      onClose={requestClose}
      title={t('corpTaxBook.moons.settings.title')}
      placement="wide"
      footer={
        <div className="flex items-center justify-between gap-2">
          {error ? (
            <span role="alert" className="text-sm text-danger">
              {error}
            </span>
          ) : confirmDiscard ? (
            <span role="alert" className="text-sm text-warning">
              {t('corpTaxBook.moons.settings.discardPending', { count: pending.length })}
            </span>
          ) : problem === 'pending' ? (
            <span id={rateHintId} className="text-sm text-danger">
              {t('corpTaxBook.moons.settings.pendingBlocked')}
            </span>
          ) : problem === 'start' ? (
            <span id={rateHintId} className="text-sm text-danger">
              {t('corpTaxBook.moons.settings.startBeforeLock', { date: formatIsoDay(lockDate) })}
            </span>
          ) : problem === 'form' || rateIsDuplicate ? (
            <span id={rateHintId} className="text-sm text-text-dim">
              {t(
                rateIsDuplicate
                  ? 'corpTaxBook.moons.settings.pendingProblem.duplicate'
                  : 'corpTaxBook.moons.settings.rateIncomplete'
              )}
            </span>
          ) : (
            <span />
          )}
          <span className="flex gap-2">
            {confirmDiscard ? (
              <>
                <Button variant="ghost" autoFocus onClick={() => setConfirmDiscard(false)}>
                  {t('corpTaxBook.moons.settings.keepEditing')}
                </Button>
                <Button variant="danger" onClick={onClose}>
                  {t('corpTaxBook.moons.settings.discard')}
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={requestClose}>
                  {t('common.close')}
                </Button>
                <Button
                  variant="primary"
                  onClick={() => void save()}
                  loading={busy}
                  aria-disabled={!canEdit || problem || rateIsDuplicate ? true : undefined}
                  aria-describedby={(problem || rateIsDuplicate) && !error ? rateHintId : undefined}
                >
                  {t('common.save')}
                </Button>
              </>
            )}
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
              <DividedList surface="none" as="ul">
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
                            date: formatIsoDay(r.effectiveFrom),
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
              </DividedList>
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
                        <SelectTrigger aria-label={t('corpTaxBook.moons.settings.rateFor')}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RATE_SCOPES.filter(
                            (s) => !OWNER_SCOPES.includes(s) || owners.length > 0
                          ).map((s) => (
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
                          <SelectTrigger aria-label={t('corpTaxBook.moons.cols.miner')}>
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
                          <SelectTrigger aria-label={t('corpTaxBook.moons.settings.moon')}>
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
                    {OWNER_SCOPES.includes(rateScope) && (
                      <Label text={t('corpTaxBook.moons.settings.rateScope.feeder')}>
                        <Select value={rateOwner} onValueChange={setRateOwner}>
                          <SelectTrigger
                            aria-label={t('corpTaxBook.moons.settings.rateScope.feeder')}
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
                        inputMode="decimal"
                        value={ratePct}
                        onChange={(e) => setRatePct(e.target.value)}
                      />
                    </Label>
                    <Label text={t('corpTaxBook.moons.settings.effectiveFrom')}>
                      <TextInput
                        type="date"
                        min={earliestRateStart(today)}
                        value={rateFrom}
                        onChange={(e) => setRateFrom(e.target.value)}
                      />
                    </Label>
                  </div>
                  <Tooltip
                    content={
                      pending.length >= 50
                        ? t('corpTaxBook.moons.settings.addRateLimit')
                        : !rateReady
                          ? t('common.needsInput')
                          : null
                    }
                  >
                    <Button
                      variant="accent"
                      onClick={addPending}
                      aria-disabled={
                        !rateReady || rateIsDuplicate || pending.length >= 50 || undefined
                      }
                    >
                      {t('corpTaxBook.moons.settings.addRate')}
                    </Button>
                  </Tooltip>
                  {pending.length > 0 && (
                    <div className="space-y-2">
                      <h4 className={eyebrowClassName}>
                        {t('corpTaxBook.moons.settings.pendingTitle', { count: pending.length })}
                      </h4>
                      <DividedList surface="panel" as="ul">
                        {pending.map(({ id, rate }) => {
                          const target = rateLabel(
                            rate,
                            minerName,
                            names.refinery,
                            names.corporation
                          );
                          const bad = pendingProblems.get(id);
                          return (
                            <li
                              key={id}
                              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
                            >
                              <Pill>{t(`corpTaxBook.moons.settings.rateScope.${rate.scope}`)}</Pill>
                              {target && (
                                <span className="min-w-0 flex-1 basis-44 break-words">
                                  {target}
                                </span>
                              )}
                              <span className="text-xs text-text-dim tabular-nums">
                                {t('corpTaxBook.moons.settings.from', {
                                  date: formatIsoDay(rate.effectiveFrom),
                                })}
                              </span>
                              <span className="w-14 text-right font-semibold tabular-nums">
                                {rate.pct}%
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={t('corpTaxBook.moons.settings.removePendingNamed', {
                                  name:
                                    target ||
                                    t(`corpTaxBook.moons.settings.rateScope.${rate.scope}`),
                                  pct: rate.pct,
                                })}
                                onClick={() => {
                                  setPending((p) => p.filter((x) => x.id !== id));
                                  setConfirmDiscard(false);
                                }}
                              >
                                {t('corpTaxBook.moons.settings.removePending')}
                              </Button>
                              {bad && (
                                <span role="alert" className="basis-full text-xs text-danger">
                                  {t(`corpTaxBook.moons.settings.pendingProblem.${bad}`)}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </DividedList>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {tab === 'billing' && (
            <Fields variant="form">
              <FieldsHeading>{t('corpTaxBook.moons.settings.pricing')}</FieldsHeading>
              <Field label={t('corpTaxBook.moons.settings.hub')}>
                <Select value={hubId} onValueChange={setHubId}>
                  <SelectTrigger aria-label={t('corpTaxBook.moons.settings.hub')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPARED_HUBS.map((h) => (
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
              <FieldsHeading>{t('corpTaxBook.moons.settings.billingDays')}</FieldsHeading>
              <Field label={t('corpTaxBook.moons.settings.startDate')} htmlFor={`${fieldId}-start`}>
                <span className="flex items-center gap-1.5">
                  {verdict.isDirector ? (
                    <TextInput
                      type="date"
                      id={`${fieldId}-start`}
                      min={lockDate}
                      max={today}
                      disabled={startIsLocked}
                      value={startDate}
                      onChange={(e) => e.target.value && setStartDate(e.target.value)}
                    />
                  ) : (
                    <span className="tabular-nums">{formatIsoDay(settings.startDate)}</span>
                  )}
                  <InfoTooltip
                    label={t('common.aboutLabel', {
                      label: t('corpTaxBook.moons.settings.startDate'),
                    })}
                    content={t('corpTaxBook.moons.settings.startHint')}
                  />
                </span>
                {verdict.isDirector && (startIsLocked || startMovedBeforeLock) && (
                  <span className="mt-1 block text-xs text-text-dim">
                    {startIsLocked
                      ? t('corpTaxBook.moons.settings.startLocked', {
                          date: formatIsoDay(settings.startDate),
                          lock: formatIsoDay(lockDate),
                        })
                      : t('corpTaxBook.moons.settings.startBeforeLock', {
                          date: formatIsoDay(lockDate),
                        })}
                  </span>
                )}
              </Field>
              <Field label={t('corpTaxBook.moons.settings.grace')} htmlFor={`${fieldId}-grace`}>
                <TextInput
                  className="w-20"
                  inputMode="decimal"
                  id={`${fieldId}-grace`}
                  value={grace}
                  onChange={(e) => setGrace(e.target.value)}
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
                        aria-label={
                          divisionNames.has(d)
                            ? t('corpTaxBook.moons.settings.divisionNamed', {
                                n: d,
                                name: divisionNames.get(d),
                              })
                            : t('corpTaxBook.moons.settings.division', { n: d })
                        }
                      />
                      {divisionNames.get(d) ?? d}
                    </label>
                  ))}
                </div>
              </Field>
              {divisions.length > 1 && (
                <Field
                  label={t('corpTaxBook.moons.settings.primaryDivision')}
                  note={t('corpTaxBook.moons.settings.primaryDivisionHint')}
                >
                  <Select value={String(primary)} onValueChange={(v) => setPrimaryPick(Number(v))}>
                    <SelectTrigger aria-label={t('corpTaxBook.moons.settings.primaryDivision')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[...divisions]
                        .sort((a, b) => a - b)
                        .map((d) => (
                          <SelectItem key={d} value={String(d)}>
                            {divisionNames.has(d)
                              ? t('corpTaxBook.moons.settings.divisionNamed', {
                                  n: d,
                                  name: divisionNames.get(d),
                                })
                              : t('corpTaxBook.moons.settings.division', { n: d })}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              <FieldsHeading>{t('corpTaxBook.moons.settings.running.heading')}</FieldsHeading>
              <Field label={t('corpTaxBook.moons.settings.running.billing')}>
                <span>{t('corpTaxBook.moons.settings.running.summary')}</span>
              </Field>
              <Field
                label={t('corpTaxBook.moons.settings.running.noticeWhen')}
                note={t('corpTaxBook.moons.settings.running.noticeHint')}
              >
                <SegmentedControl
                  label={t('corpTaxBook.moons.settings.running.noticeWhen')}
                  value={noticeAfter}
                  onChange={setNoticeAfter}
                  options={[
                    { value: 'behind', label: t('corpTaxBook.moons.settings.running.behind') },
                    {
                      value: 'dayOfMonth',
                      label: t('corpTaxBook.moons.settings.running.dayOfMonth'),
                    },
                  ]}
                  uppercase={false}
                />
                {noticeAfter === 'behind' ? (
                  <TextInput
                    className="w-20"
                    inputMode="numeric"
                    aria-label={t('corpTaxBook.moons.settings.running.behindDays')}
                    value={noticeDays}
                    onChange={(e) => setNoticeDays(e.target.value)}
                  />
                ) : (
                  <TextInput
                    className="w-20"
                    inputMode="numeric"
                    aria-label={t('corpTaxBook.moons.settings.running.monthDay')}
                    value={noticeDay}
                    onChange={(e) => setNoticeDay(e.target.value)}
                  />
                )}
              </Field>
              <Field
                label={t('corpTaxBook.moons.settings.running.minimum')}
                note={t('corpTaxBook.moons.settings.running.minimumHint')}
              >
                <IskInput
                  value={noticeMinimum}
                  onChange={setNoticeMinimum}
                  aria-label={t('corpTaxBook.moons.settings.running.minimum')}
                />
              </Field>
              <Field
                label={t('corpTaxBook.moons.settings.running.earlyAt')}
                note={t('corpTaxBook.moons.settings.running.earlyAtHint')}
              >
                <IskInput
                  value={earlyAt}
                  onChange={setEarlyAt}
                  aria-label={t('corpTaxBook.moons.settings.running.earlyAt')}
                />
              </Field>
              <Field
                label={t('corpTaxBook.moons.settings.running.cooldown')}
                htmlFor={`${fieldId}-cooldown`}
              >
                <TextInput
                  className="w-20"
                  inputMode="numeric"
                  id={`${fieldId}-cooldown`}
                  value={cooldown}
                  onChange={(e) => setCooldown(e.target.value)}
                />
              </Field>
              <Field
                label={t('corpTaxBook.moons.settings.running.tolerance')}
                htmlFor={`${fieldId}-tolerance`}
                note={t('corpTaxBook.moons.settings.running.toleranceHint')}
              >
                <TextInput
                  className="w-20"
                  inputMode="decimal"
                  id={`${fieldId}-tolerance`}
                  value={tolerance}
                  onChange={(e) => setTolerance(e.target.value)}
                />
              </Field>
            </Fields>
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
                              rate: formatDecimal(learned.m3PerHour),
                              count: learned.cycles,
                            })
                          : t('corpTaxBook.moons.settings.notMeasured', {
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

          {tab === 'sharing' && <SharingTab onOpenSyncSettings={() => setTab('access')} />}

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

              <Section title={t('corpTaxBook.moons.settings.taxContact.section')}>
                <TaxContactSection
                  characterId={characterId}
                  corporationId={corporationId}
                  draft={taxContact}
                  onChange={setTaxContact}
                />
              </Section>

              <AutomaticSyncSection />

              <ReclaimBookSection />

              <ExportBookSection />

              <DeleteBookSection
                onDelete={() => {
                  onClose();
                  onDeleteBook?.();
                }}
              />
            </>
          )}
        </TabPanel>
      </div>
    </Modal>
  );
}
