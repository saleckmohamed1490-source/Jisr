# AdCheck

تطبيق ويب يساعد المعلنين على فحص إعلانات فيسبوك وإنستغرام قبل نشرها: يرفع المستخدم صورة الإعلان ونصّه ووصفاً قصيراً للمنتج، فيحلّلها Claude وفق ملخص لسياسات إعلانات ميتا ويُرجع تقريراً منظماً (النتيجة، المخالفات المحتملة مع السياسة المعنية، اقتراحات تعديل، نص بديل متوافق)، مع خيار توليد صورة إعلانية متوافقة لمشتركي الخطة الاحترافية.

> ⚠️ هذه الأداة تقلل احتمال الرفض ولا تضمن قبول ميتا.

## التقنيات

| الجزء | التقنية |
|---|---|
| الواجهة والخادم | Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 |
| الحسابات وقاعدة البيانات والتخزين | Supabase (بريد + Google، Postgres مع RLS، Storage خاص) |
| تحليل الإعلان | Claude API عبر `@anthropic-ai/sdk` (افتراضياً `claude-sonnet-5-5`)، مخرجات JSON مُتحقَّق منها بـ zod |
| توليد الصور | OpenAI `gpt-image-1` أو Replicate (Flux)، يُختار عبر `IMAGE_PROVIDER` |
| الدفع | Lemon Squeezy (اشتراك شهري) خلف طبقة دفع مستقلة |
| اللغات | العربية (RTL) والفرنسية والإنجليزية |

## هيكل المشروع

```
adcheck/
├── knowledge/meta-policies.md        قاعدة معرفة سياسات ميتا (تُرسل في system prompt لكل تحليل)
├── supabase/migrations/              ملفات SQL تُنفَّذ بالترتيب
│   ├── 0001_auth_and_checks.sql      profiles، checks، حاوية الصور ad-images
│   ├── 0002_credits_and_rate_limits.sql  الرصيد، consume/refund_credit، hit_rate_limit
│   ├── 0003_generated_images.sql     الصور المولّدة
│   └── 0004_billing.sql              الاشتراكات، billing_events، grant_paid_period
├── src/
│   ├── proxy.ts                      (middleware سابقاً) تحديث جلسة Supabase وحماية الصفحات
│   ├── app/
│   │   ├── page.tsx                  الصفحة الرئيسية + الأسعار
│   │   ├── login/ signup/            تسجيل الدخول / إنشاء حساب
│   │   ├── auth/callback/            عودة Google وتأكيد البريد
│   │   ├── dashboard/                رفع إعلان جديد + الرصيد + السجل
│   │   ├── reports/[id]/             صفحة التقرير + توليد الصور
│   │   ├── billing/                  صفحة الاشتراك
│   │   └── api/
│   │       ├── check/                التحليل (خصم الرصيد في السيرفر)
│   │       ├── checks/[id]/image/    توليد صورة متوافقة
│   │       └── billing/webhook/[provider]/  webhooks الدفع
│   ├── components/                   مكوّنات الواجهة
│   └── lib/
│       ├── analysis/                 schema (zod) + prompt + استدعاء Claude + تقرير تجريبي
│       ├── imagegen/                 openai.ts، replicate.ts، mock.ts (قابلة للتبديل)
│       ├── billing/                  types.ts (الواجهة العامة)، lemonsqueezy.ts، service.ts
│       ├── i18n/                     القواميس الثلاثة وأدوات اللغة
│       ├── supabase/                 عملاء Supabase (مستخدم / خادم / service role)
│       ├── credits.ts  rate-limit.ts  image-validation.ts  validation.ts
```

## كيف يعمل الأمان والرصيد

