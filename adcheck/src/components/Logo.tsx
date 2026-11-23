import { APP_NAME } from "@/lib/brand";

/** Brand mark: a check inside a shield. Deliberately unrelated to any platform's logo. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 font-bold text-brand-700 ${className}`}>
      <svg aria-hidden width="26" height="26" viewBox="0 0 32 32" fill="none">
        <path d="M16 2 4 7v8c0 7.5 5.1 13.3 12 15 6.9-1.7 12-7.5 12-15V7L16 2Z" fill="currentColor" />
        <path d="m10.5 16.5 4 4 7.5-8" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="hidden text-lg tracking-tight min-[380px]:inline">{APP_NAME}</span>
    </span>
  );
}
