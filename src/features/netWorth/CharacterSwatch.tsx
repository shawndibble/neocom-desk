import { characterStroke } from './layerMeta';

export function CharacterSwatch({ index }: { index: number }) {
  const { color, dash } = characterStroke(index);
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="14"
      height="8"
      viewBox="0 0 14 8"
      className="inline-block shrink-0"
      data-testid="character-swatch"
      data-stroke={color}
      data-dash={dash ?? ''}
    >
      <line x1="0" y1="4" x2="14" y2="4" stroke={color} strokeWidth="2" strokeDasharray={dash} />
    </svg>
  );
}
