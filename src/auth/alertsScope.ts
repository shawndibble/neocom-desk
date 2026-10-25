/**
 * The scope every Alerts Grant asks for (ADR 0020). Kept apart from
 * `esi/scopes` on purpose: the grant is never a device login, so no
 * Permission group may list these.
 */
export const ALERTS_SCOPE = 'esi-characters.read_notifications.v1';

/**
 * The grant's one optional extra (ADR 0028): the Character's location, so the
 * server can push nearby Incursions and raidable skyhooks to a closed app.
 * Asked for only once the deployed server says it takes it.
 */
export const ALERTS_LOCATION_SCOPE = 'esi-location.read_location.v1';

/**
 * The grant's second optional extra (ADR 0029): the Character's mail, so the
 * server can push new mail to a closed app. Only the headers are read, and the
 * scope is asked for only on an explicit "Add mail", once the deployed server
 * says it takes it.
 */
export const ALERTS_MAIL_SCOPE = 'esi-mail.read_mail.v1';
