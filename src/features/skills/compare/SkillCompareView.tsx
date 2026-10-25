import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CharacterAvatar, SkillBar } from '@/components/ui';
import { Caret } from '@/components/ui/Disclosure';
import { focusRingInsetClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';
import { SkillLink } from '@/features/entities';
import { cx } from '@/lib/cx';
import {
  groupBands,
  levelDelta,
  levelOf,
  type ComparisonRow,
  type GroupBand,
  type LevelDelta,
} from '@/engine/skills/compareSkills';

export interface CompareCharacter {
  characterId: number;
  name: string;
}

interface SkillCompareViewProps {
  /** The columns drawn, in order. */
  characters: readonly CompareCharacter[];
  baselineId: number | null;
  /** Rows to list, grouped by skill group. */
  rows: readonly ComparisonRow[];
  /** Rows the characters agree on, held back behind one collapsed line. Empty when none are held back. */
  identicalRows?: readonly ComparisonRow[];
  /** One card per skill instead of a character-by-skill table. */
  phone?: boolean;
}

const DELTA_TEXT_CLASS = 'tabular-nums whitespace-nowrap text-xs';

/** The delta against the baseline: a signed number or a word, never colour alone (DESIGN §1, §6c). */
function Delta({ delta }: { delta: LevelDelta }) {
  const { t } = useTranslation();
  switch (delta.kind) {
    case 'same':
      return (
        <span className={cx(DELTA_TEXT_CLASS, 'text-text-faint')}>{t('skillCompare.same')}</span>
      );
    case 'missing':
      return (
        <span className={cx(DELTA_TEXT_CLASS, 'font-semibold text-isk-neg')}>
          {t('skillCompare.missing')}
        </span>
      );
    case 'ahead':
      return (
        <span
          className={cx(DELTA_TEXT_CLASS, 'font-semibold text-isk-pos')}
          aria-label={t('skillCompare.levelsAhead', { count: delta.by })}
        >
          +{delta.by}
        </span>
      );
    case 'behind':
      return (
        <span
          className={cx(DELTA_TEXT_CLASS, 'font-semibold text-isk-neg')}
          aria-label={t('skillCompare.levelsBehind', { count: delta.by })}
        >
          −{delta.by}
        </span>
      );
  }
}

/** A character's level of one skill: five pips, the number, and, off the baseline, how it stands against it. */
function LevelCell({
  level,
  baselineLevel,
  isBaseline,
}: {
  level: number;
  baselineLevel: number;
  isBaseline: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <SkillBar level={level} />
      <span className="w-3 text-right text-xs font-semibold tabular-nums">{level}</span>
      {!isBaseline && <Delta delta={levelDelta(level, baselineLevel)} />}
    </span>
  );
}

/** The band's net lead or deficit for one character, summed over its listed skills. */
function BandNet({ net }: { net: number }) {
  const { t } = useTranslation();
  if (net === 0) return null;
  return (
    <span
      className={cx(
        'text-xs font-semibold tabular-nums',
        net > 0 ? 'text-isk-pos' : 'text-isk-neg'
      )}
      aria-label={t(net > 0 ? 'skillCompare.levelsAhead' : 'skillCompare.levelsBehind', {
        count: Math.abs(net),
      })}
    >
      {net > 0 ? '+' : '−'}
      {Math.abs(net)}
    </span>
  );
}

function ColumnHeader({
  character,
  isBaseline,
}: {
  character: CompareCharacter;
  isBaseline: boolean;
}) {
  const { t } = useTranslation();
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <CharacterAvatar characterId={character.characterId} size="sm" />
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold normal-case text-text">
          {character.name}
        </span>
        {isBaseline && (
          <span className="block text-[0.625rem] tracking-widest text-accent uppercase">
            {t('skillCompare.baseline')}
          </span>
        )}
      </span>
    </span>
  );
}

/** A skill name cell stays put while the character columns scroll sideways. */
const PINNED_SKILL_CELL = 'sticky left-0 z-10 bg-panel';

