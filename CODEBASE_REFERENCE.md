# Cousati Backend Reference

This file is a quick knowledge base for the project so future requests can use this instead of re-reading the full codebase.

## 1) Stack And Bootstrapping

- Framework: NestJS + TypeScript
- ORM: Prisma (PostgreSQL)
- Auth: JWT (`passport-jwt`) with role guard (`STUDENT`, `TEACHER`, `ADMIN`)
- Caching: Redis store via `cache-manager-redis-store`
- Docs: Swagger at `/api`
- Media: Bunny Stream + Bunny Storage
- Push notifications: Firebase Admin SDK

Main files:
- `src/main.ts`
	- Enables global `ValidationPipe({ whitelist: true, transform: true })`
	- Configures Swagger
	- Starts server on `PORT` or `3000`
- `src/app.module.ts`
	- Loads all modules
	- Configures global cache (Redis)
	- Applies `CorrelationIdMiddleware` to all routes
	- Registers global `AllExceptionsFilter`

## 2) Global Auth And Error Layer

- `JwtStrategy` (`src/modules/auth/strategies/jwt.strategy.ts`)
	- Reads bearer token
	- Payload shape used in app: `{ sub, type }`
	- Injects request user as `{ userId, type }`
- `JwtAuthGuard` protects authenticated routes
- `RolesGuard` checks custom `@Roles(...)`
- `AllExceptionsFilter` standardizes error payload:
	- `timestamp`, `path`, `errorCode`, `message`, `correlationId`, `details`
	- Handles Nest HTTP exceptions and Prisma known errors (`P2002`, etc.)

## 3) Prisma Schema Snapshot

Core enums:
- `UserType`: `STUDENT`, `TEACHER`, `ADMIN`
- `CodeStatus`: `ACTIVE`, `USED`, `INACTIVE`
- `Gender`: `MALE`, `FEMALE`
- `NotificationStatus`: `PENDING`, `APPROVED`, `REJECTED`
- `WithdrawalStatus`: `PENDING`, `APPROVED`, `REJECTED`
- `CourseStatus`: `PENDING`, `APPROVED`, `REJECTED`

Core models and purpose:
- `User`: login identity; polymorphic link via `userableId + userableType`
- `Student`, `Teacher`, `Admin`: role-specific profiles
- `Province`, `University`, `College`, `Department`, `AcademicYear`, `CollegeYear`, `Season`, `Subject`: academic hierarchy
- `TeacherAffiliation`: teacher scope binding (university/college/department)
- `CourseCategory`: categories (has `sortOrder`, `requiresAcademicLinks`, `isProgram`)
- `Course`: course master record with approval and pricing fields
- `Lecture`, `Video`, `LectureFile`: learning content
- `Question`, `QuestionOption`: assessments
- `CodeGroup`, `Code`: discount code system
- `StudentSubscription`: subscription purchase result (`basePrice`, discounts, `finalPrice`, `expiresAt`)
- `Notification`: teacher/admin to students workflow
- `Advertisement`: college-targeted ads
- `PointOfSale`: payment/physical points linked to province/university
- `TeacherLike`, `VideoInteraction`, `VideoSegment`, `TeacherSubjectPermission`
- `CustomerService`, `AppDescription`: app content/config entities

## 4) Route Map (High-Level)

### Auth (`/auth`)
- `POST /register`: create user account (phone/password/type/userableId)
- `POST /login`: validate credentials and return `accessToken`

### Users (`/users`)
- `PATCH /:id/fcm-token`: update FCM token
- `GET /me`: current user profile + userable details
- `PATCH /me`: update generic profile fields
- `PATCH /me/user`: update account fields (phone/gender)
- `PATCH /me/student`: update student academic profile

### Students (`/students`)
- `POST /`: create student profile

