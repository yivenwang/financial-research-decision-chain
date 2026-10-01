/** A compact, code-native lighthouse mark based on the approved Beacon references. */
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
      <path d="M5 18.5 18 14l5 2v5L5 24z" fill="#F4B65D" opacity=".85" />
      <path d="m43 18.5-13-4.5-5 2v5l18 3z" fill="#F4B65D" opacity=".85" />
      <path d="m15 12 9-7 9 7-9-2z" fill="#102C48" />
      <path d="M17 13h14v5H17z" fill="#2675C8" />
      <path d="M20 18h8l5 25H15z" fill="#102C48" />
      <path d="m17.5 30 12-6 1.3 6.2-15 7.5z" fill="#5BB8C5" />
      <path d="m15.6 39 16-8 1.2 6-17.7 8.8z" fill="#5BB8C5" />
      <path d="M13 44h22" stroke="#102C48" strokeWidth="2" strokeLinecap="round" />
      <circle cx="24" cy="17" r="2" fill="#FFF5DB" />
    </svg>
  );
}
