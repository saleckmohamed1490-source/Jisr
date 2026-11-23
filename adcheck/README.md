# AdCheck

تطبيق ويب (SaaS) يساعد المعلنين على التأكد من توافق إعلانات فيسبوك وإنستغرام مع سياسات إعلانات ميتا **قبل** نشرها، وإنشاء صور إعلانية متوافقة، وكتابة رسائل طعن عند الرفض.

> ⚠️ الأداة تقلل احتمال الرفض ولا تضمن قبول ميتا. AdCheck غير تابع لشركة Meta Platforms, Inc.

الاسم مؤقت ويُغيَّر من متغير واحد: `NEXT_PUBLIC_APP_NAME` (لا تستخدم Meta أو Facebook في الاسم).

---

## الميزات

| الميزة | التفاصيل |
|---|---|
| فحص الإعلان | صورة (JPG/PNG/WEBP حتى 10MB) + نص + وصف المنتج + رابط صفحة الهبوط (اختياري) |
| التقرير | متوافق / خطر متوسط / غير متوافق، درجة خطر 0–100، المخالفات مع اسم السياسة، اقتراحات، نص بديل متوافق |
| صورة متوافقة | توليد صورة جديدة تتجنب المخالفات (OpenAI gpt-image أو Replicate Flux) |
| رسائل الطعن | لصق سبب الرفض → طلب مراجعة احترافي وصادق + تقييم هل الرفض مبرَّر |
| السجل | كل الفحوصات ورسائل الطعن والفواتير |
| مساحات العمل | خطة Agency: حتى 5 مساحات لعملاء مختلفين |
| اللغات | الإنجليزية (افتراضية) والعربية (RTL) والفرنسية عبر next-intl |
| الدفع | كريبتو فقط عبر NOWPayments (USDT TRC20/BEP20/ERC20، USDC، BTC، ETH، BNB، LTC، TRX) |
| التذكيرات | بريد قبل 3 أيام وقبل يوم من الانتهاء + رجوع تلقائي إلى Free (Vercel Cron يومي) |
| الأدمن | `/admin`: المستخدمون، المشتركون، الدخل، آخر المدفوعات، تفعيل يدوي |

## الباقات

| | Free | Starter | Pro | Agency |
|---|---|---|---|---|
| السعر الشهري | 0$ | 6$ | 19$ | 49$ |
| الفحوصات | 3 عند التسجيل | 100 | غير محدود (حد عادل 1000) | غير محدود (حد عادل 1000) |
| الصور | — | 25 | 100 | 300 |
| رسائل الطعن | — | 5 | غير محدودة | غير محدودة |
| مساحات العمل | — | — | — | 5 |

- المدة: شهر أو 3 أشهر أو 12 شهراً (السنوي = سعر 10 أشهر).
- الرصيد يتجدد كل **30 يوماً من تاريخ التفعيل** ولا يُرحَّل.
- الدفع أثناء الاشتراك بنفس الخطة **يضيف المدة إلى نهاية** الاشتراك الحالي. الدفع لخطة أخرى ينقلك إليها فوراً مع الاحتفاظ بالمدة المتبقية.
- عند الانتهاء: الرجوع إلى Free وتصفير رصيد الخطة المدفوعة.
- كل الأرقام في ملف واحد: `src/lib/plans.ts`.

---

## التقنيات

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui · next-intl · Supabase (Auth + Postgres + Storage) · Claude API · OpenAI / Replicate · NOWPayments · Resend · Vercel

## هيكل المشروع

