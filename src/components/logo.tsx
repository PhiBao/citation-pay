export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="CitationPay"
    >
      <defs>
        <linearGradient id="lepton-fill" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#34d399" />
          <stop offset="1" stopColor="#0a0a0a" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" stroke="#34d399" strokeWidth="2" fill="#0a0a0a" />
      <circle cx="32" cy="32" r="22" stroke="#34d399" strokeWidth="0.75" strokeOpacity="0.5" fill="none" />
      <path
        d="M32 14 L40 18 V30 C40 36 36.4 41 32 44 C27.6 41 24 36 24 30 V18 Z"
        fill="url(#lepton-fill)"
        stroke="#34d399"
        strokeWidth="0.75"
        strokeLinejoin="round"
      />
      <text
        x="32"
        y="34"
        textAnchor="middle"
        fontSize="11"
        fontFamily="serif"
        fontWeight="700"
        fill="#0a0a0a"
        letterSpacing="0.4"
      >
        ΛΕ
      </text>
      <text
        x="32"
        y="55"
        textAnchor="middle"
        fontSize="6"
        fontFamily="ui-monospace, monospace"
        fontWeight="600"
        fill="#34d399"
        letterSpacing="0.6"
      >
        LEPTON
      </text>
    </svg>
  );
}
