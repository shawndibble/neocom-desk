import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icon from '@/components/ui/icons';
import type {
  DangerLevel,
  DangerRead as DangerReadData,
  ScanAge,
  ThreatKind,
  Tripwire,
  WatchGroup,
} from '@/engine/pilotList/dscanDanger';
import { KILL_GANG_MIN, type Tone } from '@/engine/pilotList/dscanReadout';
import { cx } from '@/lib/cx';

const P = 'travel.pilot.dscan.danger.';

/** Tone -> glyph and text colour. The glyph and a written word always travel together. */
const MARK: Record<'ok' | 'warn' | 'bad' | 'info', { glyph: typeof Icon.Warn; className: string }> =
  {
    ok: { glyph: Icon.SeverityClear, className: 'text-success' },
    warn: { glyph: Icon.Warn, className: 'text-warning' },
    bad: { glyph: Icon.SeverityCritical, className: 'text-danger' },
    info: { glyph: Icon.SeverityWatch, className: 'text-accent' },
  };

const LEVEL_MARK: Record<DangerLevel, keyof typeof MARK> = {
  clear: 'ok',
  watch: 'warn',
  danger: 'bad',
  busy: 'info',
};
const LEVEL_EDGE: Record<DangerLevel, string> = {
  clear: 'border-l-success',
  watch: 'border-l-warning',
  danger: 'border-l-danger',
  busy: 'border-l-accent',
};

/** An icon plus its word: status is never colour alone (DESIGN.md §7). */
function StatusMark({ tone, children }: { tone: keyof typeof MARK; children: ReactNode }) {
  const { glyph: Glyph, className } = MARK[tone];
  return (
    <span className={cx('inline-flex items-center gap-1.5 font-semibold', className)}>
      <Glyph size={Icon.ICON_SIZE.sm} aria-hidden="true" className="shrink-0" />
      <span>{children}</span>
    </span>
  );
}

function toneOf(tone: Tone): keyof typeof MARK {
  return tone === 'none' ? 'ok' : tone;
}

function groupTone(g: WatchGroup): keyof typeof MARK {
  if (g.kind === 'find') return 'warn';
  if (g.kind === 'kill') return g.count >= KILL_GANG_MIN ? 'bad' : 'warn';
  return 'bad';
}

/**
 * The answer to "am I in danger?": a level, one sentence built from counts, the
 * pattern the scan reads as, what is new, and how old the scan is. Wording stays
 * a condition, never a verdict (decision 20260912-172628).
 */