```
adcheck/
├── knowledge/meta-policies.md      قاعدة معرفة سياسات ميتا (تُرسل في system prompt لكل تحليل)
├── content/legal/{en,ar,fr}/       الشروط، الخصوصية، الاسترجاع (Markdown، عدّلها مباشرة)
├── messages/{en,ar,fr}.json        نصوص الواجهة والرسائل البريدية
├── supabase/migrations/            0001 → 0010، تُنفَّذ بالترتيب
├── vercel.json                     جدولة الـ Cron اليومي
├── tests/                          اختبارات vitest
└── src/
    ├── proxy.ts                    next-intl + تحديث جلسة Supabase + حماية الصفحات
    ├── i18n/                       routing.ts (اللغات)، request.ts، navigation.ts
    ├── app/
    │   ├── [locale]/               كل الصفحات (/ للإنجليزية، /ar، /fr)
    │   │   ├── page.tsx            الصفحة الرئيسية
    │   │   ├── pricing/            الأسعار
    │   │   ├── login/ signup/      الحسابات
    │   │   ├── dashboard/          فحص جديد + الرصيد + السجل + مساحات العمل
    │   │   ├── reports/[id]/       التقرير + توليد الصور
    │   │   ├── appeals/            رسائل الطعن (قائمة / جديد / عرض)
    │   │   ├── billing/            الاشتراك والفواتير، checkout، status، invoices/[id]
    │   │   ├── how-to-pay-crypto/  شرح الدفع من Binance
    │   │   ├── terms/ privacy/ refund/
    │   │   └── admin/              لوحة الإدارة
    │   ├── auth/callback/          عودة Google وتأكيد البريد
    │   └── api/
    │       ├── check/              التحليل (خصم الرصيد في السيرفر)
    │       ├── checks/[id]/image/  توليد الصورة
    │       ├── appeals/            رسالة الطعن
    │       ├── payments/[orderId]/ حالة الدفع (لصفحة الحالة)
    │       ├── webhooks/[provider]/  IPN ← /api/webhooks/nowpayments
    │       └── cron/daily/         التذكيرات والانتهاء وتجديد الرصيد
    ├── components/ (+ ui/ لمكونات shadcn)
    └── lib/
        ├── analysis/               schema (zod)، prompt، Claude، صفحة الهبوط، تصغير الصورة
        ├── appeals/                رسائل الطعن
        ├── imagegen/               openai / replicate / mock
        ├── payments/               واجهة PaymentProvider + nowpayments.ts + service.ts
        ├── email/                  Resend + القوالب
        ├── plans.ts  credits.ts  subscriptions.ts  cron.ts  rate-limit.ts
        └── supabase/  admin-data/  data/
```

## الأمان

- **الرصيد يُخصم في قاعدة البيانات فقط** (`consume_credit`) قبل استدعاء الذكاء الاصطناعي، ويُعاد عند الفشل. دوال الرصيد والاشتراك لا يستدعيها إلا مفتاح `service_role`. المستخدم يقرأ بياناته فقط (RLS).
- **الدفع**: لا يُفعَّل الاشتراك إلا عند `finished` مع توقيع HMAC-SHA512 صحيح ومبلغ مطابق. `activate_payment` يفعّل كل دفعة **مرة واحدة** ويمدد الاشتراك في نفس العملية، و`payment_id` فريد. حالة متأخرة لا تُرجع دفعة مكتملة إلى الوراء.
- **الصور**: رفع مباشر من المتصفح إلى مجلد المستخدم في Storage خاص، فحص البايتات الأولى في السيرفر، وإعادة ترميز الصورة (≤1568px) قبل إرسالها لـ Claude.
- **صفحة الهبوط**: جلب من السيرفر مع حماية SSRF (رفض العناوين الداخلية، إعادة الفحص عند كل تحويل، حد للحجم والوقت).
- **Rate limiting** لكل مستخدم في Postgres (دقيقة / ساعة) للفحص والصور والطعون والدفع.
- النصوص التي يدخلها المستخدم تُعامل كبيانات وليست تعليمات للنموذج.

---

## التشغيل محلياً

### المتطلبات
- Node.js 20.9 أو أحدث
- مشروع Supabase (مجاني) — أو Docker لتشغيل Supabase محلياً

### 1) التثبيت
```bash
cd adcheck
npm install
cp .env.example .env.local
```

### 2) Supabase
1. أنشئ مشروعاً على supabase.com.
2. من **SQL Editor** نفّذ كل ملفات `supabase/migrations/` **بالترتيب** من `0001` إلى `0010`.
3. من **Project Settings → API** انسخ `URL` و`anon key` و`service_role key` إلى `.env.local`.
4. **Authentication → URL Configuration**: ‏Site URL = `http://localhost:3000`، وأضف `http://localhost:3000/auth/callback` إلى Redirect URLs.
5. **Google**: ‏Authentication → Providers → Google: فعّله وضع Client ID/Secret من Google Cloud Console، وفي Google أضف `https://<project-ref>.supabase.co/auth/v1/callback` إلى Authorized redirect URIs.

بديل محلي كامل (Docker):
```bash
npx supabase init      # مرة واحدة
npx supabase start     # يطبّق الـ migrations ويطبع URL والمفاتيح
```

### 3) المفاتيح الأساسية
- `ANTHROPIC_API_KEY` من console.anthropic.com (النموذج الافتراضي `claude-sonnet-5-5`).
- للعمل على الواجهة بدون مفاتيح: `AI_MOCK=1` و`IMAGE_PROVIDER=mock`. بدون `RESEND_API_KEY` تُطبع الرسائل البريدية في السجل بدل إرسالها.

