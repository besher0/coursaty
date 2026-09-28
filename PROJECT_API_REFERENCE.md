# مرجع المشروع والـ API

هذا الملف معمول ليكون خريطة سريعة للمشروع: ماذا يفعل، كيف مقسم، وما هي جميع الـ endpoints الموجودة حاليا. الهدف أن يساعدك وقت التعديل حتى تعرف أين تذهب وما الذي يتأثر.

## نظرة عامة

المشروع Backend لمنصة كورسات جامعية مبنية بـ NestJS و Prisma. النظام يدير المستخدمين، الطلاب، الأساتذة، الكورسات، المحاضرات، الاشتراكات، الأكواد، الإعلانات، الإشعارات، وبيانات الجامعة الأكاديمية مثل السنوات والفصول والكليات والأقسام والمواد.

التشغيل الأساسي موجود في `src/main.ts`:

- السيرفر يعمل على `PORT` أو `4000`.
- Swagger موجود على `/api`.
- يوجد `ValidationPipe` عام مع:
  - `whitelist: true`
  - `transform: true`
- يوجد exception filter عام.
- يوجد middleware لإضافة correlation id.

الموديولات الأساسية معرفة في `src/app.module.ts`.

## التقنيات والبنية

- Framework: NestJS
- ORM: Prisma
- Database: حسب إعدادات Prisma
- Cache: Redis عن طريق `REDIS_URL` أو `redis://localhost:6379`
- Auth: JWT guards مع أدوار `ADMIN`, `TEACHER`, `STUDENT`
- Uploads/Video: يوجد تكامل مع Bunny/TUS لرفع الفيديوهات وتجديد روابط الرفع

## قواعد مهمة قبل التعديل

- حذف الأستاذ من لوحة الإدارة غالبا soft delete أو إخفاء، ولا يعني حذف كورساته تلقائيا. لذلك قد تبقى الكورسات ظاهرة إذا لم يتم فلترتها حسب visibility أو status في endpoint معين.
- صفحات الطالب للكورسات تعتمد على الفصل المفعل من الأدمن `Season.isHomeActive`. إذا اختار الأدمن فصل مفعل، كورسات هذا الفصل هي التي يجب أن تكون لها الأولوية في واجهات الطالب.
- سعر الكورس بعد الحسم يستقبل حاليا كقيمة نهائية، مثال:
  - السعر الأصلي `price = 400`
  - السعر بعد الحسم `discountedPrice = 300`
  - يخزن داخليا كنسبة حسم محسوبة داخل `courseDiscountPercentage`
- لا تحتاج migration لتعديل معنى الحسم لأن العمود الموجود مستخدم، والتعديل في طريقة الحساب فقط.
- بيانات اشتراك الطالب وطلبات الاشتراك يجب أن تحافظ على snapshot للسعر وقت الطلب ولا تعتمد دائما على السعر الحالي للكورس.

## المصادقة والصلاحيات

غالبية endpoints المحمية تستخدم:

- `Authorization: Bearer <token>`
- `@JwtAuthGuard`
- `@Roles(...)`

الأدوار المتكررة:

- `ADMIN`: إدارة عامة، قبول/رفض، إحصائيات، إنشاء بيانات أكاديمية.
- `TEACHER`: إدارة كورسات ومحاضرات الأستاذ، أرباحه، مواده المسموحة.
- `STUDENT`: اشتراكات، Dashboard الطالب، تقييم، إعجاب، مشاهدة.

إذا لم يذكر دور في الجدول، راجع الكنترولر لأن بعض endpoints عامة أو محمية بحارس بدون role واضح.

## Auth

Base path: `/auth`

| Method | Endpoint | Role | الوصف | أهم البيانات |
|---|---|---|---|---|
| POST | `/auth/register` | عام | تسجيل مستخدم جديد كبداية | بيانات التسجيل الأساسية |
| POST | `/auth/register-complete` | عام | إكمال التسجيل بعد خطوة أولى | بيانات المستخدم/الطالب أو الأستاذ حسب التدفق |
| POST | `/auth/login` | عام | تسجيل الدخول وإرجاع token | رقم/إيميل وكلمة مرور حسب النظام |

## Users

Base path: `/users`

| Method | Endpoint | Role | الوصف | أهم البيانات |
|---|---|---|---|---|
| PATCH | `/users/:id/fcm-token` | محمي | تحديث FCM token لمستخدم | `id`, token |
| GET | `/users/me` | محمي | بيانات المستخدم الحالي | من الـ token |
| PATCH | `/users/me` | محمي | تعديل بيانات الحساب الحالي | بيانات عامة |
| PATCH | `/users/me/user` | محمي | تعديل معلومات user الأساسية | الاسم/الهاتف... |
| PATCH | `/users/me/student` | STUDENT | تعديل بيانات الطالب | بيانات أكاديمية/شخصية |
| PATCH | `/users/me/change-password` | محمي | تغيير كلمة المرور | القديمة والجديدة |
| DELETE | `/users/me` | محمي | حذف/تعطيل حساب المستخدم الحالي | من الـ token |

## Students

Base path: `/students`

| Method | Endpoint | Role | الوصف | أهم البيانات |
|---|---|---|---|---|
| POST | `/students` | عام/إداري حسب التدفق | إنشاء طالب | بيانات الطالب وربطه بالمستخدم |

## Teachers

Base path: `/teachers`

| Method | Endpoint | Role | الوصف | أهم البيانات |
|---|---|---|---|---|
| POST | `/teachers` | عام/إداري حسب التدفق | إنشاء أستاذ | بيانات الأستاذ وربطه بالمستخدم |
| GET | `/teachers/me/summary` | TEACHER | ملخص حساب الأستاذ | من الـ token |
| GET | `/teachers/me/courses/active` | TEACHER | كورسات الأستاذ الفعالة | query للفلترة إن وجدت |
| GET | `/teachers/me/courses/expired` | TEACHER | كورسات الأستاذ المنتهية | query للفلترة إن وجدت |
| GET | `/teachers/me/affiliations` | TEACHER | ارتباطات الأستاذ الأكاديمية | من الـ token |
| GET | `/teachers/me/affiliations/:teacherId` | TEACHER/ADMIN | ارتباطات أستاذ محدد | `teacherId` |
| POST | `/teachers/me/affiliations` | TEACHER/ADMIN | إضافة ارتباطات أكاديمية للأستاذ | مواد/كليات/أقسام |
| POST | `/teachers/me/affiliations/remove` | TEACHER/ADMIN | إزالة ارتباطات أكاديمية | معرفات الارتباطات |
| GET | `/teachers/me/allowed-subjects` | TEACHER | المواد المسموحة للأستاذ الحالي | من الـ token |
| GET | `/teachers/me/revenue` | TEACHER | أرباح الأستاذ الحالي | query تاريخ/فترة |
| GET | `/teachers/me/withdrawals` | TEACHER | سحوبات الأستاذ الحالي | query للصفحات/الفترة |
| GET | `/teachers/:id/revenue` | ADMIN/TEACHER | أرباح أستاذ محدد | `id` |
| GET | `/teachers/:id/revenue-by-period` | ADMIN/TEACHER | أرباح حسب فترة | `id`, تاريخ بداية/نهاية |
| GET | `/teachers/:id/withdrawals` | ADMIN/TEACHER | سحوبات أستاذ محدد | `id` |
| POST | `/teachers/:id/withdrawals` | ADMIN | إضافة سحب لأستاذ | `id`, المبلغ والملاحظة |
| GET | `/teachers/:id/allowed-subjects` | ADMIN/TEACHER | مواد مسموحة لأستاذ | `id` |
| POST | `/teachers/:id/allowed-subjects` | ADMIN | إضافة مواد مسموحة | subject ids |
| POST | `/teachers/:id/allowed-subjects/remove` | ADMIN | إزالة مواد مسموحة | subject ids |

## Courses

Base path: `/courses`

