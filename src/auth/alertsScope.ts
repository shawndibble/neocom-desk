/**
 * The scope every Alerts Grant asks for (ADR 0020). Kept apart from
 * `esi/scopes` on purpose: the grant is never a device login, so no
 * Permission group may list these.
 */
export const ALERTS_SCOPE = 'esi-characters.read_notifications.v1';

/**
 * The grant's one optional extra (ADR 0027): the Character's location, so the
 * server can push nearby Incursions and raidable skyhooks to a closed app.
 * Asked for only once the deployed server says it takes it.
 */
export const ALERTS_LOCATION_SCOPE = 'esi-location.read_location.v1';
