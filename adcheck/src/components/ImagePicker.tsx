"use client";

import { useEffect, useState } from "react";

export function ImagePicker({
  file,
  onChange,
  label,
  hint,
  chooseLabel,
}: {
  file: File | null;
  onChange: (f: File | null) => void;
  label: string;
  hint: string;
  chooseLabel: string;
}) {
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div>
      <span className="block text-sm font-medium">{label}</span>
      <label className="mt-1 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-center hover:border-brand-500">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="max-h-64 rounded-md object-contain" />
        ) : (
          <span className="py-6 text-brand-600">{chooseLabel}</span>
        )}
        <span className="text-xs text-slate-500">{hint}</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        />
      </label>
    </div>
  );
}
