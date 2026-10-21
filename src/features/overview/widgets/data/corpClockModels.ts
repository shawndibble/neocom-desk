/**
 * Corp clock builders: Due soon, Offline services and Corp industry jobs.
 * Same contract as `models.ts`: pure, derived at render time.
 */
import { blank, statusOf, type Builder } from './builderKit';

// TODO(corp-grid): replace each stub with its real builder.
export const corpDeadlines: Builder = (feeds) => blank(null, statusOf(feeds.structures));
export const corpServices: Builder = (feeds) => blank(null, statusOf(feeds.structures));
export const corpJobs: Builder = (feeds) => blank(null, statusOf(feeds.corpJobs));
