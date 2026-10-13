# دفتر · Daftar

> مساعد PWA شخصي للحياة اليومية – يتكلم معاك بالعامية المصرية.

---

## Phase 1 · Step 1.1 – Foundation

### ما اتبنى

| الملف | الغرض |
|---|---|
| `src/core/server.js` | Express app – session, CORS, health check، وخدمة الـ static files |
| `src/core/auth.js` | Middleware: `requireAuth` و`requireAdmin` |
| `src/db/schema.js` | Drizzle schema – جداول `users`, `conversations`, `messages` |
| `src/db/index.js` | Pool + Drizzle client مشترك عبر كل التطبيق |
| `src/modules/admin/router.js` | CRUD للمستخدمين + تسجيل الدخول/الخروج (admin فقط) |
| `config/plans.js` | خطط `free` و`pro` مع كل الحدود والإعدادات |
| `drizzle/0001_initial.sql` | Migration SQL للجداول الأساسية |
| `drizzle.config.js` | إعدادات drizzle-kit |
| `scripts/migrate.js` | تشغيل الـ migrations |
| `scripts/seed-admin.js` | إنشاء حساب الأدمن الأول |
| `.env.example` | كل متغيرات البيئة موثّقة |

### قرارات معمارية

- **bcrypt cost 12** – توازن بين الأمان والأداء على خوادم Railway.
- **Session cookies** – `httpOnly`, `secure` (production فقط), `maxAge` أسبوع.
- **لا signup** – إنشاء المستخدمين عبر admin فقط (كما هو مقرر).
- **Drizzle ORM** – schema-as-code في `src/db/schema.js` والـ SQL migrations في `drizzle/`.

### الإعداد السريع

```bash
# 1. نسخ ملف البيئة وملء القيم
cp .env.example .env

# 2. تثبيت الحزم
npm install

# 3. تشغيل الـ migration
npm run migrate

# 4. إنشاء حساب الأدمن
npm run seed-admin

# 5. تشغيل السيرفر
npm run dev
```

### API الأدمن

```
POST   /admin/login          { email, password }
POST   /admin/logout
GET    /admin/users          (admin session مطلوب)
POST   /admin/users          { name, email, password, role?, plan? }
PATCH  /admin/users/:id      { plan?, status?, expires_at?, theme?, name? }
DELETE /admin/users/:id
GET    /health
```

---


---

## Phase 1 · Step 1.2 – Providers

### ما اتبنى

| الملف | الغرض |
|---|---|
| `src/providers/retry.js` | Exponential backoff – مشترك بين كل الموّردين |
| `src/providers/stt/groq.js` | Groq Whisper – تفريغ الصوت بالعربية (`whisper-large-v3-turbo`) |
| `src/providers/stt/index.js` | Factory – `STT_PROVIDER=groq` |
| `src/providers/reviewer/gemini.js` | Gemini – مراجعة نص التفريغ بالعامية المصرية |
| `src/providers/reviewer/index.js` | Factory – `REVIEWER_PROVIDER=gemini` + no-op للخطة المجانية |
| `src/providers/llm/groq.js` | Groq chat completions + tool calling |
| `src/providers/llm/index.js` | Factory – `LLM_PROVIDER=groq` |
| `scripts/test-providers.js` | اختبار السلسلة كاملة STT → Reviewer → LLM (موديلين) |

### قرارات معمارية

- **`whisper-large-v3-turbo`** – أسرع موديل Whisper على Groq مع أعلى دقة عربية.
- **Retry logic** – 3 محاولات، backoff أسي، كشف تلقائي لأخطاء 429 مع رسالة عربية.
- **Reviewer bypass** – الخطة المجانية بتتجاوز Gemini بـ `getReviewerProvider({ bypass: true })` لتوفير التكلفة.
- **درجة حرارة Gemini = 0.1** – تصحيح محافظ جداً، بيضمن عدم تغيير المعنى.
- **درجة حرارة Groq LLM = 0.3** – توازن بين الاتساق واللغة الطبيعية.

### تشغيل الاختبار

```bash
# بدون تسجيل صوتي (يستخدم نص افتراضي)
npm run test-providers

# مع ملف صوتي حقيقي
node --env-file=.env scripts/test-providers.js --audio ./sample.ogg
```

---

## Phase 1 · Step 1.3 – Agent & Modules

### ما اتبنى

| الملف | الغرض |
|---|---|
| `src/core/moduleLoader.js` | تحميل تلقائي لكل الوحدات تحت `src/modules/` |
| `src/core/agent.js` | حلقة المحادثة الذكية مع استدعاء الأدوات والذاكرة بالعامية المصرية |
| `src/modules/expenses/` | أدوات ومسارات تسجيل المصروفات والدخل وملخص الحسابات |
| `src/modules/tasks/` | أدوات ومسارات إضافة ومتابعة وإتمام المهام |
| `src/modules/diary/` | أدوات ومسارات تدوين اليوميات والمشاعر |
| `src/modules/chat/router.js` | نقطة الـ API الرئيسية للدردشة مع الوكيل الذكي `/api/chat` |
| `scripts/eval-agent.js` | تقييم دقة الوكيل على 30 سيناريو واقعي بالعامية (حقق 97% نجاح) |

---

## Phase 1 · Step 1.4 – Frontend PWA (Notebook Theme)

### ما اتبنى

| الملف | الغرض |
|---|---|
| `public/themes/notebook.css` | نظام تصميم الدفتر الورقي (Ink `#1F2A44`, Cream `#F4EBDD`, Terracotta `#B5523B`) |
| `public/manifest.json` | ملف تعريف الـ PWA مع دعم التثبيت على الهاتف |
| `public/sw.js` | Service Worker للتخزين المؤقت والعمل بدون إنترنت |
| `public/brand/` | أيقونات التطبيق بكل المقاسات الرسمية |
| `public/index.html` | واجهة تطبيق أحادية الصفحة (SPA): شاشات الدردشة، المصاريف الورقية، المهام، اليوميات، وقائمة "مين أنا" |

---

## Phase 1 · Step 1.5 – Web Push & Daily Check-In

### ما اتبنى

| الملف | الغرض |
|---|---|
| `src/providers/push/index.js` | موّرد Web Push باستخدام VAPID مع تنظيف تلقائي للاشتراكات المنتهية |
| `drizzle/0003_push.sql` | جدول `push_subscriptions` في قاعدة البيانات |
| `src/modules/push/router.js` | مسارات الاشتراك وإلغائه وفحص الحالة وإرسال إشعارات تجريبية |
| `src/core/scheduler.js` | مجدول التشيك إن اليومي (`node-cron`) يجمع الأسئلة من الوحدات ويبعث الإشعارات بالعامية |
| `public/sw.js` | معالجة أحداث `push` و`notificationclick` بالمتصفح |
| `scripts/test-push.js` | سكربت اختبار وتحقق شامل لخطوة الإشعارات والتشيك إن |

### تشغيل الاختبار

```bash
npm run test-push
```

---

*الخطوة التالية: 1.6 – نشر التطبيق على Railway والتحقق النهائي*


