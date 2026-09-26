import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextArea } from '@/components/ui';
import { formatCompactNumber } from '@/lib/compactNumber';
import { formatDuration } from '@/lib/duration';
import type { Fitting, FittingStats } from '@/engine/fittings/types';
import { ResistTable, type ResistRow } from './FittingStatsSections';
import { MissingSkillsChip } from './MissingSkillsChip';
import { IN_GAME_FITTING_DESCRIPTION_MAX } from './saveToEve';
import { useFittingSkillGaps } from './useFittingSkillGaps';

/** One resource meter: what is used of what the hull has, red-flagged past the limit. */
function Meter({
  label,
  used,
  total,
  unit,
}: {
  label: string;
  used: number;
  total: number;
  unit?: string;
}) {
  const { t } = useTranslation();
  const over = used > total;
  // A unitless meter (calibration) leaves no gap where the unit would go.
  const reading = (key: string) =>
    t(key, { used: formatCompactNumber(used), total: formatCompactNumber(total), unit: unit ?? '' })
      .replace(/\s+/g, ' ')
      .trim();
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  return (
    <div className="grid grid-cols-[6rem_1fr_auto] items-center gap-2 text-xs">
      <span className="text-text-dim">{label}</span>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={Math.min(used, total)}
        aria-valuetext={reading(
          over ? 'fittings.start.preview.meterOver' : 'fittings.start.preview.meter'
        )}
        className="h-1.5 bg-line"
      >
        <div
          className={`h-full ${over ? 'bg-danger' : 'bg-accent-dim'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`tabular-nums ${over ? 'text-danger' : ''}`}>
        {reading('fittings.start.preview.meter')}
      </span>
    </div>
  );
}

/** CPU, powergrid, calibration and drone bandwidth: what the fit asks of the hull. */
export function FitMeters({ stats }: { stats: FittingStats }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      <Meter
        label={t('fittings.start.preview.cpu')}
        used={stats.cpuUsed}
        total={stats.cpuTotal}
        unit={t('fittings.start.preview.unit.teraflops')}
      />
      <Meter
        label={t('fittings.start.preview.powergrid')}
        used={stats.powergridUsed}
        total={stats.powergridTotal}
        unit={t('fittings.start.preview.unit.megawatts')}
      />
      {stats.calibrationTotal > 0 && (
        <Meter
          label={t('fittings.start.preview.calibration')}
          used={stats.calibrationUsed}
          total={stats.calibrationTotal}
        />
      )}
      {stats.droneBandwidthTotal > 0 && (
        <Meter
          label={t('fittings.start.preview.droneBandwidth')}
          used={stats.droneBandwidthUsed}
          total={stats.droneBandwidthTotal}
          unit={t('fittings.start.preview.unit.megabits')}
        />
      )}
    </div>
  );
}

function Facts({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm tabular-nums sm:grid-cols-[auto_1fr_auto_1fr]">
      {items.map((item) => (
        <div key={item.label} className="contents">
          <dt className="text-text-dim">{item.label}</dt>
          <dd className="text-right sm:text-left">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Damage: the totals, the missile/turret and drone split, and every weapon with its ammo. */
export function OffensePanel({
  stats,
  typeName,
}: {
  stats: FittingStats;
  typeName: (typeId: number) => string;
}) {
  const { t } = useTranslation();
  const { offense } = stats;
  if (offense.weapons.length === 0) {
    return <p className="text-xs text-text-dim">{t('fittings.start.preview.noWeapons')}</p>;
  }
  const guns = offense.weapons.filter((row) => !row.isDrone).reduce((sum, row) => sum + row.dps, 0);
  const drones = offense.weapons
    .filter((row) => row.isDrone)
    .reduce((sum, row) => sum + row.dps, 0);
  const items = [
    { label: t('fittings.start.preview.totalDps'), value: formatCompactNumber(offense.dps) },
    { label: t('fittings.start.preview.volley'), value: formatCompactNumber(offense.volley) },
    { label: t('fittings.start.preview.weaponsDps'), value: formatCompactNumber(guns) },
    { label: t('fittings.start.preview.dronesDps'), value: formatCompactNumber(drones) },
    ...(offense.overheated
      ? [
          {
            label: t('fittings.start.preview.overheatedDps'),
            value: formatCompactNumber(offense.overheated.dps),
          },
        ]
      : []),
  ];
  return (
    <div className="space-y-3">
      <Facts items={items} />
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="text-left text-[0.6875rem] tracking-widest text-text-dim uppercase">
            <th className="pb-1 font-semibold">{t('fittings.start.preview.weapon')}</th>
            <th className="pb-1 font-semibold">{t('fittings.start.preview.ammo')}</th>
            <th className="pb-1 text-right font-semibold">{t('fittings.start.preview.dps')}</th>
          </tr>
        </thead>
        <tbody>
          {offense.weapons.map((row) => (
            <tr key={`${row.typeId}-${row.chargeTypeId ?? 0}`} className="border-t border-line">
              <td className="py-1.5 pr-2">
                {typeName(row.typeId)} ×{row.count}
              </td>
              <td className="py-1.5 pr-2 text-text-dim">
                {row.chargeTypeId === undefined ? '—' : typeName(row.chargeTypeId)}
              </td>
              <td className="py-1.5 text-right tabular-nums">{formatCompactNumber(row.dps)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Resists per layer, EHP, and how the ship moves and sits on the capacitor. */
export function DefensePanel({ stats }: { stats: FittingStats }) {
  const { t } = useTranslation();
  const rows: ResistRow[] = [
    { key: 'shield', label: t('fittings.stats.shield'), layer: stats.shield },
    { key: 'armor', label: t('fittings.stats.armor'), layer: stats.armor },
    { key: 'hull', label: t('fittings.stats.hull'), layer: stats.hull },
  ].map(({ key, label, layer }) => ({
    key,
    label,
    sub: formatCompactNumber(layer.hp),
    resonances: layer,
    ehp: layer.ehp,
  }));
  // formatDuration floors to whole minutes, so a sub-minute depletion needs seconds.
  const depletes = (cap: { depletesInSeconds: number }): string => {
    const seconds = Math.round(cap.depletesInSeconds);
    return seconds < 60
      ? t('fittings.start.preview.capDepletesSeconds', { seconds: Math.max(0, seconds) })
      : t('fittings.start.preview.capDepletes', { time: formatDuration(seconds) });
  };
  const capacitor = stats.capacitor.stable
    ? t('fittings.start.preview.capStable', { pct: Math.round(stats.capacitor.stablePercentage) })
    : depletes(stats.capacitor);
  return (
    <div className="space-y-3">
      <ResistTable rows={rows} />
      <Facts
        items={[
          { label: t('fittings.start.preview.ehp'), value: formatCompactNumber(stats.ehp) },
          {
            label: t('fittings.start.preview.speed'),
            value: t('fittings.start.preview.unit.speed', {
              value: formatCompactNumber(stats.navigation.maxVelocity),
            }),
          },
          { label: t('fittings.start.preview.capacitor'), value: capacitor },
          {
            label: t('fittings.start.preview.signature'),
            value: t('fittings.start.preview.unit.metres', {
              value: formatCompactNumber(stats.targeting.signatureRadius),
            }),
          },
        ]}
      />
    </div>
  );
}

/** Whether the Character can fly it, and what is missing with the time to train it. */
export function SkillsPanel({
  fitting,
  characterId,
}: {
  fitting: Fitting;
  characterId: number | null;
}) {
  const { t } = useTranslation();
  const gaps = useFittingSkillGaps(fitting, characterId);
  if (characterId === null) {
    return (
      <p className="text-xs text-text-dim">{t('fittings.start.preview.skillsNeedCharacter')}</p>
    );
  }
  if (gaps === null) {
    return <p className="text-xs text-text-dim">{t('fittings.start.preview.calculating')}</p>;
  }
  if (gaps.missing.length === 0) {
    return <p className="text-sm text-success">{t('fittings.start.preview.canFly')}</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-text-dim">{t('fittings.start.preview.skillsHint')}</p>
      <MissingSkillsChip
        entries={gaps.missing}
        characterId={characterId}
        fittingName={fitting.name}
      />
    </div>
  );
}

/**
 * A fitting's notes: editable for a saved one (kept when the field loses
 * focus), read-only for an In-game one's description.
 */
export function NotesPanel({ text, onSave }: { text: string; onSave?: (text: string) => void }) {
  const { t } = useTranslation();
  // `null` until the player types: what shows is then the saved text, so a
  // synced change to the notes is never overwritten by a stale copy.
  const [draft, setDraft] = useState<string | null>(null);
  if (draft !== null && draft === text) setDraft(null);
  if (onSave === undefined) return <p className="text-sm whitespace-pre-wrap">{text}</p>;
  return (
    <div className="space-y-1">
      <label className="block text-xs text-text-dim" htmlFor="fitting-notes">
        {t('fittings.start.preview.notesLabel')}
      </label>
      <TextArea
        id="fitting-notes"
        value={draft ?? text}
        rows={5}
        maxLength={IN_GAME_FITTING_DESCRIPTION_MAX}
        placeholder={t('fittings.start.preview.notesPlaceholder')}
        className="text-sm"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== null && draft !== text) onSave(draft);
        }}
      />
      <p className="text-xs text-text-dim">
        {t('fittings.start.preview.notesHint', { max: IN_GAME_FITTING_DESCRIPTION_MAX })}
      </p>
    </div>
  );
}