| Method | Endpoint | Role | الوصف | أهم البيانات |
|---|---|---|---|---|
| POST | `/courses` | TEACHER/ADMIN | إنشاء كورس | السعر، `discountedPrice`، المادة/الفصل، الأستاذ |
| GET | `/courses/categories` | محمي/عام حسب الكنترولر | قائمة تصنيفات الكورسات | لا شيء أو query |
| POST | `/courses/categories` | ADMIN | إنشاء تصنيف كورسات | الاسم |
| PATCH | `/courses/categories/:id` | ADMIN | تعديل تصنيف | `id`, الاسم |
| DELETE | `/courses/categories/:id` | ADMIN | حذف تصنيف | `id` |
| GET | `/courses/:id` | محمي/عام حسب الكنترولر | جلب كورس مختصر | `id` |
| GET | `/courses/:id/details` | محمي | تفاصيل كورس للطالب/المستخدم | `id` |
| GET | `/courses/:id/admin-details` | ADMIN/TEACHER | تفاصيل كاملة للإدارة | `id` |
| GET | `/courses/:id/admin-details/info` | ADMIN/TEACHER | معلومات إدارية للكورس | `id` |
| GET | `/courses/:id/admin-details/lectures` | ADMIN/TEACHER | محاضرات الكورس للإدارة | `id` |
| GET | `/courses/:id/admin-details/codes` | ADMIN/TEACHER | أكواد الكورس | `id` |
| GET | `/courses/:id/admin-details/revenue` | ADMIN/TEACHER | أرباح الكورس | `id`, فترة اختيارية |
| GET | `/courses/:id/statistics` | ADMIN/TEACHER | إحصائيات الكورس | `id` |
| GET | `/courses` | محمي/عام حسب الكنترولر | قائمة الكورسات | filters, pagination |
| PATCH | `/courses/:id` | TEACHER/ADMIN | تعديل كورس | السعر، الحسم، الحالة، البيانات |
| PATCH | `/courses/:id/approve` | ADMIN | قبول كورس | `id` |
| PATCH | `/courses/:id/reject` | ADMIN | رفض كورس | `id`, سبب |
| DELETE | `/courses/:id` | TEACHER/ADMIN | حذف/تعطيل كورس | `id` |
| POST | `/courses/:courseId/lectures/:lectureId/videos` | TEACHER/ADMIN | إضافة فيديو لمحاضرة داخل كورس | ملفات/بيانات فيديو |
| POST | `/courses/:courseId/lectures/:lectureId/videos/tus/init` | TEACHER/ADMIN | بدء رفع TUS لفيديو | metadata |
| POST | `/courses/:courseId/lectures/:lectureId/videos/tus/complete` | TEACHER/ADMIN | إنهاء رفع TUS | video id/upload id |
| POST | `/courses/:courseId/lectures/:lectureId/videos/tus/refresh` | TEACHER/ADMIN | تجديد رابط رفع TUS | upload id |

ملاحظة مهمة: اسم `courseDiscountPercentage` تاريخيا يدل على نسبة، لكن الإدخال من الواجهة يمكن أن يكون السعر النهائي بعد الحسم. الأفضل في الواجهات الجديدة استخدام `discountedPrice` لتجنب الالتباس.

## Lectures

Base path: `/lectures`

| Method | Endpoint | Role | الوصف | أهم البيانات |
|---|---|---|---|---|
| POST | `/lectures` | TEACHER/ADMIN | إنشاء محاضرة | courseId, title, order |
| GET | `/lectures/course/:courseId` | محمي | محاضرات كورس | `courseId` |
| GET | `/lectures/:lectureId/details` | محمي | تفاصيل محاضرة | `lectureId` |
| PATCH | `/lectures/:lectureId` | TEACHER/ADMIN | تعديل محاضرة | `lectureId`, بيانات التعديل |
| DELETE | `/lectures/:lectureId` | TEACHER/ADMIN | حذف محاضرة | `lectureId` |
| POST | `/lectures/:lectureId/files` | TEACHER/ADMIN | إضافة ملف لمحاضرة | ملف وmetadata |
| POST | `/lectures/files` | TEACHER/ADMIN | إضافة ملف عام وربطه | lectureId داخل body |
| DELETE | `/lectures/files/:id` | TEACHER/ADMIN | حذف ملف محاضرة | `id` |
| PATCH | `/lectures/files/:id` | TEACHER/ADMIN | تعديل ملف محاضرة | `id`, بيانات |
| POST | `/lectures/videos` | TEACHER/ADMIN | إضافة فيديو | بيانات الفيديو |
| POST | `/lectures/:lectureId/videos/upload` | TEACHER/ADMIN | رفع فيديو لمحاضرة | ملف الفيديو |
| POST | `/lectures/:lectureId/videos/tus/init` | TEACHER/ADMIN | بدء رفع TUS | metadata |
| POST | `/lectures/:lectureId/videos/tus/complete` | TEACHER/ADMIN | إنهاء رفع TUS | upload/video id |
| POST | `/lectures/:lectureId/videos/tus/refresh` | TEACHER/ADMIN | تجديد رفع TUS | upload id |
| PATCH | `/lectures/videos/:id` | TEACHER/ADMIN | تعديل فيديو | `id`, بيانات |
| DELETE | `/lectures/videos/:id` | TEACHER/ADMIN | حذف فيديو | `id` |
| POST | `/lectures/videos/:videoId/segments` | TEACHER/ADMIN | إضافة segment لفيديو | وقت البداية/النهاية |
| GET | `/lectures/videos/:videoId/segments` | محمي | جلب segments الفيديو | `videoId` |
| PATCH | `/lectures/videos/:videoId/segments/:segmentId` | TEACHER/ADMIN | تعديل segment | `videoId`, `segmentId` |
| DELETE | `/lectures/videos/:videoId/segments/:segmentId` | TEACHER/ADMIN | حذف segment | `videoId`, `segmentId` |
| POST | `/lectures/:lectureId/questions` | TEACHER/ADMIN | إضافة سؤال لمحاضرة | question/options |
| GET | `/lectures/:lectureId/questions` | محمي | أسئلة محاضرة | `lectureId` |
| PATCH | `/lectures/questions/:id` | TEACHER/ADMIN | تعديل سؤال | `id` |
| DELETE | `/lectures/questions/:id` | TEACHER/ADMIN | حذف سؤال | `id` |

## Academics

كل مجموعة من هذه المسارات تعمل كـ CRUD للبيانات الأكاديمية.

### Academic Years

Base path: `/academics/academic-years`

| Method | Endpoint | Role | الوصف | أهم البيانات |
|---|---|---|---|---|
| POST | `/academics/academic-years` | ADMIN | إنشاء سنة أكاديمية | name/order |
| GET | `/academics/academic-years` | محمي/عام حسب الكنترولر | عرض السنوات | filters اختيارية |
| PATCH | `/academics/academic-years/:id` | ADMIN | تعديل سنة | `id` |
| DELETE | `/academics/academic-years/:id` | ADMIN | حذف سنة | `id` |

### Years

Base path: `/academics/years`

| Method | Endpoint | Role | الوصف | أهم البيانات |
|---|---|---|---|---|
| POST | `/academics/years` | ADMIN | إنشاء سنة دراسية | college/department/order |
| GET | `/academics/years` | محمي/عام حسب الكنترولر | عرض السنوات الدراسية | filters |
| PATCH | `/academics/years/:id` | ADMIN | تعديل سنة دراسية | `id` |
| DELETE | `/academics/years/:id` | ADMIN | حذف سنة دراسية | `id` |

### Seasons

Base path: `/academics/seasons`

| Method | Endpoint | Role | الوصف | أهم البيانات |
|---|---|---|---|---|
| POST | `/academics/seasons` | ADMIN | إنشاء فصل | name/order |
| GET | `/academics/seasons` | محمي/عام حسب الكنترولر | عرض الفصول | filters |
| PATCH | `/academics/seasons/:id` | ADMIN | تعديل فصل | `id` |
| DELETE | `/academics/seasons/:id` | ADMIN | حذف فصل | `id` |
| PATCH | `/academics/seasons/:id/home-active` | ADMIN | جعل فصل هو الفعال للواجهة الرئيسية | `id` |
| PATCH | `/academics/seasons/home-active/clear` | ADMIN | إلغاء الفصل الفعال | لا شيء |

