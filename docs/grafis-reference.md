# مراجع جرافس المستخدمة في المشروع

هذا الملف فهرس للمراجع اللي رفعها صاحب المشروع، وفيه ملخص بكلامنا لكل مرجع.
**النسخ الأصلية ما انحفظت في هذا المستودع**، لأن المستودع عام والمراجع منشورة بحقوق محفوظة لجرافس. احفظ الأصلية عندك خارج المستودع.

## الملفات المستلمة

| المرجع | المحتوى | الفائدة للمشروع |
|---|---|---|
| Grafis.pdf (كتاب جرافس المرجعي، إصدار 2017، 397 صفحة) | شرح كل أدوات جرافس من ناحية الاستخدام: القوائم، والزوايا، والقطع، والتدريج، والتعشيق | مرجع لسلوك كل أداة. ما فيه المعادلات الرياضية الداخلية |
| GraPrg_GK_AL_*.pdf (Sleeve 30 / 90 / 100) | توثيق الأكمام الجاهزة في جرافس: قياسات العرض والطول، ومعادلات البناء | بناء أكمام أساسية بنفس منطق جرافس |
| GraPrg_GK_HO_*.pdf (Trouser 10 / 30 / 40 / 70) | توثيق البناطيل الجاهزة | نفس الشي للبناطيل |
| GraPrg_GK_HO_c501_04.cpr | ملف برنامج بناء من جرافس، بصيغة ثنائية | ما انفك للحين |
| Masquell2.pdf + ملفات masquell*.chm | جداول أنظمة القياس | ربط قياسات الزبون في MTM |

أنظمة القياس اللي وصلت: Optimass (Basis_D)، Hohenstein نسائي (Damen_5) وأطفال (Kindr_2)، Müller & Sohn رجالي (ML&SO_H) ونسائي (ML&SO_D)، HAKA رجالي (Herrn_2)، Optikon رجالي (Herrn_6)، Unicut نسائي (Damen_U) ورجالي (Herrn_U)، Gabriel نسائي (Gabri_1).

## ملف ALAA2026.mdl

- **نظام القياس:** `basis_d` (50-Werte-OPTIMASS).
- **المقاس الأساسي:** `__HN40_0`. معناه في Optimass: نوع الجسم **HN** (رجالي عادي، مقاسات 40 إلى 78)، مقاس **40**.
- **قياسات الثوب:** قيم X في الملف (الطول 1320، الصدر 495، الكتف 370، وغيرها) هي قياسات الموديل نفسه، مو قيم جدول Optimass. يعني جدول Optimass ما يحدد شكل الثوب مباشرة، لكنه يشرح طريقة تسمية المقاسات.

### طريقة تسمية المقاس في جرافس

`__HN40_0` = بادئة `__` + رمز نوع الجسم (`HN`) + المقاس (`40`) + `_0`.

رموز أنواع الجسم في Optimass Basis_D:

| الرمز | النوع |
|---|---|
| `_N` / `_S` / `_L` | نسائي: عادي، قصير، طويل |
| `SS` / `NS` / `LS` | نسائي، ورك ضيق: قصير، عادي، طويل |
| `SB` / `NB` / `LB` | نسائي، ورك عريض: قصير، عادي، طويل |
| `HN` / `HS` / `HL` | رجالي: عادي، قصير، طويل |
| `KO` | أطفال |

### أرقام قياسات الجسم (G) في Optimass

قياسات الجسم في جرافس اسمها G مع رقم. هذي أسماؤها في نظام Optimass، نقلتها من الجدول عشان نستخدمها في ربط MTM:

| الرمز | القياس |
|---|---|
| G01 | Bust (u Br) |
| G02 | Hip (u Ge) |
| G03 | Height (lKö) |
| G04 | Waist (uTa) |
| G05 | Nape to Waist Centre Back (lTa) |
| G06 | Neck to Waist over Bust (lVo) |
| G07 | Across Back (bRü) |
| G08 | Body Rise (lSi) |
| G09 | Waist to Knee (lKn) |
| G10 | Waist to Hip (lGe) |
| G11 | Shoulder Length (lSu) |
| G12 | Acromion to Elbow (lOa) |
| G13 | Arm Length (lAr) |
| G14 | Upper Arm Girth (uOa) |
| G15 | Wrist (uHg) |
| G16 | Base of Neck (uHa) |
| G17 | Neck to Bust (lBr) |
| G18 | Nape to Waist over Bust (HBT) |
| G19 | Waist to Floor (lSe) |
| G20 | Inside Leg (lSr) |
| G21 | Heel-Instep Girth (uFr) |
| G22 | High Hip 8cm below Waist (uUt) |
| G23 | Below Knee (uUk) |
| G24 | Bust Suppression Angle (wBA) |
| G25 | Shoulder Angle (wSu) |
| G26 | Seat Angle (wGe) |
| G27 | Head Girth (uKp) |
| G28 | Under Bust (uUb) |
| G29 | Acromion Width (bAk) |
| G30 | Nape to Bust (HB) |
| G31 | Cup Depth (lCu) |
| G32 | Thigh Girth (uOs) |
| G33 | Across Bust (bVo) |
| G34 | Scye Width (bAr) |
| G35 | Abdomen-Seat Diameter(dSp) |
| G36 | Crotch Length (lSp) |
| G37 | Calf Girth (uWa) |
| G38 | Ankle Girth (uFe) |
| G39 | Knee Girth (uKn) |
| G40 | Scye Depth (lAc) |
| G41 | Front Waist Width Men (bLe) |
| G42 | Upper Across Bust (bVo o) |
| G43 | Distance Bust p. <=> bVo o (Abst) |

## اللي يحتاج مراجع إضافية

- **المعادلات الداخلية لأداة تدوير الزوايا (Corner 40 / 50):** الكتاب يشرح الاستخدام بس، ويذكر أن أداة Corner 50 تنسّق الزاويتين، والزاوية الأولى هي اللي تقرر.
- **البارت 65:** انصلح بملف التجربة `10-20-30-40` (زوايا قائمة بمسافات قص 10 و20 و30 و40 مم). التفاصيل في `level7-cad/REPORT-0.9.112.md`، الإصلاح رقم 7.
