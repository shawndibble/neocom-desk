import { useEffect, useState, type ReactNode } from 'react';

interface LiveStatusProps {
  children?: ReactNode;
  announceKey?: string | number;
  id?: string;
  'data-testid'?: string;
}

export function LiveStatus({ children, announceKey, id, 'data-testid': testId }: LiveStatusProps) {
  const [quiet, setQuiet] = useState(true);
  const [seenKey, setSeenKey] = useState(announceKey);
  if (seenKey !== announceKey) {
    setSeenKey(announceKey);
    setQuiet(true);
  }

  useEffect(() => {
    if (!quiet) return;
    const timer = setTimeout(() => setQuiet(false), 0);
    return () => clearTimeout(timer);
  }, [quiet]);

  return (
    <span role="status" id={id} data-testid={testId} className="sr-only">
      {quiet ? null : children}
    </span>
  );
}

interface LiveNoteProps {
  as?: 'p' | 'span';
  className?: string;
  children: ReactNode;
}

export function LiveNote({ as: Tag = 'p', className, children }: LiveNoteProps) {
  return (
    <>
      <LiveStatus>{children}</LiveStatus>
      <Tag className={className}>{children}</Tag>
    </>
  );
}
