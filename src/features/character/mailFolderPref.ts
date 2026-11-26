import { createLocalSetting } from '@/lib/useLocalSetting';
import { MAIL_FOLDERS, parseMailFolders, type MailTab } from '@/engine/mail/mail';

export const MAIL_FOLDERS_SETTING_KEY = 'mailFolders';

export const DEFAULT_MAIL_FOLDERS: readonly MailTab[] = MAIL_FOLDERS;

export const useMailFolders = createLocalSetting<readonly MailTab[]>({
  key: MAIL_FOLDERS_SETTING_KEY,
  defaultValue: DEFAULT_MAIL_FOLDERS,
  parse: parseMailFolders,
});
