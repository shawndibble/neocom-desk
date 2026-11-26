function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function dedupeCharacterName(body: string, name: string | null): string {
  if (!name) return body;

  if (body.startsWith(name)) {
    const rest = body.slice(name.length).replace(/^(:|'s)?\s*/, '');
    if (rest.length > 0) return rest.charAt(0).toUpperCase() + rest.slice(1);
  }

  const trailing = new RegExp(`\\s+from ${escapeRegExp(name)}\\.$`);
  if (trailing.test(body)) return body.replace(trailing, '.');

  return body;
}
