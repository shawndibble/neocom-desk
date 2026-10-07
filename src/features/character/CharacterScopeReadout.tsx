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
import { useTranslation } from 'react-i18next';
import * as Icon from '@/components/ui/icons';
import { Tooltip } from '@/components/ui/Tooltip';
import { CharacterAvatar } from '@/components/ui/CharacterAvatar';

export type CharacterScopeReadoutProps =
  | { scope: 'all'; total: number; missing?: readonly string[] }
  | { scope: 'one'; characterId: number; characterName: string }
  | { scope: 'corp'; division: string };

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
  const readout = (
    <span
      tabIndex={hint ? 0 : undefined}
      role={hint ? 'group' : undefined}
      aria-label={hint ? `${label}. ${hint}` : undefined}
      className="inline-flex shrink-0 items-center gap-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase"
    >
      {glyph}
      <span>{label}</span>
    </span>
  );
  return hint ? <Tooltip content={hint}>{readout}</Tooltip> : readout;
}