### Universities

Base path: `/academics/universities`

| Method | Endpoint | Role | الوصف | أهم البيانات |
|---|---|---|---|---|
| POST | `/academics/universities` | ADMIN | إنشاء جامعة | name, province |
| GET | `/academics/universities` | محمي/عام حسب الكنترولر | عرض الجامعات | filters |
| PATCH | `/academics/universities/:id` | ADMIN | تعديل جامعة | `id` |
| DELETE | `/academics/universities/:id` | ADMIN | حذف جامعة | `id` |

### Colleges

Base path: `/academics/colleges`

| Method | Endpoint | Role | الوصف | أهم البيانات |
|---|---|---|---|---|
| POST | `/academics/colleges` | ADMIN | إنشاء كلية | universityId, name |
| GET | `/academics/colleges` | محمي/عام حسب الكنترولر | عرض الكليات | universityId |
| PATCH | `/academics/colleges/:id` | ADMIN | تعديل كلية | `id` |
| DELETE | `/academics/colleges/:id` | ADMIN | حذف كلية | `id` |

### Departments

Base path: `/academics/departments`

| Method | Endpoint | Role | الوصف | أهم البيانات |
|---|---|---|---|---|
| POST | `/academics/departments` | ADMIN | إنشاء قسم | collegeId, name |
| GET | `/academics/departments` | محمي/عام حسب الكنترولر | عرض الأقسام | collegeId |
| PATCH | `/academics/departments/:id` | ADMIN | تعديل قسم | `id` |
| DELETE | `/academics/departments/:id` | ADMIN | حذف قسم | `id` |

### Subjects

Base path: `/academics/subjects`

| Method | Endpoint | Role | الوصف | أهم البيانات |
|---|---|---|---|---|
| POST | `/academics/subjects` | ADMIN | إنشاء مادة | yearId/departmentId, seasonId |
| GET | `/academics/subjects` | محمي/عام حسب الكنترولر | عرض المواد | filters |
| PATCH | `/academics/subjects/:id` | ADMIN | تعديل مادة | `id` |
| DELETE | `/academics/subjects/:id` | ADMIN | حذف مادة | `id` |

### Guest Preferences

Base path: `/academics/guest-preferences`

| Method | Endpoint | Role | الوصف | أهم البيانات |
|---|---|---|---|---|
| POST | `/academics/guest-preferences` | عام | حفظ تفضيلات زائر | deviceId, university/college/year |
| GET | `/academics/guest-preferences/:deviceId` | عام | جلب تفضيلات زائر | `deviceId` |
| DELETE | `/academics/guest-preferences/:deviceId` | عام | حذف تفضيلات زائر | `deviceId` |

## Student Dashboard

Base path: `/dashboard`

هذه endpoints مخصصة لواجهة الطالب والزائر. أهم شيء فيها أن كورسات الطالب يجب أن تراعي الفصل المفعل من الأدمن.

| Method | Endpoint | Role | الوصف | أهم البيانات |
|---|---|---|---|---|
| GET | `/dashboard/student-college-info` | STUDENT | معلومات كلية الطالب | من الـ token |
| GET | `/dashboard/search` | STUDENT/عام حسب الكنترولر | بحث عام في dashboard | keyword, filters |
| GET | `/dashboard/courses-by-subjects` | STUDENT/عام | كورسات مجمعة حسب المواد | filters |
| GET | `/dashboard/student/subjects` | STUDENT | مواد الطالب | من enrollment |
| GET | `/dashboard/student/programs` | STUDENT | برامج الطالب | من enrollment |
| GET | `/dashboard/subjects/:id/courses` | STUDENT/عام | كورسات مادة محددة | subject id |
| GET | `/dashboard/programs/courses` | STUDENT/عام | كورسات البرامج | program filters |
| GET | `/dashboard/courses/mixed` | STUDENT/عام | كورسات مختلطة للواجهة | filters |
| GET | `/dashboard/college-teachers` | STUDENT/عام | أساتذة كلية الطالب | college/year/department |
| GET | `/dashboard/liked-teachers` | STUDENT | الأساتذة المعجب بهم | من الـ token |
| GET | `/dashboard/teachers/:id` | STUDENT/عام | بروفايل أستاذ | `id` |
| GET | `/dashboard/courses-by-category` | STUDENT/عام | كورسات حسب التصنيف | categoryId |
| GET | `/dashboard/courses-by-popular` | STUDENT/عام | كورسات شائعة | filters |
| GET | `/dashboard/courses-by-year` | STUDENT/عام | كورسات حسب السنة | yearId |
| GET | `/dashboard/courses` | STUDENT/عام | قائمة كورسات dashboard | filters, pagination |
| GET | `/dashboard/programs` | STUDENT/عام | قائمة البرامج | filters |

## Financials - Subscriptions

Base path: `/financials/subscriptions`

| Method | Endpoint | Role | الوصف | أهم البيانات |
|---|---|---|---|---|
| POST | `/financials/subscriptions/subscribe` | STUDENT | اشتراك طالب بكورس | courseId أو code |
| GET | `/financials/subscriptions` | ADMIN/TEACHER | عرض الاشتراكات | filters, pagination |
| GET | `/financials/subscriptions/me/active-courses` | STUDENT | كورسات الطالب النشطة | من الـ token |
| GET | `/financials/subscriptions/me/inactive-courses` | STUDENT | كورسات الطالب غير النشطة | من الـ token |

## Financials - Subscription Requests

Base path: `/financials/subscription-requests`

| Method | Endpoint | Role | الوصف | أهم البيانات |
|---|---|---|---|---|
| POST | `/financials/subscription-requests` | STUDENT | إنشاء طلب اشتراك | courseId, payment info |
| POST | `/financials/subscription-requests/with-receipt` | STUDENT | إنشاء طلب مع إيصال | receipt file, courseId |
| GET | `/financials/subscription-requests/me` | STUDENT | طلبات الطالب | من الـ token |
| GET | `/financials/subscription-requests/me/:id` | STUDENT | طلب محدد للطالب | `id` |
| GET | `/financials/subscription-requests` | ADMIN/TEACHER | كل طلبات الاشتراك | status, filters |
| GET | `/financials/subscription-requests/:id` | ADMIN/TEACHER | تفاصيل طلب | `id` |
| PATCH | `/financials/subscription-requests/:id/approve` | ADMIN/TEACHER | قبول الطلب وإنشاء اشتراك | `id` |
| PATCH | `/financials/subscription-requests/:id/resubmit` | STUDENT | إعادة إرسال طلب مرفوض/ناقص | `id`, بيانات جديدة |
| PATCH | `/financials/subscription-requests/:id/reject` | ADMIN/TEACHER | رفض طلب | `id`, reason |

## Financials - Codes

Base path: `/financials/codes`

| Method | Endpoint | Role | الوصف | أهم البيانات |
|---|---|---|---|---|
| POST | `/financials/codes` | ADMIN/TEACHER | إنشاء كود | courseId, groupId, value |
| POST | `/financials/codes/bulk` | ADMIN/TEACHER | إنشاء عدة أكواد | count, courseId/groupId |
| GET | `/financials/codes` | ADMIN/TEACHER | عرض الأكواد | filters |
| PATCH | `/financials/codes/:id` | ADMIN/TEACHER | تعديل كود | `id` |
| DELETE | `/financials/codes/:id` | ADMIN/TEACHER | حذف كود | `id` |
| POST | `/financials/codes/:id/activate` | ADMIN/TEACHER | تفعيل كود | `id` |
| POST | `/financials/codes/:id/deactivate` | ADMIN/TEACHER | تعطيل كود | `id` |

## Financials - Code Groups

Base path: `/financials/code-groups`

| Method | Endpoint | Role | الوصف | أهم البيانات |
|---|---|---|---|---|
| POST | `/financials/code-groups` | ADMIN/TEACHER | إنشاء مجموعة أكواد | name, courseId |
| GET | `/financials/code-groups` | ADMIN/TEACHER | عرض مجموعات الأكواد | filters |
| PATCH | `/financials/code-groups/:id` | ADMIN/TEACHER | تعديل مجموعة | `id` |
| DELETE | `/financials/code-groups/:id` | ADMIN/TEACHER | حذف مجموعة | `id` |

