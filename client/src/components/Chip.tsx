import type { ReactNode } from 'react';

export function Chip({
  kind = 'neutral',
  children,
}: {
  kind?: 'good' | 'bad' | 'neutral' | 'live' | 'warn';
  children: ReactNode;
}) {
  return <span className={`chip chip-${kind}`}>{children}</span>;
}
