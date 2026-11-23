"use client";

import Link from "next/link";
import { useState } from "react";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

type Img = { id: string; url: string };
type ErrKey = "imageProOnly" | "noImageCredits" | "imageFailed" | "rateLimited";

export function GenerateImage({
  checkId,
  initial,
  isPro,
  imageCredits,
  t,
}: {
  checkId: string;
  initial: Img[];
  isPro: boolean;
  imageCredits: number;
  t: Dictionary;
}) {
  const r = t.report;
  const [images, setImages] = useState<Img[]>(initial);
  const [credits, setCredits] = useState(imageCredits);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrKey | null>(null);

  const message = (e: ErrKey) => (e === "rateLimited" ? t.form.errors.rateLimited : r[e]);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/checks/${checkId}/image`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const known: ErrKey[] = ["imageProOnly", "noImageCredits", "imageFailed", "rateLimited"];
        setError(known.includes(data.error) ? data.error : "imageFailed");
        return;
      }
      setImages((prev) => [{ id: data.id, url: data.url }, ...prev]);
      setCredits((c) => Math.max(0, c - 1));
    } catch {
      setError("imageFailed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">{r.generatedImages}</h3>
        {isPro ? (
          <button
            type="button"
            onClick={generate}
            disabled={loading || credits <= 0}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {loading ? r.generating : `${r.generateImage} (${credits})`}
          </button>
        ) : (
          <Link href="/billing" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            {t.dashboard.upgrade}
          </Link>
        )}
      </div>
      {!isPro && <p className="mt-2 text-sm text-slate-600">{r.imageProOnly}</p>}
      {isPro && credits <= 0 && !loading && <p className="mt-2 text-sm text-slate-600">{r.noImageCredits}</p>}
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message(error)}</p>}
      {images.length > 0 && (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {images.map((img) => (
            <li key={img.id} className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" className="w-full rounded-lg border border-slate-200" />
              <a href={img.url} download target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-600 hover:underline">
                {r.download}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