## Admins

Base path: `/admins`

| Method | Endpoint | Role | الوصف | أهم البيانات |
|---|---|---|---|---|
| POST | `/admins` | ADMIN | إنشاء أدمن | بيانات المستخدم والصلاحية |
| GET | `/admins` | ADMIN | عرض الأدمنز | filters |
| GET | `/admins/me` | ADMIN | بيانات الأدمن الحالي | من الـ token |
| GET | `/admins/dashboard` | ADMIN | إحصائيات dashboard | filters |
| GET | `/admins/universities/:universityId/pending-courses` | ADMIN | كورسات معلقة بجامعة | `universityId` |
| GET | `/admins/universities/:universityId/pending-teachers` | ADMIN | أساتذة معلقون بجامعة | `universityId` |
| GET | `/admins/universities/:universityId/pending-notifications` | ADMIN | إشعارات معلقة بجامعة | `universityId` |
| GET | `/admins/dashboard/courses/subjects` | ADMIN | كورسات dashboard حسب المواد | filters |
| GET | `/admins/dashboard/courses/subject` | ADMIN | alias لمسار المواد | filters |
| GET | `/admins/dashboard/courses/programs` | ADMIN | كورسات dashboard حسب البرامج | filters |
| GET | `/admins/code-statistics` | ADMIN | إحصائيات الأكواد | filters |
| GET | `/admins/search/subjects` | ADMIN | بحث مواد | keyword, filters |
| GET | `/admins/search/programs` | ADMIN | بحث برامج | keyword, filters |
| GET | `/admins/search/students` | ADMIN | بحث طلاب | keyword, filters |
| GET | `/admins/search/courses` | ADMIN | بحث كورسات | keyword, filters |
| GET | `/admins/getSubjectsByCollageId` | ADMIN | مواد حسب كلية | collegeId |
| GET | `/admins/getSubjectsByDeptarmentId` | ADMIN | مواد حسب قسم | departmentId |
| GET | `/admins/getProgramsByCollageId` | ADMIN | برامج حسب كلية | collegeId |
| GET | `/admins/getTeachersByCollageID` | ADMIN | أساتذة حسب كلية | collegeId |
| GET | `/admins/getTeachersByDeptaramentId` | ADMIN | أساتذة حسب قسم | departmentId |
| GET | `/admins/getYearsOfCollage` | ADMIN | سنوات كلية | collegeId |
| GET | `/admins/subjects/:subjectId/teachers` | ADMIN | أساتذة مادة | `subjectId` |
| GET | `/admins/subjects/:subjectId/available-teachers` | ADMIN | أساتذة متاحون للمادة | `subjectId` |
| GET | `/admins/subjects/:subjectId/courses` | ADMIN | كورسات مادة | `subjectId` |
| POST | `/admins/subjects/:subjectId/teachers` | ADMIN | ربط أستاذ بمادة | `subjectId`, teacherId |
| DELETE | `/admins/subjects/:subjectId/teachers/:teacherId` | ADMIN | فك ربط أستاذ بمادة | ids |
| GET | `/admins/teachers/:teacherId/allowed-subjects` | ADMIN | مواد أستاذ مسموحة | `teacherId` |
| GET | `/admins/teachers/:teacherId/profile` | ADMIN | بروفايل أستاذ | `teacherId` |
| GET | `/admins/teachers/:teacherId/courses` | ADMIN | كورسات أستاذ | `teacherId` |
| GET | `/admins/teachers/:teacherId/revenue` | ADMIN | أرباح أستاذ | `teacherId`, period |
| GET | `/admins/universities/:universityId/teachers` | ADMIN | أساتذة جامعة | `universityId` |
| GET | `/admins/universities/:universityId/students` | ADMIN | طلاب جامعة | `universityId` |
| GET | `/admins/students/:studentId/profile` | ADMIN | بروفايل طالب | `studentId` |
| POST | `/admins/students/:studentId/reset-password` | ADMIN | إعادة تعيين كلمة مرور طالب | `studentId`, password |
| GET | `/admins/students/:studentId/courses` | ADMIN | كورسات طالب | `studentId` |
| GET | `/admins/departments/:departmentId/subjects` | ADMIN | مواد قسم | `departmentId` |
| GET | `/admins/departments/:departmentId/teachers` | ADMIN | أساتذة قسم | `departmentId` |
| GET | `/admins/programs/:programId/available-teachers` | ADMIN | أساتذة متاحون لبرنامج | `programId` |
| GET | `/admins/programs/:programId/courses` | ADMIN | كورسات برنامج | `programId` |
| GET | `/admins/colleges/:collegeId/programs` | ADMIN | برامج كلية | `collegeId` |
| GET | `/admins/revenue` | ADMIN | أرباح عامة | period/filter |
| GET | `/admins/users-directory` | ADMIN | دليل المستخدمين | search/filter |
| PATCH | `/admins/users/:userId/status` | ADMIN | تعديل حالة مستخدم | `userId`, status |
| DELETE | `/admins/users/:userId` | ADMIN | soft delete لمستخدم | `userId` |
| PATCH | `/admins/users/:userNumber/password` | ADMIN | تغيير كلمة مرور برقم مستخدم | `userNumber`, password |

ملاحظة: توجد أسماء legacy فيها أخطاء إملائية مثل `Collage` و `Deptarment`. لا تغيرها إلا إذا سيتم تحديث الواجهة التي تستخدمها.

## Admin Code Management

Base path: `/admins/codes`

| Method | Endpoint | Role | الوصف | أهم البيانات |
|---|---|---|---|---|
| POST | `/admins/codes/groups` | ADMIN | إنشاء مجموعة أكواد | name, courseId |
| POST | `/admins/codes/generate` | ADMIN | توليد كود واحد | courseId/groupId |
| POST | `/admins/codes/generate-bulk` | ADMIN | توليد أكواد متعددة | count, courseId/groupId |
| PATCH | `/admins/codes/:codeId` | ADMIN | تعديل كود | `codeId` |
| DELETE | `/admins/codes/:codeId` | ADMIN | حذف كود | `codeId` |
| GET | `/admins/codes/group/:groupId` | ADMIN | أكواد مجموعة | `groupId` |
| GET | `/admins/codes/group/:groupId/export` | ADMIN | تصدير أكواد مجموعة | `groupId` |
| PATCH | `/admins/codes/group/:groupId/deactivate-all` | ADMIN | تعطيل كل أكواد مجموعة | `groupId` |

## Interactions - Videos

Base path: `/interactions/videos`

| Method | Endpoint | Role | الوصف | أهم البيانات |
|---|---|---|---|---|
| POST | `/interactions/videos` | STUDENT/محمي | إنشاء تفاعل فيديو | videoId, type |
| PATCH | `/interactions/videos/:id` | STUDENT/محمي | تعديل تفاعل فيديو | `id` |
| DELETE | `/interactions/videos/:id` | STUDENT/محمي | حذف تفاعل فيديو | `id` |
| POST | `/interactions/videos/:id/view` | STUDENT/محمي | تسجيل مشاهدة فيديو | `id`, progress |
| GET | `/interactions/videos/:id/likes` | محمي | عدد/قائمة إعجابات فيديو | `id` |

## Interactions - Teachers

Base path: `/interactions/teachers`

| Method | Endpoint | Role | الوصف | أهم البيانات |
|---|---|---|---|---|
| POST | `/interactions/teachers/like` | STUDENT | إعجاب بأستاذ | teacherId |
| DELETE | `/interactions/teachers/like` | STUDENT | إزالة الإعجاب | teacherId |

## Interactions - Courses

Base path: `/interactions/courses`

| Method | Endpoint | Role | الوصف | أهم البيانات |
|---|---|---|---|---|
| GET | `/interactions/courses/:courseId/rate` | STUDENT/محمي | جلب تقييم الطالب للكورس | `courseId` |
| POST | `/interactions/courses/rate` | STUDENT | تقييم كورس | courseId, rate, comment |

