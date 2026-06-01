import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient | null = null;

function getArgValue(argv: string[], name: string) {
  const index = argv.findIndex((arg) => arg === name);
  if (index === -1) return undefined;
  return argv[index + 1];
}

function hasFlag(argv: string[], name: string) {
  return argv.includes(name);
}

function normalizeIds(raw: string) {
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function assertUuidV4(value: string) {
  const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidV4.test(value)) {
    throw new Error(`Invalid UUID v4: ${value}`);
  }
}

function normalizeDatabaseUrl(databaseUrl?: string) {
  if (!databaseUrl) return databaseUrl;

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    return databaseUrl;
  }

  if (parsed.searchParams.has('channel_binding')) {
    parsed.searchParams.delete('channel_binding');
  }

  if (!parsed.searchParams.has('connect_timeout')) {
    parsed.searchParams.set('connect_timeout', '15');
  }

  if (!parsed.searchParams.has('pool_timeout')) {
    parsed.searchParams.set('pool_timeout', '60');
  }

  if (!parsed.searchParams.has('connection_limit')) {
    parsed.searchParams.set('connection_limit', '1');
  }

  return parsed.toString();
}

async function main() {
  const argv = process.argv.slice(2);
  const idsArg = getArgValue(argv, '--ids');
  const confirm = getArgValue(argv, '--confirm');
  const dryRun = hasFlag(argv, '--dry-run');

  if (!idsArg) {
    throw new Error('Missing --ids. Example: --ids id1,id2,id3');
  }

  const rawDatabaseUrl = process.env.DATABASE_URL;
  const databaseUrl = normalizeDatabaseUrl(rawDatabaseUrl);

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set. Refusing to run.');
  }

  if (/localhost|127\.0\.0\.1/i.test(databaseUrl)) {
    throw new Error('Refusing to run against localhost. Set DATABASE_URL to production and retry.');
  }

  if (confirm !== 'prod' && !dryRun) {
    throw new Error('Refusing to delete. Re-run with --confirm prod (or use --dry-run).');
  }

  const courseIds = normalizeIds(idsArg);
  courseIds.forEach(assertUuidV4);

  if (!courseIds.length) {
    throw new Error('No course ids provided after parsing.');
  }

  prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  const courses = await prisma.course.findMany({
    where: { id: { in: courseIds } },
    select: { id: true },
  });

  const existingCourseIds = new Set(courses.map((course) => course.id));
  const missingCourseIds = courseIds.filter((id) => !existingCourseIds.has(id));

  const lectures = await prisma.lecture.findMany({
    where: { courseId: { in: courseIds } },
    select: { id: true },
  });
  const lectureIds = lectures.map((lecture) => lecture.id);

  const videos = lectureIds.length
    ? await prisma.video.findMany({
        where: { lectureId: { in: lectureIds } },
        select: { id: true },
      })
    : [];
  const videoIds = videos.map((video) => video.id);

  const questions = lectureIds.length
    ? await prisma.question.findMany({
        where: { lectureId: { in: lectureIds } },
        select: { id: true },
      })
    : [];
  const questionIds = questions.map((question) => question.id);

  const codeGroups = await prisma.codeGroup.findMany({
    where: { courseId: { in: courseIds } },
    select: { id: true },
  });
  const codeGroupIds = codeGroups.map((group) => group.id);

  const [
    subscriptionsCount,
    ratingsCount,
    lectureFilesCount,
    videoInteractionsCount,
    videoSegmentsCount,
    questionOptionsCount,
  ] = await prisma.$transaction([
    prisma.studentSubscription.count({ where: { courseId: { in: courseIds } } }),
    prisma.courseRating.count({ where: { courseId: { in: courseIds } } }),
    prisma.lectureFile.count({ where: { lectureId: { in: lectureIds } } }),
    prisma.videoInteraction.count({ where: { videoId: { in: videoIds } } }),
    prisma.videoSegment.count({ where: { videoId: { in: videoIds } } }),
    prisma.questionOption.count({ where: { questionId: { in: questionIds } } }),
  ]);

  console.log('Delete summary');
  console.table({
    courses: existingCourseIds.size,
    lectures: lectureIds.length,
    videos: videoIds.length,
    subscriptions: subscriptionsCount,
    ratings: ratingsCount,
    lectureFiles: lectureFilesCount,
    videoInteractions: videoInteractionsCount,
    videoSegments: videoSegmentsCount,
    questions: questionIds.length,
    questionOptions: questionOptionsCount,
    codeGroups: codeGroupIds.length,
  });

  if (missingCourseIds.length) {
    console.log('Missing course ids (not found):');
    console.log(missingCourseIds.join(', '));
  }

  if (dryRun) {
    console.log('Dry run complete. No data deleted.');
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const deletedVideoInteractions = videoIds.length
      ? await tx.videoInteraction.deleteMany({ where: { videoId: { in: videoIds } } })
      : { count: 0 };

    const deletedVideoSegments = videoIds.length
      ? await tx.videoSegment.deleteMany({ where: { videoId: { in: videoIds } } })
      : { count: 0 };

    const deletedVideos = videoIds.length
      ? await tx.video.deleteMany({ where: { id: { in: videoIds } } })
      : { count: 0 };

    const deletedQuestionOptions = questionIds.length
      ? await tx.questionOption.deleteMany({ where: { questionId: { in: questionIds } } })
      : { count: 0 };

    const deletedQuestions = questionIds.length
      ? await tx.question.deleteMany({ where: { id: { in: questionIds } } })
      : { count: 0 };

    const deletedLectureFiles = lectureIds.length
      ? await tx.lectureFile.deleteMany({ where: { lectureId: { in: lectureIds } } })
      : { count: 0 };

    const deletedLectures = lectureIds.length
      ? await tx.lecture.deleteMany({ where: { id: { in: lectureIds } } })
      : { count: 0 };

    const deletedCodes = codeGroupIds.length
      ? await tx.code.deleteMany({ where: { codeGroupId: { in: codeGroupIds } } })
      : { count: 0 };

    const deletedCodeGroups = codeGroupIds.length
      ? await tx.codeGroup.deleteMany({ where: { id: { in: codeGroupIds } } })
      : { count: 0 };

    const deletedSubscriptions = await tx.studentSubscription.deleteMany({
      where: { courseId: { in: courseIds } },
    });

    const deletedRatings = await tx.courseRating.deleteMany({
      where: { courseId: { in: courseIds } },
    });

    const deletedCourses = await tx.course.deleteMany({
      where: { id: { in: courseIds } },
    });

    return {
      deletedVideoInteractions: deletedVideoInteractions.count,
      deletedVideoSegments: deletedVideoSegments.count,
      deletedVideos: deletedVideos.count,
      deletedQuestionOptions: deletedQuestionOptions.count,
      deletedQuestions: deletedQuestions.count,
      deletedLectureFiles: deletedLectureFiles.count,
      deletedLectures: deletedLectures.count,
      deletedCodes: deletedCodes.count,
      deletedCodeGroups: deletedCodeGroups.count,
      deletedSubscriptions: deletedSubscriptions.count,
      deletedRatings: deletedRatings.count,
      deletedCourses: deletedCourses.count,
    };
  });

  console.log('Delete results');
  console.table(result);
}

main()
  .then(async () => {
    if (prisma) await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    if (prisma) await prisma.$disconnect();
    process.exit(1);
  });