### Teachers (`/teachers`)
- `POST /`: create teacher profile
- `GET /me/summary` (`TEACHER`)
- `GET /me/courses/active` (`TEACHER`)
- `GET /me/courses/expired` (`TEACHER`)
- `GET /me/affiliations` (`TEACHER`)
- `POST /me/affiliations` (`TEACHER`)
- `POST /me/affiliations/remove` (`TEACHER`)
- `GET /me/allowed-subjects` (`TEACHER`)
- `GET /:id/allowed-subjects` (`ADMIN`)
- `POST /:id/allowed-subjects` (`ADMIN`)
- `POST /:id/allowed-subjects/remove` (`ADMIN`)

### Courses (`/courses`)
- `POST /` (`TEACHER`, `ADMIN`): create course
- `GET /categories`: list categories
- `POST /categories` (`ADMIN`)
- `PATCH /categories/:id` (`ADMIN`)
- `DELETE /categories/:id` (`ADMIN`)
- `GET /:id`: course with aggregated counts
- `GET /:id/details`: course details for app consumption
- `GET /:id/admin-details` (`ADMIN`): rich admin view (course/details/lectures/codes)
- `GET /`: list courses
- `PATCH /:id` (`TEACHER`, `ADMIN`)
- `PATCH /:id/approve` (`ADMIN`)
- `PATCH /:id/reject` (`ADMIN`)
- `DELETE /:id` (`ADMIN`)
- `POST /:courseId/lectures/:lectureId/videos` (`TEACHER`, `ADMIN`)

### Lectures (`/lectures`)
- `POST /` (`TEACHER`, `ADMIN`)
- `GET /course/:courseId`
- `GET /:lectureId/details`
- `PATCH /:lectureId` (`TEACHER`, `ADMIN`)
- `DELETE /:lectureId` (`ADMIN`)
- `POST /:lectureId/files` (`TEACHER`, `ADMIN`)
- `POST /files` (`TEACHER`, `ADMIN`)
- `PATCH /files/:id` (`TEACHER`, `ADMIN`)
- `DELETE /files/:id` (`ADMIN`)
- `POST /videos` (`TEACHER`, `ADMIN`)
- `POST /:lectureId/videos/upload` (`TEACHER`, `ADMIN`)
- `PATCH /videos/:id` (`TEACHER`, `ADMIN`)
- `DELETE /videos/:id` (`TEACHER`, `ADMIN`)
- `POST /:lectureId/questions` (`TEACHER`, `ADMIN`)
- `GET /:lectureId/questions`
- `PATCH /questions/:id` (`TEACHER`, `ADMIN`)
- `DELETE /questions/:id` (`TEACHER`, `ADMIN`)

### Financials
- `POST /financials/subscriptions/subscribe` (`STUDENT`): subscribe by code value
- `GET /financials/subscriptions` (`ADMIN`, `TEACHER`)
- `GET /financials/subscriptions/me/active-courses` (`STUDENT`)
- `GET /financials/subscriptions/me/inactive-courses` (`STUDENT`)
- `POST /financials/code-groups` (`ADMIN`)
- `GET /financials/code-groups`
- `PATCH /financials/code-groups/:id` (`ADMIN`)
- `DELETE /financials/code-groups/:id` (`ADMIN`)
- `POST /financials/codes` (`ADMIN`)
- `POST /financials/codes/bulk` (`ADMIN`)
- `GET /financials/codes`
- `PATCH /financials/codes/:id` (`ADMIN`)
- `DELETE /financials/codes/:id` (`ADMIN`)
- `POST /financials/codes/:id/activate` (`ADMIN`)
- `POST /financials/codes/:id/deactivate` (`ADMIN`)

### Admins (`/admins`)
- `POST /`: create admin profile
- `GET /`: list admins
- `GET /dashboard` (`ADMIN`)
- `GET /code-statistics` (`ADMIN`)
- `GET /search/subjects` (`ADMIN`)
- `GET /search/programs` (`ADMIN`)
- `GET /search/courses` (`ADMIN`)
- `GET /revenue` (`ADMIN`)

