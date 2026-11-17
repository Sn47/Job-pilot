import Link from 'next/link';
import { useRouter } from 'next/router';
import clsx from 'clsx';

const links = [
  { href: '/', label: 'Queue' },
  { href: '/tracker', label: 'Tracker' },
  { href: '/profile', label: 'Profile & resume' },
  { href: '/settings', label: 'Scan & settings' },
];

export function TopBar() {
  const { pathname } = useRouter();
  return (
    <header className="mb-6 border-b border-rule bg-surface">
      <div className="mx-auto flex max-w-[1280px] items-center gap-6 px-4 py-3">
        <Link href="/" className="font-serif text-[19px] font-semibold tracking-tight">Job Pilot</Link>
        <nav className="flex gap-1">
          {links.map((l) => (
            <Link key={l.href} href={l.href}
              className={clsx('rounded-control px-3 py-1.5 text-[14px]', pathname === l.href ? 'bg-paper font-medium text-ink' : 'text-muted hover:text-ink')}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
