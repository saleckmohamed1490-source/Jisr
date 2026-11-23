export function Disclaimer({ text, className = "" }: { text: string; className?: string }) {
  return (
    <p
      role="note"
      className={`rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 ${className}`}
    >
      ⚠️ {text}
    </p>
  );
}
