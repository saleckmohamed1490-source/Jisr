import type { Locale } from "@/i18n/routing";
import type { Analysis } from "./schema";

/** Canned report used when AI_MOCK=1 so the UI can be developed without an API key. */
export function mockAnalysis(locale: Locale): Analysis {
  const t = {
    ar: {
      summary:
        "(تقرير تجريبي) يحتوي الإعلان على ادعاء مبالغ فيه وعبارة تخاطب صفة شخصية، مما يرفع احتمال الرفض.",
      i1: "مخاطبة صفة شخصية",
      e1: "عبارة \"هل تعاني من الوزن الزائد؟\" تفترض أن المشاهد لديه حالة جسدية.",
      p1: "الصفات الشخصية",
      i2: "ادعاء بنتيجة مضمونة",
      e2: "عبارة \"نتائج مضمونة خلال 7 أيام\" ادعاء غير واقعي ومحدد زمنياً.",
      p2: "الادعاءات المضللة / منتجات التخسيس",
      s1: "احذف السؤال الموجّه للمشاهد وتحدث عن المنتج نفسه.",
      s2: "استبدل \"مضمونة خلال 7 أيام\" بعبارة مثل \"يدعم نمط حياة صحي\".",
      s3: "استهدف الفئة العمرية 18+ فقط.",
      rewrite: "اكتشف شاي الأعشاب الطبيعي الذي يرافق نمط حياتك الصحي. اطلبه الآن واستمتع بتوصيل سريع.",
    },
    fr: {
      summary:
        "(Rapport de démonstration) La pub contient une allégation exagérée et une phrase visant une caractéristique personnelle, ce qui augmente le risque de refus.",
      i1: "Caractéristique personnelle",
      e1: "« Vous souffrez de surpoids ? » suppose que la personne a une condition physique.",
      p1: "Caractéristiques personnelles",
      i2: "Résultat garanti",
      e2: "« Résultats garantis en 7 jours » est une allégation irréaliste et limitée dans le temps.",
      p2: "Pratiques trompeuses / Perte de poids",
      s1: "Supprimez la question adressée au lecteur et parlez du produit.",
      s2: "Remplacez « garantis en 7 jours » par « accompagne un mode de vie sain ».",
      s3: "Ciblez uniquement les 18 ans et plus.",
      rewrite:
        "Découvrez notre tisane naturelle pour accompagner votre mode de vie sain. Commandez maintenant, livraison rapide.",
    },
    en: {
      summary:
        "(Demo report) The ad contains an exaggerated claim and a line that targets a personal attribute, which raises the risk of rejection.",
      i1: "Personal attribute",
      e1: "\"Struggling with extra weight?\" implies the viewer has a physical condition.",
      p1: "Personal attributes",
      i2: "Guaranteed result",
      e2: "\"Guaranteed results in 7 days\" is an unrealistic, time-bound claim.",
      p2: "Misleading claims / Weight loss products",
      s1: "Remove the question addressed to the viewer and talk about the product.",
      s2: "Replace \"guaranteed in 7 days\" with \"supports a healthy lifestyle\".",
      s3: "Target ages 18+ only.",
      rewrite:
        "Discover our natural herbal tea to support your healthy lifestyle. Order now with fast delivery.",
    },
  }[locale];

  return {
    verdict: "non_compliant",
    risk_score: 78,
    summary: t.summary,
    issues: [
      { title: t.i1, severity: "high", location: "text", policy: t.p1, explanation: t.e1 },
      { title: t.i2, severity: "medium", location: "text", policy: t.p2, explanation: t.e2 },
    ],
    suggestions: [
      { target: "text", action: t.s1 },
      { target: "text", action: t.s2 },
      { target: "targeting", action: t.s3 },
    ],
    rewritten_text: t.rewrite,
    image_prompt:
      "Bright, natural lifestyle product photo of a glass teapot of herbal tea on a wooden table with fresh mint leaves, soft morning light, no text, no people",
  };
}
