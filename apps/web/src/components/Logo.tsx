// The Split Lah logo: one circle (the bill) split into two halves (the shares).
// Drawn as SVG, so it is sharp at any size and needs no image file.
export function Logo({ size, moving }: { size: number; moving?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true" // decoration: the name next to it is what gets read out
      className={`flex-none overflow-visible ${moving ? 'logo-move' : ''}`}
    >
      <defs>
        <linearGradient id="logo-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c4b5fd" />
          <stop offset="1" stopColor="#6d5ce0" />
        </linearGradient>
        <linearGradient id="logo-b" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5eead4" />
          <stop offset="1" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      {/* 0.84: room for the halves to slide without leaving the box */}
      <g transform="rotate(35 32 32) translate(32 32) scale(0.84) translate(-32 -32)">
        <path
          className="half-a"
          d="M29 5a27 27 0 0 0 0 54Z"
          fill="url(#logo-a)"
        />
        <path
          className="half-b"
          d="M35 5a27 27 0 0 1 0 54Z"
          fill="url(#logo-b)"
        />
      </g>
    </svg>
  );
}

// The logo with the name, for the top of a page
export function Brand() {
  return (
    <span className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
      <Logo size={28} />
      split lah
    </span>
  );
}