### Admin Code Management (`/admins/codes`, `ADMIN`)
- `POST /groups`
- `POST /generate`
- `POST /generate-bulk`
- `PATCH /:codeId`
- `DELETE /:codeId`
- `GET /group/:groupId`
- `GET /group/:groupId/export`
- `PATCH /group/:groupId/deactivate-all`

### Dashboard (Student) (`/dashboard`)
- `GET /student-college-info` (`STUDENT`)
- `GET /courses-by-subjects` (`STUDENT`)
- `GET /subjects/:id/courses` (`STUDENT`)
- `GET /college-teachers` (`STUDENT`)
- `GET /teachers/:id` (`STUDENT`)
- `GET /courses-by-category` (`STUDENT`)

### Academics (`/academics/*`, mostly `ADMIN` for writes)
- Universities, colleges, departments, subjects, years, academic-years, seasons CRUD endpoints

### Interactions
- `POST /interactions/teachers/like` (`STUDENT`)
- `DELETE /interactions/teachers/like` (`STUDENT`)
- `POST /interactions/videos` (`STUDENT`)
- `PATCH /interactions/videos/:id` (`STUDENT`)
- `DELETE /interactions/videos/:id` (`STUDENT`)
- `POST /interactions/videos/:id/view` (authenticated)

### Notifications (`/notifications`)
- `POST /` (`TEACHER`, `ADMIN`)
- `GET /my` (`TEACHER`, `ADMIN`)
- `GET /pending` (`ADMIN`)
- `PATCH /:id/approve` (`ADMIN`)
- `PATCH /:id/reject` (`ADMIN`)
- `GET /` (`STUDENT` approved notifications)

### Other Modules
- Advertisements (`/advertisements`): CRUD, write guarded by `ADMIN`
- Point of sales (`/point-of-sales`): CRUD + student-aware listing endpoint
- Uploads (`/uploads`): generic file/video upload via Bunny (`TEACHER`, `ADMIN`)
- App description (`/app-description`): CRUD, writes `ADMIN`
- Customer service (`/customer-service`): CRUD, writes `ADMIN`
- Provinces (`/provinces`): CRUD, writes `ADMIN`

## 5) Important Business Rules

- Teacher registration user status is set to `pending` in `AuthService.register`
- Course creation enforces category + academic scope rules in `CourseService.createCourse`
- Course approval/rejection is admin-only and records approver + timestamp
- Teacher ownership checks gate most lecture/video/question writes
- Student content access respects subscription and expiry; free content is exposed when locked
- Codes support `validForDays`, `validUntil`, usage limit, and optional `allowedUniversityNumber`
- Notifications from teachers are `PENDING`; admin approval triggers Firebase push broadcast to matching students

## 6) Known Technical Notes

- DB uses UUID strings, but some controllers/services still type IDs as `number` and use `ParseIntPipe`.
- Many service methods convert incoming IDs using `String(...)`, so some routes may still work if numeric parse is bypassed, but `ParseIntPipe` will fail for UUID route params.
- `CourseCategory` DB fields `sortOrder` and `requiresAcademicLinks` still exist; API DTO inputs for them were removed.

## 7) Quick Navigation Pointers

- Course core logic: `src/modules/courses/services/course.service.ts`
- Student-facing dashboard aggregation: `src/modules/academics/services/dashboard.service.ts`
- Admin dashboard metrics: `src/modules/admins/services/admin-dashboard.service.ts`
- Admin revenue/search: `src/modules/admins/services/admins.service.ts`
- Subscription and code engine: `src/modules/financials/services/financials.service.ts`
- Lecture/content access rules: `src/modules/lectures/services/lectures.service.ts`

## 8) How To Keep This File Updated

When adding/changing APIs:
1. Update route list section for the module.
2. Add/adjust business rule if behavior changed.
3. Update "Known Technical Notes" if migration/refactor status changed.

