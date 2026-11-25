/** Stand-in portraits and logos for the invented cast: an initials badge, stable per id. */
const HUES = [212, 168, 28, 285, 340, 96];

export function portraitSvg(
  name: string,
  kind: 'characters' | 'corporations' | 'alliances',
  id: number
): string {
  const hue = HUES[id % HUES.length];
  const initials = name
    .split(/\s+/)
    .map((word) => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const radius = kind === 'characters' ? 0 : 18;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 45% 34%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360} 55% 16%)"/></linearGradient></defs>
<rect width="256" height="256" rx="${radius}" fill="url(#g)"/>
${kind === 'characters' ? `<circle cx="128" cy="104" r="46" fill="hsl(${hue} 25% 70% / .85)"/><path d="M40 256c6-62 40-84 88-84s82 22 88 84z" fill="hsl(${hue} 25% 62% / .85)"/>` : `<path d="M128 40l76 44v88l-76 44-76-44V84z" fill="none" stroke="hsl(${hue} 60% 75%)" stroke-width="10"/><text x="128" y="150" text-anchor="middle" font-family="sans-serif" font-size="64" font-weight="700" fill="hsl(${hue} 60% 88%)">${initials}</text>`}
</svg>`;
}
