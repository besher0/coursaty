import { Prisma } from '@prisma/client';

/**
 * The course context printed at the top of every page of a code batch:
 * university, college, department (when any), study year, subject and teacher.
 *
 * Older courses may only be linked through their subject or their college
 * year, so each level falls back to the subject's links, then to the college
 * year's.
 */
const COLLEGE_SELECT = {
  select: { name: true, university: { select: { name: true } } },
} as const;

const COLLEGE_YEAR_SELECT = {
  select: {
    academicYear: { select: { yearName: true } },
    college: COLLEGE_SELECT,
    department: { select: { name: true } },
  },
} as const;

export const COURSE_PRINT_HEADER_SELECT = {
  teacher: { select: { name: true } },
  university: { select: { name: true } },
  college: COLLEGE_SELECT,
  department: { select: { name: true } },
  collegeYear: COLLEGE_YEAR_SELECT,
  subject: {
    select: {
      subjectName: true,
      department: { select: { name: true } },
      college: COLLEGE_SELECT,
      collegeYear: COLLEGE_YEAR_SELECT,
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
  studyYearName: string | null;
  subjectName: string | null;
  teacherName: string | null;
}

export function toCoursePrintHeader(
  course: CoursePrintHeaderSource | null | undefined,
): CoursePrintHeader {
  const collegeYear = course?.collegeYear ?? course?.subject?.collegeYear ?? null;
  const college =
    course?.college ?? course?.subject?.college ?? collegeYear?.college ?? null;
  return {
    universityName: course?.university?.name ?? college?.university?.name ?? null,
    collegeName: college?.name ?? null,
    departmentName:
      course?.department?.name ??
      course?.subject?.department?.name ??
      collegeYear?.department?.name ??
      null,
    studyYearName: collegeYear?.academicYear?.yearName ?? null,
    subjectName: course?.subject?.subjectName ?? null,
    teacherName: course?.teacher?.name ?? null,
  };
}