- **الرصيد يُخصم في قاعدة البيانات فقط**: الدالة `consume_credit` تُنقص رصيداً واحداً بشكل ذرّي قبل استدعاء الذكاء الاصطناعي، وتُعيده `refund_credit` إذا فشل التحليل. هذه الدوال وجميع دوال تغيير الخطة لا يستطيع استدعاءها إلا مفتاح `service_role` (أي الخادم)، والمستخدم يستطيع **قراءة** ملفه فقط (RLS).
- **رفع الصور**: يرفع المتصفح الصورة مباشرة إلى Supabase Storage داخل مجلد باسم المستخدم (يتجنب حدّ 4.5MB لحجم الطلب على Vercel). الحاوية نفسها تفرض 5MB وصيغ JPG/PNG/WEBP، ثم يتحقق الخادم مرة أخرى من الحجم ومن **البايتات الأولى للملف** (وليس من الامتداد).
- **Rate limiting** لكل مستخدم في Postgres (نافذة منزلقة: دقيقة وساعة)، فيعمل عبر كل نسخ الخادم دون خدمة إضافية. القيم قابلة للتعديل من متغيرات البيئة.
- **نص المعلن** يُعامل كبيانات وليس كتعليمات للنموذج (حماية من prompt injection).
- **Webhooks**: يُتحقق من توقيع HMAC، وكل حدث يُسجَّل مرة واحدة في `billing_events` فلا يُطبَّق مرتين عند إعادة الإرسال.

## الخطط

| | مجاني | احترافي (6$ شهرياً) |
|---|---|---|
| الفحوصات | 3 عند التسجيل | 100 كل شهر |
| الصور المولّدة | — | 25 كل شهر |

عند كل دفعة ناجحة (`subscription_payment_success`) يُعاد ضبط الرصيد إلى 100/25 (الرصيد غير المستخدم لا يُرحَّل). عند انتهاء الاشتراك يعود الحساب للخطة المجانية مع الإبقاء على الفحوصات المتبقية وحذف رصيد الصور. القيم في `src/lib/billing/plans.ts`.

---

## التشغيل محلياً

### المتطلبات
- Node.js 20.9 أو أحدث
- مشروع Supabase (مجاني على supabase.com)، أو Supabase محلي عبر Docker
- مفتاح Claude API من console.anthropic.com

### 1) التثبيت

```bash
cd adcheck
npm install
cp .env.example .env.local
```

### 2) إعداد Supabase

