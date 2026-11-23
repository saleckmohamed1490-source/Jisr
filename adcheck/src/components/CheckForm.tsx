"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";
import type { Locale } from "@/lib/i18n/config";
import { ALLOWED_IMAGE_TYPES, EXTENSION_BY_TYPE, MAX_IMAGE_BYTES, type ImageMediaType } from "@/lib/image-validation";
import { createClient } from "@/lib/supabase/client";
import { AD_TEXT_MAX, PRODUCT_MAX } from "@/lib/validation";
import { ImagePicker } from "./ImagePicker";

type ErrorKey = keyof Dictionary["form"]["errors"];

export function CheckForm({
  t,
  locale,
  userId,
  disabled = false,
}: {
  t: Dictionary;
  locale: Locale;
  userId: string;
  disabled?: boolean;
}) {
  const f = t.form;
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [adText, setAdText] = useState("");
  const [product, setProduct] = useState("");
  const [error, setError] = useState<ErrorKey | null>(null);
  const [loading, setLoading] = useState(false);

  function validate(): ErrorKey | null {
    if (!file) return "imageRequired";
    if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) return "imageType";
    if (file.size > MAX_IMAGE_BYTES) return "imageSize";
    if (!adText.trim()) return "textRequired";
    if (!product.trim()) return "productRequired";
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = validate();
    setError(v);
    if (v) return;

    setLoading(true);
    try {
      // 1) Upload the image directly to Supabase Storage, in the user's folder.
      const ext = EXTENSION_BY_TYPE[file!.type as ImageMediaType];
      const imagePath = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await createClient()
        .storage.from("ad-images")
        .upload(imagePath, file!, { contentType: file!.type, upsert: false });
      if (uploadError) {
        setError("aiFailed");
        return;
      }

      // 2) Ask the server to analyze it. Credits are checked/deducted server-side.
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagePath, adText, product, locale }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data.error as ErrorKey) in f.errors ? (data.error as ErrorKey) : "aiFailed");
        return;
      }
      router.push(`/reports/${data.id}`);
      router.refresh();
    } catch {
      setError("aiFailed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-xl font-semibold">{f.title}</h2>
      <ImagePicker
        file={file}
        onChange={setFile}
        label={f.image}
        hint={f.imageHint}
        chooseLabel={f.chooseImage}
      />
      <div>
        <label htmlFor="adText" className="block text-sm font-medium">
          {f.adText}
        </label>
        <textarea
          id="adText"
          dir="auto"
          rows={5}
          maxLength={AD_TEXT_MAX}
          value={adText}
          onChange={(e) => setAdText(e.target.value)}
          placeholder={f.adTextPlaceholder}
          className="mt-1 w-full rounded-lg border border-slate-300 p-3 focus:border-brand-500 focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor="product" className="block text-sm font-medium">
          {f.product}
        </label>
        <input
          id="product"
          dir="auto"
          maxLength={PRODUCT_MAX}
          value={product}
          onChange={(e) => setProduct(e.target.value)}
          placeholder={f.productPlaceholder}
          className="mt-1 w-full rounded-lg border border-slate-300 p-3 focus:border-brand-500 focus:outline-none"
        />
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          {f.errors[error]}
        </p>
      )}
      <button
        type="submit"
        disabled={loading || disabled}
        className="w-full rounded-lg bg-brand-600 px-4 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {loading ? f.submitting : f.submit}
      </button>
      <p className="text-center text-xs text-slate-500">{t.common.disclaimer}</p>
    </form>
  );
}