### 4) التشغيل
```bash
npm run dev          # http://localhost:3000
npm test             # اختبارات الوحدة (التوقيع، الأسعار، SSRF، الترجمات...)
npm run lint
npm run build
```

---

## إعداد NOWPayments

### إنشاء الحساب والمحفظة
1. أنشئ حساباً على **nowpayments.io** وأكمل التحقق المطلوب.
2. **إعداد محفظة الاستلام (Payout wallet)**: من لوحة التحكم أضف عنوان المحفظة التي تريد أن تصلك إليها الأموال (مثلاً عنوان USDT TRC20 في Binance أو محفظتك الخاصة). تأكد من الشبكة الصحيحة للعنوان.
3. **العملات**: من إعدادات العملات فعّل العملات التي يعرضها التطبيق. الرموز المستخدمة في `src/lib/payments/currencies.ts`:
   `usdttrc20`, `usdtbsc`, `usdterc20`, `usdc`, `btc`, `eth`, `bnbbsc`, `ltc`, `trx`.
   **تحقق من هذه الرموز في لوحة NOWPayments** (قائمة العملات) وعدّل الملف إذا اختلف أي رمز أو أردت إزالة عملة.
4. **مفتاح API**: من Settings → Payments → API keys أنشئ مفتاحاً → `NOWPAYMENTS_API_KEY`.
5. **IPN**: من Settings → Payments → Instant payment notifications أنشئ **IPN secret key** → `NOWPAYMENTS_IPN_SECRET`.
   - رابط الـ IPN يُرسل تلقائياً مع كل فاتورة: `https://<نطاقك>/api/webhooks/nowpayments` (لا يلزم ضبطه يدوياً، لكن يمكنك وضعه أيضاً في اللوحة).
   - التطبيق يتحقق من الترويسة `x-nowpayments-sig`: ‏HMAC-SHA512 لجسم JSON بعد ترتيب مفاتيحه أبجدياً، ويرفض أي طلب غير صحيح (401).

### الاختبار في Sandbox (ابدأ به)
1. أنشئ حساب **sandbox** منفصلاً لدى NOWPayments (راجع صفحة Sandbox في توثيقهم) واحصل منه على API key وIPN secret خاصين بالـ sandbox.
2. ضع `NOWPAYMENTS_SANDBOX=true` مع مفاتيح الـ sandbox. سيستخدم التطبيق `https://api-sandbox.nowpayments.io/v1`.
3. NOWPayments يحتاج رابطاً عاماً لإرسال الـ IPN. محلياً استخدم نفقاً:
   ```bash
   npx ngrok http 3000      # أو cloudflared tunnel
   ```
   وضع رابط النفق في `NEXT_PUBLIC_SITE_URL` ثم أعد تشغيل `npm run dev`.
4. اختر خطة → «ادفع بالكريبتو» → أكمل الدفع التجريبي → راقب صفحة «حالة الدفع» تتحدث، وصفحة الاشتراك والفواتير.
5. جرّب: دفعاً ناقصاً (partially_paid لا يفعّل)، وإعادة إرسال نفس الـ IPN (لا يُفعَّل مرتين)، ودفعاً جديداً أثناء الاشتراك (تُضاف المدة).
6. عند الانتقال للإنتاج: `NOWPAYMENTS_SANDBOX=false` مع مفاتيح الحساب الحقيقي.

> ملاحظة: لكل عملة حد أدنى للمبلغ لدى NOWPayments. مبلغ صغير مثل 6$ قد يكون أقل من الحد الأدنى لبعض العملات (مثل BTC أو ERC20 بسبب الرسوم). إذا ظهر خطأ عند إنشاء الفاتورة، أزل تلك العملة من `currencies.ts` أو اطلب من العميل اختيار USDT TRC20.

### حالات الدفع
`waiting` → `confirming` → `confirmed` → `sending` → `finished` (التفعيل هنا فقط). `partially_paid` لا يفعّل ويعرض للعميل المبلغ المتبقي ورابط الدعم، والأدمن يستطيع قبوله يدوياً من `/admin` برقم الطلب. `failed` و`expired` و`refunded` لا تفعّل شيئاً.

