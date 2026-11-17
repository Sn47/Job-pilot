import Link from 'next/link';
import { useRouter } from 'next/router';
import clsx from 'clsx';
import { useCandidate } from '../lib/candidate';

const NAV = [
  { href: '/', label: 'Jobs' },
  { href: '/profile', label: 'Profile' },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { pathname } = useRouter();
  const { candidate } = useCandidate();
  const setup = candidate?.setup;
  const bare = pathname === '/setup';

  return (
    <div className="min-h-full">
      <header className="mx-auto flex max-w-[1280px] items-center gap-8 px-6 pb-2 pt-5 md:px-10">
        <Link href="/" className="font-doc text-[19px] font-semibold tracking-tight text-text">Job Pilot</Link>
        {!bare && (
          <nav className="flex gap-5 text-[14px]" aria-label="Main">
            {NAV.map((n) => {
              const on = pathname === n.href;
              return (
                <Link key={n.href} href={n.href} aria-current={on ? 'page' : undefined}
                  className={clsx('py-1 transition-colors', on ? 'border-b border-text text-text' : 'text-muted hover:text-text')}>{n.label}</Link>
              );
            })}
          </nav>
        )}
        {!bare && setup && !setup.complete && (
          <Link href="/setup" className="ml-auto text-[13px] text-muted hover:text-text">Finish set-up →</Link>
        )}
      </header>
      <main className={clsx('mx-auto max-w-[1280px] px-6 pb-24 md:px-10', bare ? 'pt-4' : 'pt-8')}>{children}</main>
    </div>
  );
}
