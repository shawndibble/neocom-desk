import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import {
  DataAgeBadge,
  IskAmount,
  Panel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatChip,
  StatChips,
  type StatChipTone,
} from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { PI_CADENCE_DAYS, type PiCadence, type PiCadenceDays } from '../cadencePref';
import { EstimateBadge } from '../DirectiveRow';
import { HOUR_MS, type CheckStatus, type ColonyCheckRow, type TodayCheck } from './coloniesModel';
import { eveClock, hoursLabel, initials } from './coloniesFormat';
import { PlanetImage } from '../PlanetImage';
import { STATUS_DOT_CLASS, STATUS_TONE_CLASS } from './statusStyles';

/** A status word with a dot: the word carries it, the colour only reinforces. */
export function StatusWord({ status }: { status: CheckStatus }) {
  const { t } = useTranslation();
  return (
    <span className={`inline-flex items-center gap-1.5 ${STATUS_TONE_CLASS[status]}`}>
      <span
        aria-hidden="true"
        className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT_CLASS[status]}`}
      />
      {t(`piColonies.status.${status}`)}
    </span>
  );
}

const MICRO = 'text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase';

interface TodayPanelProps {
  rows: readonly ColonyCheckRow[];
  check: TodayCheck;
  nowMs: number;
  /** Planet name for a row. */
  nameOf: (row: ColonyCheckRow) => string;
  characterNameOf: (characterId: number) => string;
  activeCharacterId: number;
  /** The first row's ISK a day, summed from Plan's own model; null without prices. */
  todayPerDay: number | null;
  /** Hub prices could not be read: the price notice says so, so the "still loading" line stays out. */
  pricesFailed: boolean;
  fixCount: number;
  fixGainPerDay: number;
  /** Colonies in the figures above that belong to the active Character. */
  ownCount: number;
  includesOthers: boolean;
  fetchedAt: Date | null;
  cadence: PiCadence;
  onHaulDaysChange: (days: PiCadenceDays) => void;
  planHref: string;
}

function Hero({
  check,
  rows,
  nowMs,
  nameOf,
}: Pick<TodayPanelProps, 'check' | 'rows' | 'nowMs' | 'nameOf'>) {
  const { t } = useTranslation();
  const { next } = check;
  if (!next) {
    return (
      <div className="flex items-center gap-3">
        <div>
          <div className={MICRO}>{t('piColonies.today.nextLabel')}</div>
          <p className="text-base font-medium">{t('piColonies.today.nothingUrgent')}</p>
        </div>
      </div>
    );
  }
  const row = rows.find((r) => r.key === next.key);
  if (!row) return null;
  const name = nameOf(row);
  const hoursAway = (next.atMs - nowMs) / HOUR_MS;
  const now = hoursAway <= 0;
  const winGain = row.quickWins
    .filter((win) => win.detail.kind === (next.kind === 'haul' ? 'storage' : 'restart'))
    .reduce<number | null>(
      (sum, win) => (sum === null || win.gainPerDay === null ? null : sum + win.gainPerDay),
      0
    );
  const gain = row.quickWins.length > 0 ? winGain : null;

  let why: string;
  if (next.kind === 'haul') {
    why = t('piColonies.today.whyHaul', { in: hoursLabel(Math.max(0, hoursAway)) });
  } else if (next.stopped) {
    why = t('piColonies.today.whyStopped', { ago: hoursLabel(-hoursAway) });
  } else {
    why = t('piColonies.today.whyExpiring', { in: hoursLabel(hoursAway) });
  }

  return (
    <div className="flex items-start gap-3">
      <PlanetImage type={row.planetType} size={48} />
      <div className="min-w-0">
        <div className={MICRO}>{t('piColonies.today.nextLabel')}</div>
        <p className="text-lg leading-snug font-semibold">
          {t(next.kind === 'haul' ? 'piColonies.today.haulName' : 'piColonies.today.restartName', {
            name,
          })}{' '}
          <span className={now ? 'text-danger' : 'text-warning'}>
            {now
              ? t('piColonies.today.now')
              : t('piColonies.today.in', { in: hoursLabel(hoursAway) })}
          </span>
        </p>
        <p className="text-xs text-text-dim">
          {why}
          {gain !== null && gain > 0 && (
            <>
              {' · '}
              {t(
                next.kind === 'haul'
                  ? 'piColonies.today.savesLead'
                  : 'piColonies.today.bringsBackLead'
              )}{' '}
              <span className="text-isk-pos">
                +<IskAmount value={gain} decimals={0} /> {t('piColonies.iskPerDay')}
              </span>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function CountChips({
  check,
  fixCount,
  fixGainPerDay,
}: Pick<TodayPanelProps, 'check' | 'fixCount' | 'fixGainPerDay'>) {
  const { t } = useTranslation();
  const { counts } = check;
  const tone = (n: number, on: StatChipTone): StatChipTone => (n > 0 ? on : 'default');
  return (
    <StatChips>
      <StatChip
        label={t('piColonies.chip.stopped')}
        value={counts.stopped}
        tone={tone(counts.stopped, 'danger')}
      />
      <StatChip
        label={t('piColonies.chip.expiringToday')}
        value={counts.expiringToday}
        tone={tone(counts.expiringToday, 'warning')}
      />
      <StatChip
        label={t('piColonies.chip.fullBeforeHaul')}
        value={counts.fullBeforeHaul}
        tone={tone(counts.fullBeforeHaul, 'warning')}
      />
      <StatChip
        label={t('piColonies.chip.needsLook')}
        value={counts.needsLook}
        tone={tone(counts.needsLook, 'warning')}
      />
      {fixCount > 0 && (
        <StatChip
          label={t('piColonies.chip.fixes')}
          value={
            <>
              {fixCount}
              {fixGainPerDay > 0 && (
                <span className="text-isk-pos">
                  {' · '}+<IskAmount value={fixGainPerDay} decimals={0} />
                  {t('piColonies.perDay')}
                </span>
              )}
            </>
          }
        />
      )}
      <StatChip
        label={t('piColonies.chip.healthy')}
        value={counts.healthy}
        tone={tone(counts.healthy, 'success')}
      />
    </StatChips>
  );
}

function LoginNext({
  check,
  rows,
  nowMs,
  nameOf,
  characterNameOf,
  cadence,
  onHaulDaysChange,
}: Pick<
  TodayPanelProps,
  'check' | 'rows' | 'nowMs' | 'nameOf' | 'characterNameOf' | 'cadence' | 'onHaulDaysChange'
>) {
  const { t } = useTranslation();
  const { loginAtMs } = check;
  const hoursAway = loginAtMs === null ? null : (loginAtMs - nowMs) / HOUR_MS;
  const now = hoursAway !== null && hoursAway <= 0;
  const multi = check.tripCharacterIds.length > 1;

  return (
    <div className="p-3">
      <div className={MICRO}>{t('piColonies.login.label')}</div>
      {loginAtMs === null || hoursAway === null ? (
        <p className="mt-1 text-sm text-text-dim">{t('piColonies.login.nothing')}</p>
      ) : (
        <>
          <p className="mt-1 flex items-baseline gap-2">
            <span
              className={`text-3xl font-semibold tabular-nums ${now ? 'text-danger' : 'text-warning'}`}
            >
              {now
                ? t('piColonies.today.nowCap')
                : t('piColonies.today.in', { in: hoursLabel(hoursAway) })}
            </span>
            <span className="text-xs text-text-dim">
              {now
                ? t('piColonies.login.today')
                : t('piColonies.login.clock', { clock: eveClock(loginAtMs) })}
            </span>
          </p>
          <ul className="mt-2 divide-y divide-line">
            {check.trip.map((item) => {
              const row = rows.find((r) => r.key === item.key);
              if (!row) return null;
              return (
                <li
                  key={`${item.key}:${item.kind}`}
                  className="flex items-center gap-2 py-1.5 text-xs"
                >
                  <PlanetImage type={row.planetType} size={20} />
                  <span
                    className={`inline-flex h-[1.125rem] shrink-0 items-center rounded-xs border px-1.5 text-[0.6875rem] font-semibold tracking-widest uppercase ${
                      item.kind === 'restart'
                        ? 'border-accent/45 bg-accent/10 text-accent'
                        : 'border-warning/45 bg-warning/10 text-warning'
                    }`}
                  >
                    {t(`piColonies.login.kind.${item.kind}`)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{nameOf(row)}</span>
                  {multi && (
                    <span
                      className="inline-flex h-[1.125rem] shrink-0 items-center rounded-xs bg-panel-2 px-1.5 text-[0.6875rem] font-semibold text-text-dim"
                      aria-label={characterNameOf(row.characterId)}
                    >
                      {initials(characterNameOf(row.characterId))}
                    </span>
                  )}
                  <span className="shrink-0 text-text-dim tabular-nums">
                    {t('piColonies.login.minutes', { minutes: item.minutes })}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-text-dim">
            {multi
              ? t('piColonies.login.noteMany', {
                  count: check.tripCharacterIds.length,
                  minutes: check.tripMinutes,
                  names: check.tripCharacterIds.map(characterNameOf).join(', '),
                })
              : t('piColonies.login.noteOne', { minutes: check.tripMinutes })}
          </p>
        </>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-dim">
        <span id="pi-haul-cadence-label">{t('piColonies.login.youHaul')}</span>
        <Select
          value={String(cadence.haulDays)}
          onValueChange={(value) => onHaulDaysChange(Number(value) as PiCadenceDays)}
        >
          <SelectTrigger size="sm" className="w-40" aria-labelledby="pi-haul-cadence-label">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PI_CADENCE_DAYS.map((days) => (
              <SelectItem key={days} value={String(days)}>
                {t(`piColonies.haulWord.${days}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span>{t('piColonies.login.restartEvery', { count: cadence.restartDays })}</span>
      </div>
    </div>
  );
}

