/**
 * The landing FAQ's questions: the `login.faq.<id>` key each lives under, and
 * where "Read more" goes. The in-app FAQ (`/help/faq#<id>`) sits behind the
 * signed-in shell and cannot be linked from here; the public privacy policy
 * (and the delete-data page) is the nearest page for the questions about data,
 * and the rest carry no link.
 */
export const LANDING_FAQ: readonly { id: string; readMore?: string }[] = [
  { id: 'writes', readMore: '/privacy.html#writes' },
  { id: 'free' },
  { id: 'stores', readMore: '/privacy.html#storage' },
  { id: 'delete', readMore: '/delete-data.html' },
  { id: 'phone' },
  { id: 'community', readMore: '/privacy.html#communities' },
];
