/**
 * The one scope the Alerts Grant asks for (ADR 0020). Kept apart from
 * `esi/scopes` on purpose: it is never part of a device login's grant, so no
 * Permission group may list it.
 */
export const ALERTS_SCOPE = 'esi-characters.read_notifications.v1';
