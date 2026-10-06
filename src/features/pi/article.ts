/** "an Ice", "a Lava": English-only, like the rest of the PI copy. */
export function withArticle(name: string): string {
  return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;
}
