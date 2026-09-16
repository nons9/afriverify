import Link from 'next/link';

export function AfriVerifyMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="AfriVerify mark"
    >
      <circle cx="50" cy="50" r="46" fill="#1A1612" />
      <path
        d="M25,20 L63,15 L74,21 L76,32 L70,41 L79,47 L70,54 L67,70 L61,83 L52,86 L45,83 L33,74 L25,61 L23,50 L22,43 L20,38 L22,29 L25,20 Z"
        fill="#C9960E"
      />
      <ellipse
        cx="77"
        cy="64"
        rx="2.4"
        ry="5.2"
        fill="#C9960E"
        transform="rotate(-12 77 64)"
      />
      <path
        d="M30,58 L44,72 L70,38"
        stroke="#0D0B08"
        strokeWidth="3.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="50" cy="50" r="46" stroke="#C9960E" strokeWidth="1.5" />
    </svg>
  );
}

export function AfriVerifyLogo({
  size = 28,
  href = '/',
  textSize = 'text-base',
}: {
  size?: number;
  href?: string;
  textSize?: string;
}) {
  return (
    <Link href={href} className="flex items-center gap-2.5 shrink-0">
      <AfriVerifyMark size={size} />
      <span
        className={`${textSize} font-bricolage leading-none tracking-tight select-none`}
        aria-label="AfriVerify"
      >
        <span className="font-light text-[#EDE0C8]">Afri</span>
        <span className="font-extrabold text-[#C9960E]">Verify</span>
      </span>
    </Link>
  );
}
