import { isShareId } from '@/engine/share/shareId';

/** The Survey Share Link id in what an officer pasted: the bare id or a `/s/<id>` link. */
export function parseSurveyRef(text: string): string | null {
  const trimmed = text.trim();
  if (isShareId(trimmed)) return trimmed;
  const match = /\/s\/([A-Za-z0-9_-]+)/.exec(trimmed);
  return match && isShareId(match[1]) ? match[1] : null;
}
