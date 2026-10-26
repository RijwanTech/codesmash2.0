import { useEffect, useState, type ReactNode } from 'react';

const read = () => window.location.hash.replace(/^#/, '') || '/';

/** Tiny hash router: works on any static host, no server config needed. */
export function useRoute(): string {
  const [path, setPath] = useState(read);
  useEffect(() => {
    const onChange = () => {
      setPath(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return path;
}

export const navigate = (to: string) => {
  window.location.hash = to;
};

export function Link({ to, children, className, title }: { to: string; children: ReactNode; className?: string; title?: string }) {
  return (
    <a href={`#${to}`} className={className} title={title}>
      {children}
    </a>
  );
}