export function DangerAnswer({
  read,
  names,
  age,
  shipName,
  children,
}: {
  read: DangerReadData;
  names: ReadonlyMap<number, string>;
  /** Null for a Shared D-Scan: nobody knows when it was taken. */
  age: ScanAge | null;
  /** The pilot's ship, or null when it is not set. */
  shipName: string | null;
  /** The ship picker, placed in the card's footer. */
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const hl = read.headline;
  let headline: string;
  if (read.level === 'busy') {
    headline = t(`${P}headline.busy`, {
      ships: read.totalShips,
      kill: read.counts.kill,
      catch: read.counts.catch,
      find: read.counts.find,
    });
  } else if (hl.length === 0) {
    headline = t(`${P}headline.clear`);
  } else {
    let text = t(`${P}headline.first.${hl[0].kind}`, { count: hl[0].count });
    hl.slice(1).forEach((c, i) => {
      const tail = t(`${P}headline.next.${c.kind}`, { count: c.count });
      const last = i === hl.length - 2;
      text = t(`${P}headline.${last ? 'joinLast' : 'joinMiddle'}`, { head: text, tail });
    });
    headline = t(`${P}headline.sentence`, { text });
  }

  const parts: string[] = [];
  if (read.pattern !== null && read.level !== 'busy') {
    parts.push(
      t(`${P}sub.pattern`, {
        reading: t(`travel.pilot.dscan.readout.reading.${read.pattern.reading}`),
        evidence: read.pattern.evidence
          .map((l) => t(`travel.pilot.dscan.readout.${l.key}`, l.params))
          .join('. '),
      })
    );
  }
  const nameList = (xs: string[]) =>
    xs.length === 1
      ? xs[0]
      : xs.length === 2
        ? t(`${P}sub.namesAnd`, { first: xs[0], second: xs[1] })
        : t(`${P}sub.namesMore`, { first: xs[0], second: xs[1], count: xs.length - 2 });
  if (read.level === 'busy') {
    parts.push(t(`${P}sub.busy`));
  } else if (read.level === 'clear') {
    parts.push(t(`${P}sub.clearShips`, { count: read.totalShips }), t(`${P}sub.cloak`));
  } else {
    const fresh = read.watch.filter((g) => (g.newCount ?? 0) > 0);
    if (fresh.length > 0) {
      parts.push(
        t(`${P}sub.newThreats`, {
          count: fresh.length,
          names: nameList(fresh.map((g) => names.get(g.typeId) ?? `#${g.typeId}`)),
        })
      );
    } else if (read.watch.every((g) => g.newCount !== null)) {
      parts.push(t(`${P}sub.nothingNew`));
    }
  }

  const ageLine =
    age === null ? null : t(`${P}age.${age.stale ? 'stale' : 'fresh'}`, { count: age.value });

  return (
    <section
      aria-label={t(`${P}level.${read.level}`)}
      data-testid="dscan-answer"
      data-level={read.level}
      className={cx(
        'rounded-xs border border-l-4 border-line bg-panel p-4 sm:p-5',
        LEVEL_EDGE[read.level]
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          className={cx(
            'inline-flex items-center gap-2 rounded-xs border px-2 py-0.5 text-xs font-semibold tracking-widest uppercase',
            read.level === 'clear' && 'border-success text-success',
            read.level === 'watch' && 'border-warning text-warning',
            read.level === 'danger' && 'border-danger text-danger',
            read.level === 'busy' && 'border-accent text-accent',
            age?.stale && 'border-dashed opacity-80'
          )}
        >
          {(() => {
            const { glyph: Glyph } = MARK[LEVEL_MARK[read.level]];
            return <Glyph size={Icon.ICON_SIZE.sm} aria-hidden="true" />;
          })()}
          {t(`${P}level.${read.level}`)}
        </span>
        <span className="text-sm text-text-dim">
          {shipName === null ? t(`${P}readForUnknown`) : t(`${P}readFor`, { ship: shipName })}
        </span>
      </div>
      <h3 className="mt-2 text-xl leading-tight font-semibold text-balance text-text sm:text-2xl">
        {headline}
      </h3>
      {parts.length > 0 && <p className="mt-1.5 text-sm text-text-dim">{parts.join(' ')}</p>}
      {ageLine !== null && (
        <p className="mt-2.5 text-sm">
          <StatusMark tone={age?.stale ? 'warn' : 'ok'}>{ageLine}</StatusMark>
        </p>
      )}
      {children !== undefined && <div className="mt-3 border-t border-line pt-3">{children}</div>}
    </section>
  );
}

/** What to watch, ranked: one row per group of identical hulls, capped, with the reason in text. */
export function WatchCard({
  read,
  names,
  groupLabel,
  shipName,
}: {
  read: DangerReadData;
  names: ReadonlyMap<number, string>;
  groupLabel: (groupId: number) => string;
  shipName: string | null;
}) {
  const { t } = useTranslation();
  const row = (g: WatchGroup, i: number) => (
    <li
      key={g.typeId}
      className="grid grid-cols-[1.75rem_1fr] gap-x-3 gap-y-1 border-t border-line py-3 first:border-t-0 sm:grid-cols-[1.75rem_1fr_auto]"
    >
      <span
        aria-hidden="true"
        className="pt-0.5 text-center text-lg font-semibold text-warning tabular-nums"
      >
        {i + 1}
      </span>
      <div className="min-w-0">
        <h4 className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-text">
          {names.get(g.typeId) ?? `#${g.typeId}`}
          {g.count > 1 && <span className="text-text-dim tabular-nums">×{g.count}</span>}
          {g.newCount !== null && g.newCount > 0 && (
            <span className="rounded-xs bg-warning px-1.5 py-px text-[0.6875rem] font-semibold tracking-wider text-bg uppercase">
              {g.newCount === g.count
                ? t(`${P}watch.new`)
                : t(`${P}watch.newSome`, { count: g.newCount })}
            </span>
          )}
        </h4>
        <p className="text-sm text-text-dim">
          {[
            groupLabel(g.groupId),
            g.kind === 'kill'
              ? shipName === null
                ? t(`${P}watch.why.killUnknown`)
                : t(`${P}watch.why.kill`, { ship: shipName })
              : t(`${P}watch.why.${g.kind}`),
          ]
            .filter((x) => x !== '')
            .join('. ')}
        </p>
      </div>
      <div className="col-start-2 sm:col-start-3 sm:row-start-1">
        <StatusMark tone={groupTone(g)}>{t(`${P}watch.tag.${g.kind}`)}</StatusMark>
      </div>
    </li>
  );
  const rest = read.watch;
  return (
    <section
      aria-labelledby="dscan-watch-title"
      className="rounded-xs border border-line bg-panel p-4"
    >
      <h3 id="dscan-watch-title" className="text-lg font-semibold text-text">
        {t(`${P}watch.${read.level === 'busy' ? 'titleBusy' : 'title'}`)}
      </h3>
      {rest.length === 0 ? (
        <div className="mt-2 rounded-xs border border-line bg-panel-2 p-3 text-sm text-text-dim">
          <p className="font-semibold text-text">{t(`${P}watch.none`)}</p>
          <p>{t(`${P}watch.noneHint`)}</p>
        </div>
      ) : (
        <>
          <ol className="mt-1">{rest.map(row)}</ol>
          {read.moreGroups > 0 && (
            <p className="text-sm text-text-dim">
              {t(`${P}watch.moreGroups`, { count: read.moreGroups })}
            </p>
          )}
          {read.notThreat.groups > 0 && (
            <p className="mt-2 text-xs text-text-dim">
              {read.notThreat.groups <= 2
                ? t(`${P}watch.notThreat`, {
                    names: read.notThreat.typeIds
                      .map((id) => names.get(id) ?? `#${id}`)
                      .join(` ${t(`${P}sub.and`)} `),
                  })
                : t(`${P}watch.notThreatCount`, {
                    groups: read.notThreat.groups,
                    ships: read.notThreat.ships,
                  })}
            </p>
          )}
        </>
      )}
    </section>
  );
}

const TRIPWIRE_KEY: Record<ThreatKind, 'catch' | 'more' | 'kill' | 'find'> = {
  catch: 'catch',
  more: 'more',
  kill: 'kill',
  find: 'find',
};

/** What would change the answer, each line with today's live count. */
export function TripwireCard({
  tripwires,
  firstScan,
}: {
  tripwires: readonly Tripwire[];
  /** True on the live view's first scan: there is nothing to compare yet. */
  firstScan: boolean;
}) {
  const { t } = useTranslation();
  return (
    <section
      aria-labelledby="dscan-tripwire-title"
      className="rounded-xs border border-line bg-panel p-4"
    >
      <h3 id="dscan-tripwire-title" className="text-lg font-semibold text-text">
        {t(`${P}tripwire.title`)}
      </h3>
      <p className="text-sm text-text-dim">{t(`${P}tripwire.hint`)}</p>
      <ul className="mt-1">
        {tripwires.map((w) => {
          const key = TRIPWIRE_KEY[w.kind];
          return (
            <li
              key={w.kind}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line py-2.5 first:border-t-0"
            >
              <div className="min-w-0 flex-[1_1_14rem]">
                <p className="font-semibold text-text">{t(`${P}tripwire.${key}.title`)}</p>
                <p className="text-sm text-text-dim">
                  {t(`${P}tripwire.${key}.sub`, { count: w.count })}
                </p>
              </div>
              <StatusMark tone={toneOf(w.tone)}>
                {w.count === 0 ? t(`${P}tripwire.none`) : t(`${P}tripwire.now`, { count: w.count })}
              </StatusMark>
            </li>
          );
        })}
      </ul>
      {firstScan && (
        <p className="mt-2 text-sm text-text-dim">
          <StatusMark tone="info">{t(`${P}tripwire.firstScan`)}</StatusMark>{' '}
          {t(`${P}tripwire.firstScanHint`)}
        </p>
      )}
      <p className="mt-3 border-t border-line pt-3 text-sm text-text-dim">
        {t(`${P}tripwire.paste`)}
      </p>
    </section>
  );
}