function BandTable({
  bands,
  characters,
  baselineId,
}: {
  bands: readonly GroupBand[];
  characters: readonly CompareCharacter[];
  baselineId: number | null;
}) {
  const { t } = useTranslation();
  return (
    <>
      {bands.map((band) => (
        <tbody key={band.groupName}>
          <tr className="bg-panel-2">
            <th
              scope="colgroup"
              className={cx(
                'border-b border-line bg-panel-2 px-3 py-1.5 text-left text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase',
                'sticky left-0 z-10'
              )}
            >
              {band.groupName || t('skillCompare.ungrouped')}
            </th>
            {characters.map((character) => (
              <td key={character.characterId} className="border-b border-line px-3 py-1.5">
                {character.characterId !== baselineId && (
                  <BandNet net={band.netDelta.get(character.characterId) ?? 0} />
                )}
              </td>
            ))}
          </tr>
          {band.rows.map((row) => (
            <tr key={row.skillTypeID} className="hover:bg-panel-2">
              <th
                scope="row"
                className={cx(
                  PINNED_SKILL_CELL,
                  'border-b border-line px-3 py-1.5 text-left text-xs font-normal'
                )}
              >
                <SkillLink typeId={row.skillTypeID}>{row.name}</SkillLink>
              </th>
              {characters.map((character) => (
                <td key={character.characterId} className="border-b border-line px-3 py-1.5">
                  <LevelCell
                    level={row.levels.get(character.characterId) ?? 0}
                    baselineLevel={levelOf(row, baselineId)}
                    isBaseline={character.characterId === baselineId}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      ))}
    </>
  );
}

function BandCards({
  bands,
  characters,
  baselineId,
}: {
  bands: readonly GroupBand[];
  characters: readonly CompareCharacter[];
  baselineId: number | null;
}) {
  const { t } = useTranslation();
  return (
    <>
      {bands.map((band) => (
        <section key={band.groupName} aria-label={band.groupName || t('skillCompare.ungrouped')}>
          <h3 className={cx(eyebrowClassName, 'px-1 pt-3 pb-1')}>
            {band.groupName || t('skillCompare.ungrouped')}
          </h3>
          <ul className="space-y-2">
            {band.rows.map((row) => (
              <li key={row.skillTypeID} className="rounded-xs border border-line bg-panel p-2.5">
                <p className="mb-1.5 text-xs font-semibold">
                  <SkillLink typeId={row.skillTypeID}>{row.name}</SkillLink>
                </p>
                <ul className="space-y-1">
                  {characters.map((character) => (
                    <li
                      key={character.characterId}
                      className="flex min-h-7 items-center justify-between gap-2"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <CharacterAvatar characterId={character.characterId} size="sm" />
                        <span className="truncate text-xs text-text-dim">{character.name}</span>
                      </span>
                      <LevelCell
                        level={row.levels.get(character.characterId) ?? 0}
                        baselineLevel={levelOf(row, baselineId)}
                        isBaseline={character.characterId === baselineId}
                      />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

/** One quiet line that reveals the rows every compared character agrees on, in the same columns. */
function IdenticalToggle({
  count,
  expanded,
  onToggle,
}: {
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={onToggle}
      className={cx(
        'flex min-h-9 w-full items-center gap-1.5 px-3 py-2 text-left text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase md:min-h-0 touch:min-h-9',
        rowInteractiveClassName,
        focusRingInsetClassName
      )}
    >
      <Caret expanded={expanded} />
      {t('skillCompare.identicalCount', { count })}
    </button>
  );
}

/**
 * The comparison itself: skills grouped in bands, each character's level as
 * five pips with its standing against the baseline character. A table with
 * pinned avatar headers on desktop; one card per skill on a phone, where a
 * wide matrix would scroll sideways with the column headers off screen.
 */
export function SkillCompareView({
  characters,
  baselineId,
  rows,
  identicalRows = [],
  phone = false,
}: SkillCompareViewProps) {
  const { t } = useTranslation();
  const [identicalOpen, setIdenticalOpen] = useState(false);
  const ids = useMemo(() => characters.map((c) => c.characterId), [characters]);
  const bands = useMemo(() => groupBands(rows, ids, baselineId), [rows, ids, baselineId]);
  const identicalBands = useMemo(
    () => (identicalOpen ? groupBands(identicalRows, ids, baselineId) : []),
    [identicalOpen, identicalRows, ids, baselineId]
  );
  const toggle = identicalRows.length > 0 && (
    <IdenticalToggle
      count={identicalRows.length}
      expanded={identicalOpen}
      onToggle={() => setIdenticalOpen((open) => !open)}
    />
  );
  if (phone) {
    return (
      <>
        <BandCards bands={bands} characters={characters} baselineId={baselineId} />
        {toggle && <div className="mt-3 rounded-xs border border-line">{toggle}</div>}
        {identicalOpen && (
          <BandCards bands={identicalBands} characters={characters} baselineId={baselineId} />
        )}
      </>
    );
  }
  return (
    <table className="w-full border-separate border-spacing-0">
      <caption className="sr-only">{t('skillCompare.tableLabel')}</caption>
      <thead>
        <tr>
          <th
            scope="col"
            className={cx(
              eyebrowClassName,
              'sticky top-0 left-0 z-20 border-b border-line-bright bg-panel px-3 py-2 text-left'
            )}
          >
            {t('skillCompare.skillColumn')}
          </th>
          {characters.map((character) => (
            <th
              key={character.characterId}
              scope="col"
              className="sticky top-0 z-10 border-b border-line-bright bg-panel px-3 py-2 text-left"
            >
              <ColumnHeader
                character={character}
                isBaseline={character.characterId === baselineId}
              />
            </th>
          ))}
        </tr>
      </thead>
      <BandTable bands={bands} characters={characters} baselineId={baselineId} />
      {toggle && (
        <tbody>
          <tr>
            <td colSpan={characters.length + 1} className="border-b border-line p-0">
              {toggle}
            </td>
          </tr>
        </tbody>
      )}
      {identicalOpen && (
        <BandTable bands={identicalBands} characters={characters} baselineId={baselineId} />
      )}
    </table>
  );
}