1. أنشئ مشروعاً على [supabase.com](https://supabase.com).
2. من **SQL Editor** نفّذ ملفات `supabase/migrations/` بالترتيب (0001 ثم 0002 ثم 0003 ثم 0004). الملفات قابلة لإعادة التشغيل بأمان.
3. من **Project Settings → API** انسخ إلى `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (anon / publishable key)
   - `SUPABASE_SERVICE_ROLE_KEY` (سرّي — للخادم فقط)
4. من **Authentication → URL Configuration**:
   - Site URL: `http://localhost:3000`
   - Redirect URLs: أضف `http://localhost:3000/auth/callback`
5. **Google**: من Authentication → Providers → Google فعّل المزوّد وضع Client ID وSecret من Google Cloud Console. في Google Cloud أضف إلى *Authorized redirect URIs* العنوان `https://<project-ref>.supabase.co/auth/v1/callback`.

**بديل محلي بالكامل** (يحتاج Docker):
```bash
npx supabase init           # مرة واحدة، ينشئ supabase/config.toml
npx supabase start          # يطبّق الـ migrations ويطبع URL والمفاتيح
```

### 3) Claude

ضع `ANTHROPIC_API_KEY` في `.env.local`. النموذج الافتراضي `claude-sonnet-5-5` ويمكن تغييره بـ `CLAUDE_MODEL`.

للعمل على الواجهة دون مفتاح، ضع `AI_MOCK=1` لإرجاع تقرير تجريبي ثابت، و`IMAGE_PROVIDER=mock` لتوليد صورة تجريبية.

### 4) التشغيل

```bash
npm run dev
# http://localhost:3000
```

أوامر أخرى: `npm run build`، `npm run start`، `npm run lint`.

### 5) تجربة الدفع محلياً (اختياري)

Lemon Squeezy يحتاج عنواناً عاماً لإرسال webhooks. استخدم نفقاً مثل `ngrok http 3000` واضبط الـ webhook على `https://<النفق>/api/billing/webhook/lemonsqueezy` (انظر قسم Lemon Squeezy أدناه)، مع وضع Test mode في المتجر.

---

## إعداد Lemon Squeezy

1. أنشئ متجراً ومنتجاً من نوع **Subscription** بسعر 6$ شهرياً.
2. انسخ **Variant ID** الخاص بالسعر إلى `LEMONSQUEEZY_VARIANT_ID`، و**Store ID** إلى `LEMONSQUEEZY_STORE_ID`.
3. من **Settings → API** أنشئ مفتاحاً وضعه في `LEMONSQUEEZY_API_KEY`.
4. من **Settings → Webhooks** أضف webhook:
   - URL: `https://<نطاقك>/api/billing/webhook/lemonsqueezy`
   - Signing secret: قيمة عشوائية طويلة، وضعها أيضاً في `LEMONSQUEEZY_WEBHOOK_SECRET`
   - الأحداث: `subscription_created`, `subscription_updated`, `subscription_cancelled`, `subscription_resumed`, `subscription_expired`, `subscription_paused`, `subscription_unpaused`, `subscription_payment_success`

يُمرَّر معرّف المستخدم إلى صفحة الدفع في `custom.user_id`، وتعيده Lemon Squeezy في كل webhook.

### إضافة الدفع بـ USDT لاحقاً

طبقة الدفع منفصلة عن منطق الرصيد:

1. أنشئ `src/lib/billing/usdt.ts` يطبّق الواجهة `BillingProvider` من `src/lib/billing/types.ts`:
   - `createCheckout` ينشئ فاتورة لدى مزوّد الدفع بالعملات الرقمية ويُرجع رابطها.
   - `parseWebhook` يتحقق من التوقيع ويحوّل إشعار «تم الدفع» إلى حدث `period_paid` مع `periodEnd` = تاريخ الدفع + 30 يوماً (الدفع بالعملات الرقمية غالباً لمرة واحدة وليس متكرراً).
2. سجّله في `src/lib/billing/index.ts`. سيكون الـ webhook على `/api/billing/webhook/<اسم المزوّد>`.
3. `service.ts` وجداول قاعدة البيانات لا تحتاج أي تعديل.

---

## النشر على Vercel

1. ارفع المستودع إلى GitHub.
2. على [vercel.com](https://vercel.com): **Add New → Project** واختر المستودع.
3. **Root Directory**: اختر `adcheck` (مهم، لأن التطبيق داخل هذا المجلد).
4. Framework: Next.js (يُكتشف تلقائياً). لا حاجة لتغيير أوامر البناء.
5. في **Environment Variables** أضف كل المتغيرات من `.env.example` بقيم الإنتاج، واضبط `NEXT_PUBLIC_SITE_URL` على نطاقك (مثلاً `https://adcheck.vercel.app`). لا تضع `AI_MOCK=1` في الإنتاج.
6. اضغط **Deploy**.
7. بعد النشر:
   - في Supabase → Authentication → URL Configuration: غيّر Site URL إلى نطاقك وأضف `https://<نطاقك>/auth/callback` إلى Redirect URLs.
   - في Lemon Squeezy: اجعل الـ webhook يشير إلى `https://<نطاقك>/api/billing/webhook/lemonsqueezy`.

ملاحظات:
- مسارات التحليل وتوليد الصور مضبوطة على `maxDuration = 120` ثانية. تأكد أن خطة Vercel تسمح بهذه المدة (مع Fluid Compute المدة الافتراضية كافية).
- ملف `knowledge/meta-policies.md` يُضمَّن في الدوال عبر `outputFileTracingIncludes` في `next.config.ts`.
- عند تغيير أي متغير يبدأ بـ `NEXT_PUBLIC_` أعد النشر، لأن قيمته تُدمج وقت البناء.

---

## تحديث قاعدة معرفة السياسات

ميتا تحدّث سياساتها باستمرار. عدّل `knowledge/meta-policies.md` (بالإنجليزية لدقة أكبر في فهم النموذج) ثم أعد النشر. يُرسل الملف كاملاً في system prompt ثابت لكل طلب، مع تفعيل prompt caching لتقليل التكلفة.

## متغيرات البيئة

القائمة الكاملة مع الشرح في [`.env.example`](./.env.example).
