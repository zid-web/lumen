export function LogoMark({ className = 'size-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="lumen-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F5A623" />
          <stop offset="1" stopColor="#7C5CFC" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#lumen-g)" />
      <path d="M10 8v16h12" stroke="#0A0E1A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M17 12.5c1.6 1 1.6 4 0 5M20.5 10c3 2.2 3 7.8 0 10" stroke="#0A0E1A" strokeWidth="2.2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2.5 text-[17px] font-semibold tracking-tight text-fg">
      <LogoMark />
      Lumen
    </span>
  );
}
