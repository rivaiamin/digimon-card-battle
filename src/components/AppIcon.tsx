type Props = {
  size?: number;
  className?: string;
};

/** Arena sigil: command hex + clash cards + O / △ / X glyphs (matches battle UI). */
export function AppIcon({ size = 96, className = "" }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-hidden
    >
      <defs>
        <linearGradient id="app-icon-arena" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3c9bff" />
          <stop offset="100%" stopColor="#00ff88" />
        </linearGradient>
        <filter id="app-icon-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width="64" height="64" rx="14" fill="#050a12" />
      <path
        d="M0 20h64M0 44h64M20 0v64M44 0v64"
        stroke="#00ff88"
        strokeOpacity="0.12"
        strokeWidth="0.6"
      />
      <path
        d="M32 5 54.5 18v28L32 59 9.5 46V18Z"
        fill="none"
        stroke="url(#app-icon-arena)"
        strokeWidth="2.8"
        filter="url(#app-icon-glow)"
      />
      <path d="M21 38 32 22l11 9-11 16Z" fill="#3c9bff" />
      <path d="M25 42 36 26l11 9-11 16Z" fill="#ff3c3c" opacity="0.92" />
      <circle cx="32" cy="15" r="4.2" fill="#ff3c3c" />
      <path d="M46.4 21.6 52.8 32l-12.4 2.4 6-12.8Z" fill="#3c9bff" />
      <path
        d="M26.4 50.4 37.6 39.2M37.6 50.4 26.4 39.2"
        stroke="#ffcb00"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <circle cx="32" cy="34" r="2.8" fill="#ffcb00" />
    </svg>
  );
}
