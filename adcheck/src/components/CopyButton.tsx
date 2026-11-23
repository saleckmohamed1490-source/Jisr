"use client";

import { useState } from "react";

export function CopyButton({ text, label, copiedLabel }: { text: string; label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm hover:bg-slate-50"
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