## Notifications

Base path: `/notifications`

| Method | Endpoint | Role | الوصف | أهم البيانات |
|---|---|---|---|---|
| POST | `/notifications` | ADMIN/TEACHER | إنشاء إشعار | title, body, target |
| GET | `/notifications/my` | محمي | إشعارات المستخدم الحالي | من الـ token |
| GET | `/notifications/pending` | ADMIN | إشعارات بانتظار الموافقة | filters |
| PATCH | `/notifications/:id/approve` | ADMIN | قبول إشعار | `id` |
| PATCH | `/notifications/:id/reject` | ADMIN | رفض إشعار | `id`, reason |
| GET | `/notifications/:id` | محمي | تفاصيل إشعار | `id` |
| DELETE | `/notifications/:id` | ADMIN/TEACHER | حذف إشعار | `id` |
| GET | `/notifications` | ADMIN | عرض كل الإشعارات | filters |

## Uploads

Base path: `/uploads`

| Method | Endpoint | Role | الوصف | أهم البيانات |
|---|---|---|---|---|
| POST | `/uploads/files` | محمي | رفع ملف عام | multipart file |
| POST | `/uploads/subscription-receipts` | STUDENT | رفع إيصال اشتراك | receipt file |
| POST | `/uploads/videos` | TEACHER/ADMIN | رفع فيديو مباشر | video file |
| POST | `/uploads/videos/tus/init` | TEACHER/ADMIN | بدء رفع فيديو TUS | metadata |
| POST | `/uploads/videos/tus/complete` | TEACHER/ADMIN | إنهاء رفع TUS | upload id |
| POST | `/uploads/videos/tus/refresh` | TEACHER/ADMIN | تجديد رابط TUS | upload id |
| PATCH | `/uploads/videos/settings/resolutions` | ADMIN | تعديل إعدادات دقات الفيديو | resolutions |
| GET | `/uploads/videos/:videoId/resolutions` | محمي | جلب دقات فيديو | `videoId` |
| GET | `/uploads/bunny/verify` | ADMIN | فحص اتصال Bunny | لا شيء |

## Advertisements

Base path: `/advertisements`

| Method | Endpoint | Role | الوصف | أهم البيانات |
|---|---|---|---|---|
| POST | `/advertisements` | ADMIN | إنشاء إعلان | title, image, target |
| GET | `/advertisements` | عام/محمي | عرض الإعلانات | filters |
| GET | `/advertisements/college/:collegeId` | عام/محمي | إعلانات كلية | `collegeId` |
| GET | `/advertisements/:id` | عام/محمي | إعلان محدد | `id` |
| PATCH | `/advertisements/:id` | ADMIN | تعديل إعلان | `id` |
| DELETE | `/advertisements/:id` | ADMIN | حذف إعلان | `id` |

## Point Of Sales

Base path: `/point-of-sales`

| Method | Endpoint | Role | الوصف | أهم البيانات |
|---|---|---|---|---|
| POST | `/point-of-sales` | ADMIN | إنشاء نقطة بيع | name, location |
| GET | `/point-of-sales` | عام/محمي | عرض نقاط البيع | filters |
| GET | `/point-of-sales/university/:universityId` | عام/محمي | نقاط بيع جامعة | `universityId` |
| GET | `/point-of-sales/province/:provinceId` | عام/محمي | نقاط بيع محافظة | `provinceId` |
| GET | `/point-of-sales/university` | عام/محمي | نقاط بيع حسب query جامعة | universityId في query |
| GET | `/point-of-sales/:id` | عام/محمي | نقطة بيع محددة | `id` |
| PATCH | `/point-of-sales/:id` | ADMIN | تعديل نقطة بيع | `id` |
| DELETE | `/point-of-sales/:id` | ADMIN | حذف نقطة بيع | `id` |

## Customer Service

Base path: `/customer-service`

| Method | Endpoint | Role | الوصف | أهم البيانات |
|---|---|---|---|---|
| POST | `/customer-service` | ADMIN | إنشاء بيانات خدمة عملاء | phone/link/text |
| GET | `/customer-service` | عام | عرض بيانات خدمة العملاء | لا شيء |
| GET | `/customer-service/:id` | عام | عنصر خدمة عملاء | `id` |
| PATCH | `/customer-service/:id` | ADMIN | تعديل عنصر | `id` |
| DELETE | `/customer-service/:id` | ADMIN | حذف عنصر | `id` |

## App Description

Base path: `/app-description`

| Method | Endpoint | Role | الوصف | أهم البيانات |
|---|---|---|---|---|
| POST | `/app-description` | ADMIN | إنشاء وصف تطبيق | title/body/media |
| GET | `/app-description` | عام | عرض وصف التطبيق | لا شيء |
| GET | `/app-description/:id` | عام | وصف محدد | `id` |
| PATCH | `/app-description/:id` | ADMIN | تعديل وصف | `id` |
| DELETE | `/app-description/:id` | ADMIN | حذف وصف | `id` |

## Provinces

Base path: `/provinces`

| Method | Endpoint | Role | الوصف | أهم البيانات |
|---|---|---|---|---|
| POST | `/provinces` | ADMIN | إنشاء محافظة | name |
| GET | `/provinces` | عام | عرض المحافظات | لا شيء |
| GET | `/provinces/:id` | عام | محافظة محددة | `id` |
| PATCH | `/provinces/:id` | ADMIN | تعديل محافظة | `id` |
| DELETE | `/provinces/:id` | ADMIN | حذف محافظة | `id` |

## كيف تعرف مكان التعديل بسرعة

| إذا تريد تعديل | غالبا ابدأ من |
|---|---|
| تسجيل الدخول والتسجيل | `src/modules/auth` |
| بيانات المستخدم الحالي | `src/modules/users` |
| Dashboard الطالب | `src/modules/academics/controllers/dashboard.controller.ts` و `src/modules/academics/services/dashboard.service.ts` |
| الفصول والمواد والجامعات | `src/modules/academics` |
| إنشاء وتعديل الكورسات | `src/modules/courses` |
| المحاضرات والفيديوهات والملفات | `src/modules/lectures` |
| الاشتراكات وطلبات الدفع | `src/modules/financials` |
| الأكواد ومجموعاتها | `src/modules/financials` و `src/modules/admins` |
| لوحة الإدارة | `src/modules/admins` |
| الإشعارات | `src/modules/notifications` |
| الرفع وBunny/TUS | `src/modules/uploads` |
| التقييم والإعجابات والمشاهدات | `src/modules/interactions` |
| الإعلانات ونقاط البيع | `src/modules/advertisements` و `src/modules/point-of-sales` |

## Checklist قبل أي تعديل مهم

1. افتح الكنترولر لتعرف endpoint والـ DTO المستخدم.
2. افتح السيرفس لتعرف قواعد العمل الحقيقية.
3. راجع Prisma schema إذا التعديل يمس قاعدة البيانات.
4. إذا أضفت أو غيرت عمودا، عندها فقط غالبا تحتاج migration.
5. إذا غيرت معنى حقل موجود بدون تغيير schema، غالبا لا تحتاج migration لكن قد تحتاج تنظيف بيانات قديمة.
6. إذا غيرت endpoint مستخدم من التطبيق، حافظ على backward compatibility أو حدث الواجهة معه.
7. شغل الاختبارات أو على الأقل اختبر endpoint المتأثر يدويا.

## مرجع سريع لي وقت تطلب تعديل جديد

هذا القسم مهم حتى أرجع له بسرعة قبل أي تعديل. إذا طلبت مني تعديل، أفضل مسار هو:

1. أحدد الموديول المسؤول من الجدول أعلاه.
2. أقرأ الكنترولر لمعرفة endpoint والـ DTO.
3. أقرأ السيرفس لمعرفة القواعد الحقيقية والاستعلامات.
4. أراجع `prisma/schema.prisma` إذا التعديل يمس الداتا.
5. أعدل بأضيق نطاق ممكن.
6. أضيف أو أحدث test إذا التعديل حساس أو فيه منطق business.
7. أشغل test مناسب أو أشرح لك لماذا لم أشغله.