### إضافة الدفع بالبطاقة لاحقاً (Lemon Squeezy)
نفّذ الواجهة `PaymentProvider` في `src/lib/payments/types.ts` داخل ملف جديد (مثلاً `lemonsqueezy.ts`) وسجّله في `src/lib/payments/index.ts`. سيصبح الـ webhook على `/api/webhooks/lemonsqueezy`. منطق التفعيل والاشتراك والرصيد لا يتغير.

---

## البريد (Resend)
1. أنشئ حساباً على resend.com وأضف نطاقك وتحقق منه (سجلات DNS).
2. `RESEND_API_KEY` و`EMAIL_FROM` (من النطاق المتحقق منه، مثل `AdCheck <billing@yourdomain.com>`).
3. الرسائل: تأكيد الدفع مع الفاتورة، تذكير قبل 3 أيام وقبل يوم مع رابط تجديد مباشر، وإشعار انتهاء الخطة — بلغة المستخدم.

---

## النشر على Vercel

1. ارفع المستودع إلى GitHub.
2. على vercel.com: **Add New → Project** واختر المستودع.
3. **Root Directory**: ‏`adcheck`.
4. أضف كل متغيرات `.env.example` بقيم الإنتاج في **Settings → Environment Variables**. مهم:
   - `NEXT_PUBLIC_SITE_URL` = رابط موقعك النهائي.
   - `CRON_SECRET` = نص عشوائي طويل (Vercel يرسله تلقائياً للـ Cron).
   - `AI_MOCK=0` و`NOWPAYMENTS_SANDBOX=false` في الإنتاج.
5. **Deploy**.
6. الـ Cron اليومي معرّف في `vercel.json` (`/api/cron/daily`). تأكد من ظهوره في **Settings → Cron Jobs**.
7. مسارات التحليل وتوليد الصور ورسائل الطعن تستخدم `maxDuration = 120` ثانية، والـ Cron 300 ثانية. تأكد أن خطة Vercel تسمح بذلك.

### ربط الدومين
1. في Vercel: **Settings → Domains → Add** وأدخل نطاقك (مثلاً `adcheck.com` و`www.adcheck.com`).
2. عند مزوّد النطاق أضف السجلات التي يعرضها Vercel (عادة سجل `A` للنطاق الرئيسي وسجل `CNAME` لـ `www`)، وانتظر التحقق وإصدار شهادة SSL تلقائياً.
3. بعد الربط حدّث:
   - `NEXT_PUBLIC_SITE_URL` في Vercel ثم أعد النشر.
   - Supabase → Authentication → URL Configuration: ‏Site URL الجديد + `https://<نطاقك>/auth/callback`.
   - Google Cloud Console: أضف نطاقك إلى Authorized JavaScript origins إن لزم.
   - Resend: أرسل من نطاقك المتحقق منه.
   - NOWPayments: يُرسل رابط IPN الجديد تلقائياً مع كل فاتورة جديدة.

---

## لوحة الإدارة
ضع بريدك في `ADMIN_EMAILS` (يمكن عدة عناوين مفصولة بفواصل). الصفحة `/admin` تظهر 404 لأي شخص آخر. التفعيل اليدوي:
- **برقم طلب**: يعلّم تلك الدفعة كمدفوعة ويفعّلها (مرة واحدة)، مثلاً لدفعة ناقصة قبلتها.
- **بدون رقم طلب**: يسجّل دفعة `manual` بقيمة 0 للتوثيق ثم يفعّل.

## إضافة لغة جديدة
1. أضف الرمز في `src/i18n/routing.ts` (`locales`، `localeNames`، و`rtlLocales` إن كانت من اليمين لليسار).
2. انسخ `messages/en.json` إلى `messages/<code>.json` وترجمه (الاختبار `tests/i18n.test.ts` يتأكد من عدم نقص أي مفتاح).
3. أضف `content/legal/<code>/` واللغة في `LANGUAGE_NAMES` داخل `src/lib/analysis/prompt.ts` و`src/lib/appeals/generate.ts`، وفي قيود `checks.locale` و`appeals.letter_language` في قاعدة البيانات.

## تحديث قاعدة معرفة السياسات
عدّل `knowledge/meta-policies.md` (بالإنجليزية لدقة أعلى) ثم أعد النشر. يُرسل كاملاً في system prompt ثابت مع prompt caching لتقليل التكلفة.

## الصفحات القانونية
`content/legal/<lang>/{terms,privacy,refund}.md` نماذج: استبدل `[اسم الشركة]` وراجعها مع محامٍ قبل الإطلاق، وحدّث `LEGAL_LAST_UPDATED` في `src/lib/brand.ts`.
