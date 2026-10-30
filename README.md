# LEVEL7andMTM

نظام CAD للباترونات بديل لـ Grafis، يرتبط بنظام التعشيق وMTM الخاص بنا.

## المرحلة الحالية: قراءة ملفات Grafis

الحزمة `grafis_mdl` تقرأ ملفات موديل Grafis (`.mdl`) وتستخرج:

- قائمة القطع (#TLIST) وجداول الثوابت (#TFLIST) وجدول المقاسات (#GRDTAB)
- قياسات الزبون **X**، مع القيمة الافتراضية وقيمة كل مقاس
- المعادلات **Z**، مع الوصف العربي وسجل التعديلات، ويُحسب كل منها
- خطوات الماكرو (LINE 10 وCURVE 10...) بكل باراميتراتها
- سجلات بروتوكول البناء الأصلي
- هندسة القطعة بعد الحساب (نقاط وخطوط ومنحنيات بالمليمتر)، وتُصدّر إلى SVG وDXF

```bash
python3 -m grafis_mdl info samples/ALAA2026.mdl
```

```bash
python3 -m grafis_mdl extract samples/ALAA2026.mdl --part 2 --out out
```

تقرير الثوب الأساسي: [docs/basic-thobe.md](docs/basic-thobe.md)

## الاختبارات

```bash
python3 -m unittest discover -s tests -v
```

ملفات الموديل ما تنحفظ في git (`samples/*.mdl`). اختبارات الموديل تحتاج الملف في `samples/ALAA2026.mdl`، أو مسار في متغير البيئة `GRAFIS_SAMPLE`.

ما يحتاج النظام أي مكتبات خارجية، يكفي Python 3.10 أو أحدث.
