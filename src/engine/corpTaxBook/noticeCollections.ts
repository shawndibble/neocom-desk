/**
 * Where a book keeps its late notices (decision 20261120-235011): the `lateNotices` collection,
 * and the legacy one servers older than it wrote, read until that mirror goes. One place for the
 * names, so neither the officer's nor the member's reader spells them.
 */
export const LATE_NOTICES = 'lateNotices';
export const LEGACY_NOTICES = 'statements';
