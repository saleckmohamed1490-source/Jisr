"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";
import type { Locale } from "@/lib/i18n/config";
import { ALLOWED_IMAGE_TYPES, EXTENSION_BY_TYPE, MAX_IMAGE_BYTES, type ImageMediaType } from "@/lib/image-validation";
import { AD_TEXT_MAX, PRODUCT_MAX } from "@/lib/validation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
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
  const [landingUrl, setLandingUrl] = useState("");
  const [error, setError] = useState<ErrorKey | null>(null);
  const [loading, setLoading] = useState(false);

  function validate(): ErrorKey | null {
    if (!file) return "imageRequired";
    if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) return "imageType";
    if (file.size > MAX_IMAGE_BYTES) return "imageSize";
    if (!adText.trim()) return "textRequired";
    if (!product.trim()) return "productRequired";
    if (landingUrl.trim() && !/^https?:\/\/\S+$/i.test(landingUrl.trim())) return "invalidUrl";
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
        body: JSON.stringify({ imagePath, adText, product, landingUrl: landingUrl.trim() || undefined, locale }),
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
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{f.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <ImagePicker file={file} onChange={setFile} label={f.image} hint={f.imageHint} chooseLabel={f.chooseImage} />
          <div className="space-y-1.5">
            <Label htmlFor="adText">{f.adText}</Label>
            <Textarea id="adText" dir="auto" rows={5} maxLength={AD_TEXT_MAX} value={adText}
              onChange={(e) => setAdText(e.target.value)} placeholder={f.adTextPlaceholder} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="product">{f.product}</Label>
            <Input id="product" dir="auto" maxLength={PRODUCT_MAX} value={product}
              onChange={(e) => setProduct(e.target.value)} placeholder={f.productPlaceholder} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="landingUrl">{f.landingUrl}</Label>
            <Input id="landingUrl" type="url" dir="ltr" inputMode="url" maxLength={2000} value={landingUrl}
              onChange={(e) => setLandingUrl(e.target.value)} placeholder={f.landingUrlPlaceholder} />
            <p className="text-xs text-muted-foreground">{f.landingUrlHint}</p>
          </div>
          {error && <Alert variant="destructive">{f.errors[error]}</Alert>}
          <Button type="submit" size="lg" className="w-full" disabled={loading || disabled}>
            {loading ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
            {loading ? f.submitting : f.submit}
          </Button>
          <p className="text-center text-xs text-muted-foreground">{t.common.disclaimer}</p>
        </form>
      </CardContent>
    </Card>
  );
}
