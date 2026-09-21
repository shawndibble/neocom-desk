function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Most `notifications.fired.*` bodies say the Character's name themselves —
 * leading ("Name: …", "Name's …", "Name has …") or, for `marketOrderFilled`
 * alone, trailing ("… from Name."). `AlertGroupRow`'s name column beside the
 * body already says it once; this strips whichever form the body used so the
 * row doesn't say it twice.
 */
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