## أوامر المشروع

الأوامر معرفة في `package.json`.

| الأمر | الاستخدام |
|---|---|
| `npm run start:dev` | تشغيل السيرفر محليا مع watch |
| `npm run build` | بناء المشروع، وقبله يعمل `prisma generate` |
| `npm run start` | تشغيل نسخة `dist/main.js` بعد البناء |
| `npm run lint` | فحص ESLint لملفات `src` |
| `npm test` | تشغيل كل اختبارات Jest |
| `npm run prisma:generate` | توليد Prisma Client |
| `npm run prisma:migrate` | إنشاء/تطبيق migration في التطوير |
| `npm run prisma:migrate:deploy` | تطبيق migrations في الإنتاج |
| `npm run seed:provinces` | إدخال المحافظات |
| `npm run backfill:province-links` | سكربت backfill لروابط المحافظات |
| `npm run verify:enrollment-backfill` | التحقق من backfill الخاص بتسجيلات الطلاب |
| `npm run upload:video:auto` | سكربت رفع فيديو تلقائي |

أوامر مفيدة وقت التعديل:

```bash
npm test -- course.service.spec.ts
npm test -- dashboard.service.spec.ts
npm test -- financials.service.spec.ts
npm run build
npm run prisma:generate
```

## ملفات الإعداد المهمة

| الملف | أهميته |
|---|---|
| `.env` | إعدادات البيئة المحلية، لا تعدله عشوائيا ولا تشارك محتواه |
| `.env.example` | مثال على المتغيرات المطلوبة |
| `compose.yml` | تشغيل الخدمات المساعدة مثل قاعدة البيانات/Redis حسب الإعداد |
| `Dockerfile` | بناء صورة التطبيق |
| `jest.config.js` | إعداد الاختبارات |
| `tsconfig.json` | إعداد TypeScript |
| `nest-cli.json` | إعداد Nest CLI |
| `prisma/schema.prisma` | مصدر الحقيقة لموديلات قاعدة البيانات |

## متغيرات بيئة متوقعة

راجع `.env.example` دائما إذا تغيرت البيئة، لكن من الكود الحالي أهم المتغيرات:

| المتغير | الاستخدام |
|---|---|
| `DATABASE_URL` | اتصال PostgreSQL لـ Prisma |
| `PORT` | منفذ السيرفر، الافتراضي `4000` |
| `REDIS_URL` | اتصال Redis، الافتراضي `redis://localhost:6379` |
| `JWT_SECRET` | توقيع JWT |
| إعدادات Bunny | رفع الفيديوهات والملفات وتجديد روابط TUS |
| إعدادات Firebase | الإشعارات و FCM |

## خريطة المجلدات

| المسار | الوصف |
|---|---|
| `src/main.ts` | تشغيل Nest، Swagger، ValidationPipe |
| `src/app.module.ts` | تجميع كل الموديولات والإعدادات العامة |
| `src/prisma` | Prisma service/module |
| `src/modules/auth` | تسجيل، دخول، JWT، roles guard |
| `src/modules/users` | حساب المستخدم الحالي وتعديل بياناته |
| `src/modules/students` | إنشاء الطالب والتسجيلات الأكاديمية |
| `src/modules/teachers` | الأستاذ، ارتباطاته، مواده، أرباحه |
| `src/modules/academics` | الجامعات، الكليات، الأقسام، السنوات، الفصول، المواد، Dashboard الطالب |
| `src/modules/courses` | الكورسات، التصنيفات، القبول/الرفض، تفاصيل الكورس |
| `src/modules/lectures` | المحاضرات، الفيديوهات، الملفات، الأسئلة، segments |
| `src/modules/financials` | الاشتراكات، طلبات الاشتراك، الأكواد، مجموعات الأكواد |
| `src/modules/admins` | لوحة الإدارة، البحث، إدارة المستخدمين، إدارة الأكواد |
| `src/modules/interactions` | تقييم الكورسات، إعجاب الأساتذة، تفاعلات الفيديو |
| `src/modules/notifications` | الإشعارات وقبولها/رفضها |
| `src/modules/uploads` | رفع الملفات والفيديوهات وBunny/TUS |
| `src/modules/revenues` | حسابات الإيرادات والفواتير |
| `src/shared` | خدمات مشتركة مثل Bunny/Firebase/logger/filter |
| `src/common` | enums وأخطاء مشتركة |
| `src/domain` | domain objects لبعض المجالات مثل customer-service |
| `src/scripts` | سكربتات صيانة وbackfill |

## نمط Nest المتبع

غالبا كل موديول يتكون من:

- `controllers`: تعريف endpoints والصلاحيات واستقبال DTOs.
- `services`: منطق العمل، Prisma queries، الحسابات.
- `dtos`: validation وSwagger metadata.
- `*.spec.ts`: اختبارات الموديول أو السيرفس.
- `module.ts`: providers/controllers/imports.

إذا بدك تضيف endpoint جديد:

1. أضف DTO إذا فيه body/query واضح.
2. أضف method في controller مع guards/roles.
3. أضف method في service.
4. إذا يحتاج داتا جديدة، عدل Prisma schema واعمل migration.
5. أضف test للمنطق أو على الأقل للـ service.

## موديلات قاعدة البيانات الأساسية

هذه خلاصة `prisma/schema.prisma`. أي تعديل داتا لازم يراجع هذا القسم والـ schema نفسه.

### Users

| Model | الدور |
|---|---|
| `User` | حساب الدخول العام، يحتوي `phone`, `password`, `userableId`, `userableType`, `status`, `fcmToken`, `deletedAt` |
| `Student` | كيان الطالب، بياناته الأكاديمية لا تكون هنا بل في `StudentEnrollment` |
| `Teacher` | كيان الأستاذ، يحتوي `isVisibleToStudents`, `likesCount`, روابط اجتماعية |
| `Admin` | كيان الأدمن |

مهم:

- `User.userableType` يحدد هل الحساب طالب أو أستاذ أو أدمن.
- عند حذف/تعطيل مستخدم قد يستخدم `deletedAt` و `deletedPhone`.
- الأستاذ عند إخفائه عن الطلاب لا يعني حذف كورساته.

### Academic Structure

| Model | الدور |
|---|---|
| `Province` | المحافظة |
| `University` | جامعة مرتبطة بمحافظة |
| `College` | كلية مرتبطة بجامعة |
| `Department` | قسم داخل كلية |
| `AcademicYear` | السنة الأكاديمية العامة مثل سنة أولى/ثانية |
| `CollegeYear` | سنة دراسية داخل كلية وربما قسم |
| `Season` | فصل دراسي، وفيه `isHomeActive` |
| `Subject` | مادة أو برنامج، وفيها `isProgram` |
| `GuestPreference` | تفضيلات الزائر حسب الجهاز |

مهم:

- `Season.isHomeActive` هو المفتاح الذي يحدد الفصل الظاهر في واجهة الطالب.
- `Subject.isProgram = true` يعني أن السجل يستخدم كبرنامج وليس مادة تقليدية.
- لا تفترض أن `departmentId` موجود دائما، لأنه اختياري في عدة موديلات.

### Courses And Content

| Model | الدور |
|---|---|
| `Course` | الكورس الأساسي، السعر، الحسم، الحالة، المادة، الأستاذ، السنة، الفصل |
| `CourseCategory` | تصنيف كورسات |
| `Lecture` | محاضرة داخل كورس |
| `Video` | فيديو داخل محاضرة |
| `VideoSegment` | مقاطع داخل فيديو |
| `LectureFile` | ملفات محاضرة |
| `Question` | سؤال محاضرة |
| `QuestionOption` | خيارات السؤال |

مهم:

- `Course.status` يأخذ `PENDING`, `APPROVED`, `REJECTED`.
- `Course.price` هو السعر الأصلي.
- `Course.courseDiscountPercentage` مخزن كنسبة داخليا، حتى لو الواجهة ترسل السعر النهائي بعد الحسم.
- `Course.isFree` يعني الكورس مجاني.
- `Course.isCompleted` و `Lecture.isCompleted` تستخدم لحالة الاكتمال.
- `duration` بالكورس والفيديو رقم، وغالبا يمثل مدة بالثواني أو مجموع مدد حسب منطق السيرفس.

