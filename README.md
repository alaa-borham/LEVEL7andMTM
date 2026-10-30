# LEVEL7andMTM

نظام CAD للباترونات بديل لجرافس، ويرتبط بنظام التعشيق ونظام MTM الخاصين بنا.

| المجلد | المحتوى |
|---|---|
| `app/` | **برنامج الرسم** (يفتح من المتصفح) |
| `desktop/` | نسخة ويندوز من نفس البرنامج |
| `grafis_mdl/` | أداة قراءة ملفات جرافس (`.mdl`): القياسات والمعادلات والرسم وخطوات البناء |
| `docs/` | التقارير والشرح |

## برنامج الرسم (`app/`)

يحتاج Node.js 20 أو أحدث.

```bash
cd app && npm install
```

```bash
npm run dev
```

بعدها افتح الرابط اللي يظهر (عادة http://localhost:5173).

- البناء للنشر: `npm run build`، والناتج في `app/dist`.
- الاختبارات: `npm test`.
- دليل الاستخدام: [docs/user-guide.md](docs/user-guide.md).

## نسخة ويندوز (`desktop/`)

نسخة ويندوز تنبني تلقائياً عند كل رفع للكود. تلقاها في صفحة **Actions** في GitHub، داخل نتيجة التشغيل باسم `LEVEL7-CAD-windows`، وفيها ملفان:

- `LEVEL7 CAD Setup.exe`: مثبّت البرنامج.
- ملف zip: نسخة تشتغل بدون تثبيت.

وللبناء يدوياً على جهاز ويندوز:

```bash
cd app && npm install
```

```bash
cd desktop && npm install && npm run dist:win
```

## قراءة ملفات جرافس (`grafis_mdl/`)

```bash
python3 -m grafis_mdl info samples/ALAA2026.mdl
```

```bash
python3 -m grafis_mdl extract samples/ALAA2026.mdl --part 2 --out out
```

- ملف `out/part002.json` الناتج يقدر برنامج الرسم يستورده بزر «استيراد من جرافس»، فتنتقل القياسات والمعادلات للبرنامج.
- تقرير الثوب الأساسي: [docs/basic-thobe.md](docs/basic-thobe.md)
- فك خطوات البناء: [docs/protocol.md](docs/protocol.md)

```bash
python3 -m unittest discover -s tests -v
```

ملفات الموديل ما تنحفظ في git (`samples/*.mdl`).
