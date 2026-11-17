/** A small authored icon set: one stroke weight, 24-unit grid. */
const paths: Record<string, string> = {
  queue: 'M4 6h16M4 12h16M4 18h10',
  tracker: 'M5 4v16M12 4v16M19 4v16M5 9h7M12 14h7',
  profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c0-3.3 3.6-5 8-5s8 1.7 8 5',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16',
  check: 'M5 12l4 4L19 7',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  external: 'M14 4h6v6M20 4l-9 9M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6',
  download: 'M12 4v11M7 11l5 5 5-5M4 20h16',
  mail: 'M4 6h16v12H4zM4 7l8 6 8-6',
  x: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  upload: 'M12 16V5M7 10l5-5 5 5M4 20h16',
  scissors: 'M6 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM6 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM20 4L8.5 15.5M8.5 8.5L20 20',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  save: 'M6 4h9l5 5v11H6zM9 4v5h6M9 20v-6h6v6',
  skip: 'M5 5l14 7-14 7z',
  edit: 'M4 20h4l11-11-4-4L4 16zM13 7l4 4',
  copy: 'M9 9h11v11H9zM4 15V4h11',
  refresh: 'M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3M18 3v4h-4M6 21v-4h4',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 8h.01M11 12h1v4h1',
  chevron: 'M9 6l6 6-6 6',
  back: 'M19 12H5M11 18l-6-6 6-6',
};

export function Icon({ name, size = 16, className = '' }: { name: keyof typeof paths; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={paths[name]} />
    </svg>
  );
}
