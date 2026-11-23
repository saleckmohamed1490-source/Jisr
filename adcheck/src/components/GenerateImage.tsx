"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Download, ImagePlus, Loader2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";

type Img = { id: string; url: string };
type ErrKey = "imageProOnly" | "noImageCredits" | "imageFailed" | "rateLimited";
const KNOWN: ErrKey[] = ["imageProOnly", "noImageCredits", "imageFailed", "rateLimited"];

export function GenerateImage({
  checkId,
  initial,
  canGenerate,
  imageCredits,
}: {
  checkId: string;
  initial: Img[];
  canGenerate: boolean;
  imageCredits: number;
}) {
  const r = useTranslations("report");
  const tf = useTranslations("form");
  const td = useTranslations("dashboard");
  const [images, setImages] = useState<Img[]>(initial);
  const [credits, setCredits] = useState(imageCredits);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrKey | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/checks/${checkId}/image`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(KNOWN.includes(data.error) ? data.error : "imageFailed");
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
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-lg">{r("generatedImages")}</CardTitle>
        {canGenerate ? (
          <Button onClick={generate} disabled={loading || credits <= 0}>
            {loading ? <Loader2 className="animate-spin" /> : <ImagePlus />}
            {loading ? r("generating") : `${r("generateImage")} (${credits})`}
          </Button>
        ) : (
          <Button asChild><Link href="/pricing">{td("upgrade")}</Link></Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {!canGenerate && <p className="text-sm text-muted-foreground">{r("imageProOnly")}</p>}
        {canGenerate && credits <= 0 && !loading && <p className="text-sm text-muted-foreground">{r("noImageCredits")}</p>}
        {error && <Alert variant="destructive">{error === "rateLimited" ? tf("errors.rateLimited") : r(error)}</Alert>}
        {images.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2">
            {images.map((img) => (
              <li key={img.id} className="space-y-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="" className="w-full rounded-lg border" />
                <Button asChild variant="outline" size="sm">
                  <a href={img.url} download target="_blank" rel="noreferrer"><Download />{r("download")}</a>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
