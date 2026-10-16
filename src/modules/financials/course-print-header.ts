import { Prisma } from '@prisma/client';

/**
 * The course context printed at the top of every page of a code batch:
 * university, college, department (when any), subject and teacher.
 *
 * Older courses may only be linked through their subject, so each level falls
 * back to the subject's college and department.
 */
export const COURSE_PRINT_HEADER_SELECT = {
  teacher: { select: { name: true } },
  university: { select: { name: true } },
  college: { select: { name: true, university: { select: { name: true } } } },
  department: { select: { name: true } },
  subject: {
    select: {
      subjectName: true,
      department: { select: { name: true } },
      college: { select: { name: true, university: { select: { name: true } } } },
    },
  },
} satisfies Prisma.CourseSelect;

export type CoursePrintHeaderSource = Prisma.CourseGetPayload<{
  select: typeof COURSE_PRINT_HEADER_SELECT;
}>;

export interface CoursePrintHeader {
  universityName: string | null;
  collegeName: string | null;
  departmentName: string | null;
  subjectName: string | null;
  teacherName: string | null;
}

export function toCoursePrintHeader(
  course: CoursePrintHeaderSource | null | undefined,
): CoursePrintHeader {
  const college = course?.college ?? course?.subject?.college ?? null;
  return {
    universityName: course?.university?.name ?? college?.university?.name ?? null,
    collegeName: college?.name ?? null,
    departmentName: course?.department?.name ?? course?.subject?.department?.name ?? null,
    subjectName: course?.subject?.subjectName ?? null,
    teacherName: course?.teacher?.name ?? null,
  };
}