export function TodayPanel(props: TodayPanelProps) {
  const { t } = useTranslation();
  const { rows, check, nowMs, nameOf, characterNameOf } = props;
  const stripRows = rows;

  return (
    <Panel
      title={t('piColonies.today.title')}
      meta={props.fetchedAt ? <DataAgeBadge date={props.fetchedAt} /> : undefined}
      actions={
        props.includesOthers ? (
          <span className="text-[0.6875rem] text-text-dim">
            {t('piColonies.today.includesOthers')}
          </span>
        ) : undefined
      }
      padded={false}
    >
      <div className="grid divide-line md:grid-cols-[minmax(0,1fr)_22rem] md:divide-x max-md:divide-y">
        <div className="space-y-3 p-3">
          <Hero check={check} rows={rows} nowMs={nowMs} nameOf={nameOf} />
          <CountChips check={check} fixCount={props.fixCount} fixGainPerDay={props.fixGainPerDay} />
          <ul
            className="flex flex-wrap gap-x-5 gap-y-3 border-t border-line pt-3"
            aria-label={t('piColonies.today.stripLabel')}
          >
            {stripRows.map((row) => (
              <li
                key={row.key}
                className="flex w-24 flex-col items-center gap-1 text-center text-[0.6875rem]"
              >
                <PlanetImage type={row.planetType} size={36} />
                <span className="w-full truncate text-text-dim">
                  {props.includesOthers && row.characterId !== props.activeCharacterId
                    ? `${initials(characterNameOf(row.characterId))} · ${nameOf(row)}`
                    : nameOf(row)}
                </span>
                <StatusWord status={row.status} />
              </li>
            ))}
          </ul>
          <p className="text-xs text-text-dim">
            {props.todayPerDay === null ? (
              // The price notice already says why there are no figures; do not contradict it.
              props.pricesFailed ? null : (
                <span>{t('piColonies.today.noFigures')}</span>
              )
            ) : (
              <Trans
                i18nKey="piColonies.today.summary"
                values={{ count: props.ownCount }}
                components={{
                  today: (
                    <IskAmount value={props.todayPerDay} className="font-semibold text-text" />
                  ),
                  fixes: <IskAmount value={props.fixGainPerDay} className="text-isk-pos" />,
                  plan: <Link to={props.planHref} className={inlineLinkClassName} />,
                }}
              />
            )}
            {props.todayPerDay !== null && (
              <span className="ml-1.5 inline-block align-middle">
                <EstimateBadge />
              </span>
            )}
          </p>
        </div>
        <LoginNext
          check={check}
          rows={rows}
          nowMs={nowMs}
          nameOf={nameOf}
          characterNameOf={characterNameOf}
          cadence={props.cadence}
          onHaulDaysChange={props.onHaulDaysChange}
        />
      </div>
    </Panel>
  );
}
