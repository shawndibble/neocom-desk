const tokens = new WeakMap<object, object>();

export function markReRead(next: object, previous: object): void {
  if (next !== previous) tokens.set(next, lineageOf(previous));
}

export function lineageOf(snapshot: object): object {
  let token = tokens.get(snapshot);
  if (!token) tokens.set(snapshot, (token = {}));
  return token;
}