### Financials

| Model | الدور |
|---|---|
| `CodeGroup` | مجموعة أكواد لكورس |
| `Code` | كود اشتراك/خصم |
| `StudentSubscription` | اشتراك طالب بكورس |
| `SubscriptionRequest` | طلب اشتراك مع إيصال |
| `RevenueTransaction` | snapshot مالي لكل عملية |
| `TeacherWithdrawal` | سحب أرباح أستاذ |

مهم:

- `StudentSubscription` لديه unique على `[studentId, courseId]`، يعني الطالب لا يملك اشتراكين لنفس الكورس.
- `SubscriptionRequest` يخزن snapshot للسعر وقت إنشاء الطلب:
  - `basePrice`
  - `courseDiscountPercentage`
  - `courseDiscountAmount`
  - `finalAmount`
- قبول طلب الاشتراك يجب أن يستخدم snapshot الطلب وليس سعر الكورس الحالي.
- `RevenueTransaction` هو سجل مالي تاريخي، لا تغير قيمه القديمة بسبب تعديل سعر الكورس.
- `Code.status` يأخذ `ACTIVE`, `USED`, `INACTIVE`.

### Interactions

| Model | الدور |
|---|---|
| `CourseRating` | تقييم الطالب للكورس، unique على `[courseId, studentId]` |
| `TeacherLike` | إعجاب طالب بأستاذ، unique على `[teacherId, studentId]` |
| `VideoInteraction` | تفاعل المستخدم مع فيديو |

مهم:

- لا تعمل create مباشر لتقييم أو إعجاب بدون مراعاة الـ unique.
- عند إعجاب الأستاذ يجب تحديث `Teacher.likesCount` بشكل متزامن أو ضمن transaction إذا هذا هو نمط السيرفس.

### Content And Support

| Model | الدور |
|---|---|
| `Advertisement` | إعلان، قد يستهدف جامعة/كلية/قسم |
| `Notification` | إشعار، فيه status وموافقة أدمن |
| `PointOfSale` | نقطة بيع مرتبطة بمحافظة |
| `CustomerService` | معلومات خدمة العملاء |
| `AppDescription` | وصف التطبيق |

## Enums مهمة

| Enum | القيم |
|---|---|
| `UserType` | `STUDENT`, `TEACHER`, `ADMIN` |
| `CodeStatus` | `ACTIVE`, `USED`, `INACTIVE` |
| `Gender` | `MALE`, `FEMALE` |
| `NotificationStatus` | `PENDING`, `APPROVED`, `REJECTED` |
| `WithdrawalStatus` | `PENDING`, `APPROVED`, `REJECTED` |
| `SubscriptionRequestStatus` | `PENDING`, `APPROVED`, `REJECTED` |
| `CourseStatus` | `PENDING`, `APPROVED`, `REJECTED` |
| `RevenueTransactionType` | `INITIAL`, `RENEWAL`, `BACKFILL` |

## علاقات حساسة لا تكسرها

| العلاقة | لماذا مهمة |
|---|---|
| `User.userableId + userableType` | تربط حساب الدخول بStudent/Teacher/Admin |
| `Student -> StudentEnrollment` | مصدر الحقيقة للجامعة/الكلية/السنة للطالب |
| `Course -> Subject/Season/CollegeYear` | تحدد ظهور الكورس في Dashboard |
| `Course -> Teacher` | تستخدم في صلاحيات الأستاذ والأرباح |
| `StudentSubscription -> Course/Student` | تحدد وصول الطالب للكورس |
| `SubscriptionRequest -> Course/Student` | طلب شراء قبل إنشاء الاشتراك |
| `RevenueTransaction` | سجل مالي تاريخي، يجب عدم إعادة حسابه عشوائيا |
| `TeacherSubjectPermission` | تحدد المواد المسموحة للأستاذ |
| `TeacherAffiliation` | تحدد ارتباط الأستاذ بجامعة/كلية/قسم |

## قواعد Migration

اعمل migration إذا:

- أضفت model جديد.
- أضفت/حذفت/عدلت عمود في `schema.prisma`.
- غيرت relation أو index أو unique constraint.
- غيرت enum في Prisma.

لا تحتاج migration غالبا إذا:

- غيرت طريقة حساب قيمة قبل تخزينها في عمود موجود.
- غيرت validation في DTO فقط.
- غيرت فلترة endpoint أو ترتيب النتائج.
- غيرت response shape بدون تغيير الداتا.
- أضفت test أو توثيق.

قد تحتاج backfill إذا:

- أضفت عمود جديد يحتاج قيمة مبنية من بيانات قديمة.
- غيرت معنى حقل موجود وتريد تصحيح البيانات القديمة.
- أضفت unique جزئي أو constraint والبيانات القديمة فيها تكرار.

## قواعد الأسعار والحسم

حقول الكورس:

- `price`: السعر الأصلي.
- `discountedPrice`: قيمة تدخل من الواجهة وتمثل السعر النهائي بعد الحسم.
- `courseDiscountPercentage`: الاسم legacy، لكنه في قاعدة البيانات يخزن نسبة الحسم.

مثال:

```text
price = 400
discountedPrice = 300
stored courseDiscountPercentage = 25
```

قواعد يجب الحفاظ عليها:

- السعر بعد الحسم لا يجب أن يكون أكبر من السعر الأصلي.
- إذا السعر الأصلي صفر أو الكورس مجاني، انتبه من القسمة على صفر.
- في response يفضل إرجاع السعر النهائي بشكل واضح إذا احتاجته الواجهة.
- لا تغير اسم العمود في قاعدة البيانات إلا إذا قررنا migration شامل وتحديث الواجهة.

## قواعد الفصل الفعال

الفصل الفعال للواجهة الرئيسية يحدد من:

```text
Season.isHomeActive = true
```

قواعد يجب الحفاظ عليها:

- عند تفعيل فصل، يجب ألا يبقى أكثر من فصل فعال للواجهة إذا منطق السيرفس مبني على فصل واحد.
- Dashboard الطالب يجب أن يعطي أولوية لكورسات الفصل الفعال.
- إذا لا يوجد فصل فعال، حدد السلوك بوضوح في السيرفس: إما fallback أو empty حسب endpoint.
- لا تغير endpoints الفصول بدون مراجعة `dashboard.service.ts`.

## قواعد الطالب والـ enrollment

مصدر الحقيقة الأكاديمي للطالب هو `StudentEnrollment` وليس `Student`.

مهم:

- الطالب يمكن أن يملك enrollments قديمة، لكن الفعال هو `isActive = true`.
- رقم الطالب الجامعي unique جزئيا على التسجيلات الفعالة فقط حسب migration.
- أي endpoint يحتاج جامعة/كلية/سنة الطالب يجب أن يقرأ active enrollment.
- لا ترجع لاستخدام حقول أكاديمية legacy على `Student` لأنها أزيلت.

## قواعد الأستاذ والحذف

الأستاذ يحتوي:

```text
Teacher.isVisibleToStudents
```

مهم:

- إخفاء الأستاذ لا يحذف كورساته.
- إذا كان المطلوب إخفاء كورسات الأستاذ المحذوف من الطلاب، يجب تعديل فلترة dashboard/course list.
- في لوحة الإدارة قد نحتاج رؤية الكورسات حتى لو الأستاذ مخفي.
- لا تطبق نفس فلتر الطلاب على admin endpoints إلا إذا المطلوب صريح.

## قواعد الاشتراكات وطلبات الاشتراك

عند إنشاء طلب اشتراك:

- خزن السعر الحالي كـ snapshot.
- خزن الحسم والمبلغ النهائي في `SubscriptionRequest`.
- لا تعتمد عند الموافقة على السعر الحالي للكورس إذا تغير بعد الطلب.

عند قبول طلب:

- أنشئ أو حدث `StudentSubscription`.
- سجل `RevenueTransaction` إذا كان هذا هو نمط السيرفس الحالي.
- انتبه من duplicate subscription بسبب unique `[studentId, courseId]`.

