/**
 * Fighters: a carrier's squadrons — each launched from a tube or waiting in
 * the fighter bay, its size, and the tubes and per-class limits they take —
 * with a search to add one. The drones rack's twin for hulls with fighter
 * tubes; renders nothing for any other hull unless the Fitting already
 * carries fighters (a pasted fit), so they can be removed.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  entityLinkClassName,
  IconButton,
  SearchInput,
  TypeIcon,
} from '@/components/ui';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import {
  addSquadron,
  canLaunch,
  removeSquadron,
  setSquadron,
  type FighterLimits,
} from '@/engine/fittings/fighterEdit';
import { fighterClass, fighterTypeIds, squadronSize } from '@/engine/fittings/fighters';
import type { Fitting, FittingStats } from '@/engine/fittings/types';

const MATCHES_SHOWN = 8;

export function FittingFightersPanel({
  fitting,
  stats,
  onChange,
  typeName,
}: {
  fitting: Fitting;
  stats: FittingStats | null;
  /** The editor's `edit()`: applies a change to the open Fitting. */
  onChange: (change: (fitting: Fitting) => Fitting) => void;
  typeName: (typeId: number) => string;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const squadrons = fitting.fighters ?? [];
  const tubes = stats?.fighters.tubes ?? null;
  if (squadrons.length === 0 && (tubes === null || tubes.total === 0)) return null;

  // Before the stats land nothing launches: the hull's limits aren't known yet.
  const limits: FighterLimits = stats
    ? {
        tubes: stats.fighters.tubes.total,
        light: stats.fighters.light.total,
        support: stats.fighters.support.total,
        heavy: stats.fighters.heavy.total,
      }
    : { tubes: 0, light: 0, support: 0, heavy: 0 };
  const needle = query.trim().toLowerCase();
  const matches =
    needle === ''
      ? []
      : fighterTypeIds()
          .map((typeId) => ({ typeId, name: typeName(typeId) }))
          .filter(({ name }) => name.toLowerCase().includes(needle))
          .sort((a, b) => a.name.localeCompare(b.name))
          .slice(0, MATCHES_SHOWN);

  return (
    <div className="space-y-2 text-xs">
      {stats && (
        <p className="text-text-dim tabular-nums">
          {t('fittings.fighters.tubes', {
            used: stats.fighters.tubes.used,
            total: stats.fighters.tubes.total,
          })}
          {' · '}
          {t('fittings.fighters.classes', {
            light: `${stats.fighters.light.used}/${stats.fighters.light.total}`,
            support: `${stats.fighters.support.used}/${stats.fighters.support.total}`,
            heavy: `${stats.fighters.heavy.used}/${stats.fighters.heavy.total}`,
          })}
        </p>
      )}
      {squadrons.length === 0 ? (
        <p className="text-text-dim">{t('fittings.fighters.none')}</p>
      ) : (
        <ul className="space-y-1">
          {squadrons.map((squadron, index) => {
            const name = typeName(squadron.typeId);
            const kind = fighterClass(squadron.typeId);
            const full = squadronSize(squadron.typeId);
            const launchable = canLaunch(squadrons, squadron.typeId, limits);
            return (
              <li
                key={`${squadron.typeId}-${index}`}
                className="flex flex-wrap items-center gap-2 rounded-xs bg-panel-2 p-1.5"
              >
                <TypeIcon typeId={squadron.typeId} size={32} width={24} height={24} />
                <span className="min-w-0 flex-1 basis-40">
                  <MarketItemLink
                    typeId={squadron.typeId}
                    className={entityLinkClassName('block truncate text-sm')}
                  >
                    {name}
                  </MarketItemLink>
                  {kind && (
                    <span className="block text-text-dim">
                      {t(`fittings.fighters.class.${kind}`)}
                    </span>
                  )}
                </span>
                <IconButton
                  size="row"
                  icon={<Icon.Decrease />}
                  label={t('fittings.fighters.fewer', { name })}
                  tooltip={t('fittings.fighters.fewerShort')}
                  disabled={squadron.quantity <= 1}
                  onClick={() =>
                    onChange((f) => setSquadron(f, index, { quantity: squadron.quantity - 1 }))
                  }
                />
                <span className="w-10 shrink-0 text-center tabular-nums">
                  {t('fittings.fighters.size', { count: squadron.quantity, full })}
                </span>
                <IconButton
                  size="row"
                  icon={<Icon.Increase />}
                  label={t('fittings.fighters.more', { name })}
                  tooltip={t('fittings.fighters.moreShort')}
                  disabled={squadron.quantity >= full}
                  onClick={() =>
                    onChange((f) => setSquadron(f, index, { quantity: squadron.quantity + 1 }))
                  }
                />
                <label
                  className={`flex cursor-pointer items-center gap-1.5 ${tappableRowClassName}`}
                >
                  <Checkbox
                    checked={squadron.state === 'active'}
                    // Launching takes a tube and class room the others may have used up.
                    disabled={squadron.state !== 'active' && !launchable}
                    onChange={(event) => {
                      // Read now: the edit applies later, after React resets the box.
                      const state = event.target.checked ? 'active' : 'online';
                      onChange((f) => setSquadron(f, index, { state }));
                    }}
                  />
                  {t('fittings.fighters.launched')}
                </label>
                <IconButton
                  variant="plain"
                  size="sm"
                  tone="danger"
                  icon={<Icon.Close />}
                  label={t('fittings.fighters.remove', { name })}
                  onClick={() => onChange((f) => removeSquadron(f, index))}
                />
              </li>
            );
          })}
        </ul>
      )}
      <SearchInput
        aria-label={t('fittings.fighters.search')}
        placeholder={t('fittings.fighters.search')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {matches.length > 0 && (
        <ul className="space-y-1">
          {matches.map(({ typeId, name }) => (
            <li key={typeId}>
              <Button
                size="sm"
                align="start"
                className={`w-full ${tappableRowClassName}`}
                onClick={() => {
                  onChange((f) =>
                    addSquadron(f, typeId, { launch: canLaunch(squadrons, typeId, limits) })
                  );
                  setQuery('');
                }}
              >
                {t('fittings.fighters.add', { name })}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
