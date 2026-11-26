export function withArticle(name: string): string {
  return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;
}
