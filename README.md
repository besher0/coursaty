# University LMS Backend (NestJS + Prisma)

## Overview
- NestJS API with Prisma/PostgreSQL.
- Polymorphic Users (`userableId`, `userableType`) linking Students, Teachers, Admins.
- Academic hierarchy: University → College → Department → Subject → Course → Lecture → (Videos, Files, Automations).
- Integrations: Bunny.net (Stream + Storage), Firebase Admin (FCM pushes), Swagger docs, class-validator DTOs.

## Folder Structure
```
src/
  main.ts                 # Bootstrap + Swagger + validation pipe
  app.module.ts           # Root wiring
  prisma/
    prisma.module.ts      # Global Prisma provider
    prisma.service.ts
  common/
    enums/
      course-type.enum.ts
  shared/
    bunny/                # Bunny Stream + storage uploads
      bunny.module.ts
      bunny.service.ts
    firebase/             # Firebase Admin wrapper
      firebase.module.ts
      firebase.service.ts
  modules/
    courses/
      course.module.ts
      controllers/
        course.controller.ts
      services/
        course.service.ts
      dtos/
        create-course.dto.ts
prisma/
  schema.prisma           # Database schema
```

## Environment
Create `.env` with:
```
DATABASE_URL=postgresql://user:pass@localhost:5432/lms
PORT=3000

# Bunny Stream
BUNNY_STREAM_LIBRARY_ID=your-library-id
BUNNY_API_KEY=your-stream-api-key
# Bunny Storage
BUNNY_STORAGE_ZONE=your-storage-zone
BUNNY_STORAGE_HOST=storage.bunnycdn.com
BUNNY_STORAGE_API_KEY=your-storage-api-key

# Firebase
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

## Install & Run
```
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run start:dev
```
Swagger available at `/docs`.

## Notes
- Bunny upload flow: controller -> service -> `BunnyService.createStreamVideo` -> `uploadStreamVideo` -> store playback URL.
- Counts: course query aggregates subscribers, videos, files via Prisma `_count` and reductions.
- Adjust additional modules (auth/users, subscriptions, finances) following the modules pattern shown.