عند استخدام كود:

- تحقق من status.
- تحقق من `validUntil`, `validForDays`, `usageLimit`, `usageCount`.
- تحقق من `allowedUniversityNumber` إن وجد.
- حدث `usageCount`, `usedByStudentId`, `usedAt`, `status` حسب القاعدة الحالية.

## قواعد رفع الفيديو والملفات

يوجد مسارين رئيسيين:

- رفع عادي من `/uploads/videos` أو lecture upload endpoints.
- رفع TUS عبر init/complete/refresh.

مهم:

- لا تعتبر init يعني أن الفيديو جاهز.
- complete هو المكان الذي يثبت نجاح الرفع غالبا.
- refresh يجب أن يحافظ على نفس الرفع أو video id حسب DTO.
- إعدادات الدقات موجودة في uploads/Bunny.
- إذا عدلت Bunny logic راجع:
  - `src/shared/bunny`
  - `src/modules/uploads`
  - `src/modules/lectures`
  - `src/modules/courses` إذا فيه endpoints فيديو للكورس.

## قواعد الصلاحيات

قبل إضافة endpoint:

- هل endpoint عام؟
- هل يحتاج token فقط؟
- هل يحتاج role محدد؟
- هل الأستاذ يحق له الوصول لكل البيانات أم بياناته فقط؟
- هل الطالب يحق له الوصول إذا مشترك فقط؟

أكثر أخطاء متوقعة:

- endpoint للطالب يرجع بيانات كورس غير مشترك وغير مجاني.
- endpoint للأستاذ يسمح له بتعديل كورس أستاذ آخر.
- endpoint للأدمن يستخدم فلتر واجهة الطالب ويخفي بيانات لازمة للإدارة.

## Pagination والفلترة

بعض endpoints تستخدم pagination وبعضها لا. لا تضف أو تحذف pagination بدون طلب واضح لأن الواجهة قد تعتمد على response shape.

عند تعديل قائمة:

- راجع أسماء query params في DTO أو controller.
- حافظ على أسماء الحقول الموجودة في response.
- إذا أضفت field جديد، اجعله additive قدر الإمكان.
- إذا endpoint مستخدم من mobile app، تجنب breaking changes.

## Response Shape

لا يوجد response wrapper موحد واضح لكل المشروع. لذلك قبل تعديل أي response:

1. افتح السيرفس وشاهد الشكل الحالي.
2. افتح الاختبارات إن وجدت.
3. لا تغير أسماء الحقول الموجودة إلا بطلب واضح.
4. أضف حقول جديدة بدل استبدال القديمة إذا كان ممكنا.

## أخطاء وأسماء Legacy يجب الانتباه لها

يوجد endpoints بأسماء فيها أخطاء إملائية لكنها قد تكون مستخدمة من الواجهة:

- `getSubjectsByCollageId`
- `getSubjectsByDeptarmentId`
- `getProgramsByCollageId`
- `getTeachersByCollageID`
- `getTeachersByDeptaramentId`
- `getYearsOfCollage`

لا تصحح هذه الأسماء من غير إنشاء alias أو تحديث الواجهة.

كذلك `courseDiscountPercentage` اسم legacy. لا تغيره مباشرة بدون خطة.

## أماكن الاختبارات الحالية

اختبارات موجودة في نفس مجلدات الموديولات غالبا:

| المجال | ملفات اختبار مهمة |
|---|---|
| Auth | `src/modules/auth/services/auth.service.spec.ts` |
| JWT/Optional Auth | `src/modules/auth/guards/*.spec.ts`, `src/modules/auth/strategies/*.spec.ts` |
| Dashboard | `src/modules/academics/services/dashboard.service.spec.ts` |
| Courses | `src/modules/courses/services/course.service.spec.ts`, `src/modules/courses/controllers/course.controller.spec.ts` |
| Lectures | `src/modules/lectures/services/lectures.service.spec.ts` |
| Financials | `src/modules/financials/services/financials.service.spec.ts` |
| Admins | `src/modules/admins/services/admins.service.spec.ts`, `src/modules/admins/controllers/admins.controller.spec.ts` |
| Notifications | `src/modules/notifications/services/notifications.service.spec.ts` |
| Uploads | `src/modules/uploads/uploads.service.spec.ts` |
| Users | `src/modules/users/services/users.service.spec.ts` |
| Teachers | `src/modules/teachers/services/teachers.service.spec.ts`, `src/modules/teachers/controllers/teachers.controller.spec.ts` |
| Students/Enrollments | `src/modules/students/services/*.spec.ts` |
| Revenues | `src/modules/revenues/services/revenue.service.spec.ts` |

## طريقة البحث السريعة في الكود

أوامر مفيدة:

```bash
rg "@Controller" src/modules
rg "@(Get|Post|Patch|Delete|Put)" src/modules
rg "isHomeActive" src
rg "courseDiscountPercentage|discountedPrice" src
rg "StudentEnrollment|active enrollment|isActive" src/modules
rg "isVisibleToStudents" src
rg "SubscriptionRequest|finalAmount|basePrice" src
```

## عند طلب تعديل من نوع معين

| نوع الطلب | أول ملفات أراجعها |
|---|---|
| "الكورس لا يظهر للطالب" | `dashboard.service.ts`, `course.service.ts`, `Season`, `Course.status`, subscription checks |
| "الفصل المختار من الأدمن" | `seasons.controller.ts`, `academics.service.ts`, `dashboard.service.ts` |
| "حذف أستاذ وكورساته" | `admins.service.ts`, `teachers.service.ts`, dashboard/course filters |
| "الحسم والسعر" | `create-course.dto.ts`, `update-course.dto.ts`, `course.service.ts`, financial snapshots |
| "اشتراك الطالب" | `financials.service.ts`, subscription request DTOs, `StudentSubscription` |
| "كود لا يعمل" | `codes.controller.ts`, `code-groups.controller.ts`, `financials.service.ts`, `Code`, `CodeGroup` |
| "رفع فيديو" | `uploads.service.ts`, `lectures.service.ts`, Bunny service |
| "إشعار لا يصل" | `notifications.service.ts`, Firebase service, FCM token |
| "بحث الأدمن" | `admins.controller.ts`, `admins.service.ts`, query DTOs |
| "تقييم أو لايك" | `interactions.service.ts`, unique constraints |
| "بيانات الطالب الأكاديمية" | `students.service.ts`, `enrollments.service.ts`, `StudentEnrollment` |

## آخر تعديلات معروفة يجب تذكرها

هذه نقاط مهمة من التعديلات الأخيرة حتى لا أرجع أطبق عكسها:

- Dashboard الطالب صار يعتمد على الفصل المفعل من الأدمن `Season.isHomeActive`.
- عند تغيير الفصل الفعال، كورسات الفصل المختار يجب أن تكون هي المعتمدة في واجهة الطالب.
- لم يتم حذف pagination من dashboard courses بعد التراجع عن سوء الفهم.
- حسم الكورس من الواجهة مطلوب كسعر نهائي بعد الحسم، وليس كنسبة.
- داخليا ما زال العمود `courseDiscountPercentage` يخزن النسبة المحسوبة.
- لا يوجد migration مطلوب لتعديل الحسم الحالي لأنه لم يتغير schema.

## مبادئ تعديل المشروع

- لا تغير response مستخدم إلا إذا الطلب واضح.
- لا تضف migration إذا لم يتغير `schema.prisma`.
- لا تحذف compatibility مع أسماء legacy بدون alias.
- لا تطبق فلاتر الطلاب على admin endpoints إلا بطلب واضح.
- لا تفترض أن `departmentId` موجود.
- لا تفترض أن الطالب لديه enrollment واحد فقط، اقرأ active enrollment.
- لا تعتمد على اسم الحقل فقط، اقرأ معنى الحقل في السيرفس.
- عند تعديل مالي، حافظ على snapshots والسجلات التاريخية.
- عند تعديل ظهور الكورسات، راجع: status، الفصل، الأستاذ، الاشتراك، المجانية، السنة، المادة.


