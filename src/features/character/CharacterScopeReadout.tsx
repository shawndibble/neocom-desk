/**
 * The fixed form of the scope readout (issue #2846): says on screen whose
 * data a cross-Character surface shows, where the pilot cannot change it. Same
 * icon and words as the choosable form, which is `CharacterFilterControl`
 * (its label carries the same count) — unboxed here, because nothing is
 * clickable.
 *
 * `all` with `missing` names is the partial case: "All characters · 3 of 4"
 * plus a warning icon, and a tooltip naming who is left out.
 */
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { cx } from '@/lib/cx';
import { useTranslation } from 'react-i18next';
import * as Icon from '@/components/ui/icons';
import { Tooltip } from '@/components/ui/Tooltip';
import { CharacterAvatar } from '@/components/ui/CharacterAvatar';

export type CharacterScopeReadoutProps = (
  | { scope: 'all'; total: number; missing?: readonly string[] }
  | { scope: 'one'; characterId: number; characterName: string }
  | { scope: 'corp'; division: string }
) & {
  /**
   * Just the glyph, with the words as its accessible name and tooltip: for a
   * header with no room to spell the scope out (a Small widget's title bar).
   */
  compact?: boolean;
};

export function CharacterScopeReadout(props: CharacterScopeReadoutProps) {
  const { t } = useTranslation();
  let label: string;
  let glyph = <Icon.AllCharacters size={Icon.ICON_SIZE.sm} aria-hidden="true" />;
  let hint: string | null = null;
  if (props.scope === 'one') {
    label = t('character.scope.one', { name: props.characterName });
    glyph = <CharacterAvatar characterId={props.characterId} size="sm" className="rounded-full" />;
  } else if (props.scope === 'corp') {
    label = t('character.scope.corp', { division: props.division });
    glyph = <Icon.Corporation size={Icon.ICON_SIZE.sm} aria-hidden="true" />;
  } else if (props.missing && props.missing.length > 0) {
    label = t('character.scope.allPartial', {
      covered: props.total - props.missing.length,
      total: props.total,
    });
    glyph = <Icon.Warn size={Icon.ICON_SIZE.sm} aria-hidden="true" className="text-warning" />;
    hint = t('character.scope.missing', { names: props.missing.join(', ') });
  } else {
    label = t('character.scope.all', { count: props.total });
  }
  if (props.compact) {
    const name = hint ? `${label}. ${hint}` : label;
    return (
      <Tooltip content={name}>
        <span
          tabIndex={0}
          role="group"
          aria-label={name}
          className="inline-flex shrink-0 items-center text-text-dim"
        >
          {glyph}
        </span>
      </Tooltip>
    );
  }
  const readout = (
    <span
      tabIndex={hint ? 0 : undefined}
      role={hint ? 'group' : undefined}
      aria-label={hint ? `${label}. ${hint}` : undefined}
      className={cx(eyebrowClassName, 'inline-flex shrink-0 items-center gap-1.5')}
    >
      {glyph}
      <span>{label}</span>
    </span>
  );
  return hint ? <Tooltip content={hint}>{readout}</Tooltip> : readout;
}
