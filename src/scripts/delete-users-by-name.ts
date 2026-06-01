import { Prisma, PrismaClient } from '@prisma/client';

type MatchMode = 'contains' | 'exact';
type CodeMode = 'anonymize' | 'delete';

type CourseDeletionPlan = {
  courseIds: string[];
  lectureIds: string[];
  videoIds: string[];
  questionIds: string[];
  codeGroupIds: string[];
  counts: {
    courses: number;
    lectures: number;
    videos: number;
    subscriptions: number;
    ratings: number;
    lectureFiles: number;
    videoInteractions: number;
    videoSegments: number;
    questions: number;
    questionOptions: number;
    codeGroups: number;
  };
};

let prisma: PrismaClient | null = null;

function getArgValue(argv: string[], name: string) {
  const index = argv.findIndex((arg) => arg === name);
  if (index === -1) return undefined;
  return argv[index + 1];
}

function hasFlag(argv: string[], name: string) {
  return argv.includes(name);
}

function normalizeList(raw: string) {
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
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

function buildNameWhere(names: string[], match: MatchMode) {
  const or = names.map((name) =>
    match === 'exact'
      ? { name: { equals: name, mode: 'insensitive' as const } }
      : { name: { contains: name, mode: 'insensitive' as const } },
  );
  return { OR: or };
}

async function buildCourseDeletionPlan(courseIds: string[], client: PrismaClient): Promise<CourseDeletionPlan> {
  const uniqueCourseIds = Array.from(new Set(courseIds.map((id) => String(id))));
  if (!uniqueCourseIds.length) {
    return {
      courseIds: [],
      lectureIds: [],
      videoIds: [],
      questionIds: [],
      codeGroupIds: [],
      counts: {
        courses: 0,
        lectures: 0,
        videos: 0,
        subscriptions: 0,
        ratings: 0,
        lectureFiles: 0,
        videoInteractions: 0,
        videoSegments: 0,
        questions: 0,
        questionOptions: 0,
        codeGroups: 0,
      },
    };
  }

  const courses = await client.course.findMany({
    where: { id: { in: uniqueCourseIds } },
    select: { id: true },
  });
  const existingCourseIds = courses.map((course) => course.id);

  const lectures = await client.lecture.findMany({
    where: { courseId: { in: existingCourseIds } },
    select: { id: true },
  });
  const lectureIds = lectures.map((lecture) => lecture.id);

  const videos = lectureIds.length
    ? await client.video.findMany({
        where: { lectureId: { in: lectureIds } },
        select: { id: true },
      })
    : [];
  const videoIds = videos.map((video) => video.id);

  const questions = lectureIds.length
    ? await client.question.findMany({
        where: { lectureId: { in: lectureIds } },
        select: { id: true },
      })
    : [];
  const questionIds = questions.map((question) => question.id);

  const codeGroups = await client.codeGroup.findMany({
    where: { courseId: { in: existingCourseIds } },
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
  ] = await client.$transaction([
    client.studentSubscription.count({ where: { courseId: { in: existingCourseIds } } }),
    client.courseRating.count({ where: { courseId: { in: existingCourseIds } } }),
    client.lectureFile.count({ where: { lectureId: { in: lectureIds } } }),
    client.videoInteraction.count({ where: { videoId: { in: videoIds } } }),
    client.videoSegment.count({ where: { videoId: { in: videoIds } } }),
    client.questionOption.count({ where: { questionId: { in: questionIds } } }),
  ]);

  return {
    courseIds: existingCourseIds,
    lectureIds,
    videoIds,
    questionIds,
    codeGroupIds,
    counts: {
      courses: existingCourseIds.length,
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
    },
  };
}

async function deleteCoursesByPlan(
  plan: CourseDeletionPlan,
  client: PrismaClient | Prisma.TransactionClient,
) {
  if (!plan.courseIds.length) {
    return {
      deletedVideoInteractions: 0,
      deletedVideoSegments: 0,
      deletedVideos: 0,
      deletedQuestionOptions: 0,
      deletedQuestions: 0,
      deletedLectureFiles: 0,
      deletedLectures: 0,
      deletedCodes: 0,
      deletedCodeGroups: 0,
      deletedSubscriptions: 0,
      deletedRatings: 0,
      deletedCourses: 0,
    };
  }

  const deletedVideoInteractions = plan.videoIds.length
    ? await client.videoInteraction.deleteMany({ where: { videoId: { in: plan.videoIds } } })
    : { count: 0 };

  const deletedVideoSegments = plan.videoIds.length
    ? await client.videoSegment.deleteMany({ where: { videoId: { in: plan.videoIds } } })
    : { count: 0 };

  const deletedVideos = plan.videoIds.length
    ? await client.video.deleteMany({ where: { id: { in: plan.videoIds } } })
    : { count: 0 };

  const deletedQuestionOptions = plan.questionIds.length
    ? await client.questionOption.deleteMany({ where: { questionId: { in: plan.questionIds } } })
    : { count: 0 };

  const deletedQuestions = plan.questionIds.length
    ? await client.question.deleteMany({ where: { id: { in: plan.questionIds } } })
    : { count: 0 };

  const deletedLectureFiles = plan.lectureIds.length
    ? await client.lectureFile.deleteMany({ where: { lectureId: { in: plan.lectureIds } } })
    : { count: 0 };

  const deletedLectures = plan.lectureIds.length
    ? await client.lecture.deleteMany({ where: { id: { in: plan.lectureIds } } })
    : { count: 0 };

  const deletedCodes = plan.codeGroupIds.length
    ? await client.code.deleteMany({ where: { codeGroupId: { in: plan.codeGroupIds } } })
    : { count: 0 };

  const deletedCodeGroups = plan.codeGroupIds.length
    ? await client.codeGroup.deleteMany({ where: { id: { in: plan.codeGroupIds } } })
    : { count: 0 };

  const deletedSubscriptions = await client.studentSubscription.deleteMany({
    where: { courseId: { in: plan.courseIds } },
  });

  const deletedRatings = await client.courseRating.deleteMany({
    where: { courseId: { in: plan.courseIds } },
  });

  const deletedCourses = await client.course.deleteMany({
    where: { id: { in: plan.courseIds } },
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
}

async function main() {
  const argv = process.argv.slice(2);
  const namesArg = getArgValue(argv, '--names');
  const confirm = getArgValue(argv, '--confirm');
  const dryRun = hasFlag(argv, '--dry-run');
  const match = (getArgValue(argv, '--match') ?? 'contains') as MatchMode;
  const codeMode = (getArgValue(argv, '--code-mode') ?? 'anonymize') as CodeMode;

  if (!namesArg) {
    throw new Error('Missing --names. Example: --names test,yaman');
  }

  if (match !== 'contains' && match !== 'exact') {
    throw new Error('Invalid --match. Use contains or exact.');
  }

  if (codeMode !== 'anonymize' && codeMode !== 'delete') {
    throw new Error('Invalid --code-mode. Use anonymize or delete.');
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

  const names = normalizeList(namesArg);
  if (!names.length) {
    throw new Error('No names provided after parsing.');
  }

  prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  const nameWhere = buildNameWhere(names, match);

  const [students, teachers, admins] = await Promise.all([
    prisma.student.findMany({ where: nameWhere, select: { id: true, name: true } }),
    prisma.teacher.findMany({ where: nameWhere, select: { id: true, name: true } }),
    prisma.admin.findMany({ where: nameWhere, select: { id: true, name: true } }),
  ]);

  const studentIds = students.map((student) => student.id);
  const teacherIds = teachers.map((teacher) => teacher.id);
  const adminIds = admins.map((admin) => admin.id);

  if (!studentIds.length && !teacherIds.length && !adminIds.length) {
    console.log('No matching users found. Nothing to delete.');
    return;
  }

  const userWhereOr: Array<Record<string, any>> = [];
  if (studentIds.length) {
    userWhereOr.push({ userableType: 'STUDENT', userableId: { in: studentIds } });
  }
  if (teacherIds.length) {
    userWhereOr.push({ userableType: 'TEACHER', userableId: { in: teacherIds } });
  }
  if (adminIds.length) {
    userWhereOr.push({ userableType: 'ADMIN', userableId: { in: adminIds } });
  }

  const users = userWhereOr.length
    ? await prisma.user.findMany({
        where: { OR: userWhereOr },
        select: { id: true, userableType: true, userableId: true },
      })
    : [];

  const userIds = users.map((user) => user.id);

  const teacherCourses = teacherIds.length
    ? await prisma.course.findMany({
        where: { teacherId: { in: teacherIds } },
        select: { id: true },
      })
    : [];
  const teacherCourseIds = teacherCourses.map((course) => course.id);

  const coursePlan = await buildCourseDeletionPlan(teacherCourseIds, prisma);

  const [
    studentSubscriptionsCount,
    studentRatingsCount,
    studentLikesCount,
    usedCodesCount,
    teacherLikesCount,
    teacherAffiliationsCount,
    teacherPermissionsCount,
    teacherWithdrawalsCount,
    notificationsApprovedCount,
    notificationsCreatedCount,
    videoInteractionsCount,
  ] = await Promise.all([
    studentIds.length
      ? prisma.studentSubscription.count({ where: { studentId: { in: studentIds } } })
      : Promise.resolve(0),
    studentIds.length
      ? prisma.courseRating.count({ where: { studentId: { in: studentIds } } })
      : Promise.resolve(0),
    studentIds.length
      ? prisma.teacherLike.count({ where: { studentId: { in: studentIds } } })
      : Promise.resolve(0),
    studentIds.length
      ? prisma.code.count({ where: { usedByStudentId: { in: studentIds } } })
      : Promise.resolve(0),
    teacherIds.length
      ? prisma.teacherLike.count({ where: { teacherId: { in: teacherIds } } })
      : Promise.resolve(0),
    teacherIds.length
      ? prisma.teacherAffiliation.count({ where: { teacherId: { in: teacherIds } } })
      : Promise.resolve(0),
    teacherIds.length
      ? prisma.teacherSubjectPermission.count({ where: { teacherId: { in: teacherIds } } })
      : Promise.resolve(0),
    teacherIds.length
      ? prisma.teacherWithdrawal.count({ where: { teacherId: { in: teacherIds } } })
      : Promise.resolve(0),
    adminIds.length
      ? prisma.notification.count({ where: { approvedById: { in: adminIds } } })
      : Promise.resolve(0),
    userIds.length
      ? prisma.notification.count({ where: { createdById: { in: userIds } } })
      : Promise.resolve(0),
    userIds.length
      ? prisma.videoInteraction.count({ where: { userId: { in: userIds } } })
      : Promise.resolve(0),
  ]);

  console.log('Delete summary');
  console.table({
    students: studentIds.length,
    teachers: teacherIds.length,
    admins: adminIds.length,
    users: userIds.length,
    teacherCourses: coursePlan.counts.courses,
    courseLectures: coursePlan.counts.lectures,
    courseVideos: coursePlan.counts.videos,
    courseSubscriptions: coursePlan.counts.subscriptions,
    courseRatings: coursePlan.counts.ratings,
    courseLectureFiles: coursePlan.counts.lectureFiles,
    courseVideoInteractions: coursePlan.counts.videoInteractions,
    courseVideoSegments: coursePlan.counts.videoSegments,
    courseQuestions: coursePlan.counts.questions,
    courseQuestionOptions: coursePlan.counts.questionOptions,
    courseCodeGroups: coursePlan.counts.codeGroups,
    studentSubscriptions: studentSubscriptionsCount,
    studentRatings: studentRatingsCount,
    studentTeacherLikes: studentLikesCount,
    studentUsedCodes: usedCodesCount,
    teacherLikes: teacherLikesCount,
    teacherAffiliations: teacherAffiliationsCount,
    teacherPermissions: teacherPermissionsCount,
    teacherWithdrawals: teacherWithdrawalsCount,
    notificationsApprovedByAdmins: notificationsApprovedCount,
    notificationsCreatedByUsers: notificationsCreatedCount,
    videoInteractionsByUsers: videoInteractionsCount,
  });

  if (dryRun) {
    console.log('Dry run complete. No data deleted.');
    return;
  }

  const courseResult = await deleteCoursesByPlan(coursePlan, prisma);

  const deletedTeacherLikes = teacherIds.length
    ? await prisma.teacherLike.deleteMany({ where: { teacherId: { in: teacherIds } } })
    : { count: 0 };

  const deletedTeacherAffiliations = teacherIds.length
    ? await prisma.teacherAffiliation.deleteMany({ where: { teacherId: { in: teacherIds } } })
    : { count: 0 };

  const deletedTeacherPermissions = teacherIds.length
    ? await prisma.teacherSubjectPermission.deleteMany({ where: { teacherId: { in: teacherIds } } })
    : { count: 0 };

  const deletedTeacherWithdrawals = teacherIds.length
    ? await prisma.teacherWithdrawal.deleteMany({ where: { teacherId: { in: teacherIds } } })
    : { count: 0 };

  const deletedStudentLikes = studentIds.length
    ? await prisma.teacherLike.deleteMany({ where: { studentId: { in: studentIds } } })
    : { count: 0 };

  const deletedStudentSubscriptions = studentIds.length
    ? await prisma.studentSubscription.deleteMany({ where: { studentId: { in: studentIds } } })
    : { count: 0 };

  const deletedStudentRatings = studentIds.length
    ? await prisma.courseRating.deleteMany({ where: { studentId: { in: studentIds } } })
    : { count: 0 };

  const deletedCodes = studentIds.length
    ? codeMode === 'delete'
      ? await prisma.code.deleteMany({ where: { usedByStudentId: { in: studentIds } } })
      : await prisma.code.updateMany({ where: { usedByStudentId: { in: studentIds } }, data: { usedByStudentId: null } })
    : { count: 0 };

  const updatedNotifications = adminIds.length
    ? await prisma.notification.updateMany({
        where: { approvedById: { in: adminIds } },
        data: { approvedById: null },
      })
    : { count: 0 };

  const deletedNotifications = userIds.length
    ? await prisma.notification.deleteMany({ where: { createdById: { in: userIds } } })
    : { count: 0 };

  const deletedVideoInteractions = userIds.length
    ? await prisma.videoInteraction.deleteMany({ where: { userId: { in: userIds } } })
    : { count: 0 };

  const deletedStudents = studentIds.length
    ? await prisma.student.deleteMany({ where: { id: { in: studentIds } } })
    : { count: 0 };

  const deletedTeachers = teacherIds.length
    ? await prisma.teacher.deleteMany({ where: { id: { in: teacherIds } } })
    : { count: 0 };

  const deletedAdmins = adminIds.length
    ? await prisma.admin.deleteMany({ where: { id: { in: adminIds } } })
    : { count: 0 };

  const deletedUsers = userIds.length
    ? await prisma.user.deleteMany({ where: { id: { in: userIds } } })
    : { count: 0 };

  const result = {
    ...courseResult,
    deletedTeacherLikes: deletedTeacherLikes.count,
    deletedTeacherAffiliations: deletedTeacherAffiliations.count,
    deletedTeacherPermissions: deletedTeacherPermissions.count,
    deletedTeacherWithdrawals: deletedTeacherWithdrawals.count,
    deletedStudentLikes: deletedStudentLikes.count,
    deletedStudentSubscriptions: deletedStudentSubscriptions.count,
    deletedStudentRatings: deletedStudentRatings.count,
    deletedStudentCodes: deletedCodes.count,
    updatedNotificationsApprovedByAdmins: updatedNotifications.count,
    deletedNotificationsCreatedByUsers: deletedNotifications.count,
    deletedVideoInteractionsByUsers: deletedVideoInteractions.count,
    deletedStudents: deletedStudents.count,
    deletedTeachers: deletedTeachers.count,
    deletedAdmins: deletedAdmins.count,
    deletedUsers: deletedUsers.count,
  };

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
