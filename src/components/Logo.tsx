export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0">
      <svg
        width="30"
        height="30"
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect
          width="36"
          height="36"
          rx="8"
          fill={light ? '#10B981' : '#0B1528'}
        />
        <path
          d="M9.5 11.5L13.6 24.5L18 14.5L22.4 24.5L26.5 11.5"
          stroke={light ? '#0B1528' : '#10B981'}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M14 9.5H22"
          stroke="#FFFFFF"
          strokeWidth="2"
          strokeLinecap="round"
          opacity={light ? '0.95' : '0.85'}
        />
      </svg>
      <span
        className={`font-display text-base font-bold tracking-tight whitespace-nowrap shrink-0 ${
          light ? 'text-white' : 'text-[#0B1528]'
        }`}
      >
        WARIS USDT SHOP
      </span>
    </span>
  );
}
