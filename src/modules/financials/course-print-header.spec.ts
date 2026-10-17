import { toCoursePrintHeader } from './course-print-header';

describe('toCoursePrintHeader', () => {
  it('reads the names linked to the course', () => {
    expect(
      toCoursePrintHeader({
        teacher: { name: 'أحمد' },
        university: { name: 'جامعة دمشق' },
        college: { name: 'الهندسة المعلوماتية', university: { name: 'جامعة دمشق' } },
        department: { name: 'البرمجيات' },
        collegeYear: {
          academicYear: { yearName: 'السنة الثالثة' },
          college: { name: 'كلية أخرى', university: { name: 'جامعة أخرى' } },
          department: { name: 'قسم آخر' },
        },
        subject: { subjectName: 'قواعد المعطيات', department: null, college: null, collegeYear: null },
      }),
    ).toEqual({
      universityName: 'جامعة دمشق',
      collegeName: 'الهندسة المعلوماتية',
      departmentName: 'البرمجيات',
      studyYearName: 'السنة الثالثة',
      subjectName: 'قواعد المعطيات',
      teacherName: 'أحمد',
    });
  });

  it('falls back to the subject for courses linked only through it', () => {
    expect(
      toCoursePrintHeader({
        teacher: { name: 'أحمد' },
        university: null,
        college: null,
        department: null,
        collegeYear: null,
        subject: {
          subjectName: 'تحليل 1',
          department: null,
          college: { name: 'العلوم', university: { name: 'جامعة حلب' } },
          collegeYear: {
            academicYear: { yearName: 'السنة الأولى' },
            college: { name: 'العلوم', university: { name: 'جامعة حلب' } },
            department: null,
          },
        },
      }),
    ).toEqual({
      universityName: 'جامعة حلب',
      collegeName: 'العلوم',
      departmentName: null,
      studyYearName: 'السنة الأولى',
      subjectName: 'تحليل 1',
      teacherName: 'أحمد',
    });
  });

  it('falls back to the college year for courses linked only through it', () => {
    expect(
      toCoursePrintHeader({
        teacher: { name: 'أحمد' },
        university: null,
        college: null,
        department: null,
        collegeYear: {
          academicYear: { yearName: 'السنة الثانية' },
          college: { name: 'الطب', university: { name: 'جامعة اللاذقية' } },
          department: { name: 'الجراحة' },
        },
        subject: null,
      }),
    ).toEqual({
      universityName: 'جامعة اللاذقية',
      collegeName: 'الطب',
      departmentName: 'الجراحة',
      studyYearName: 'السنة الثانية',
      subjectName: null,
      teacherName: 'أحمد',
    });
    expect(toCoursePrintHeader(null)).toEqual({
      universityName: null,
      collegeName: null,
      departmentName: null,
      studyYearName: null,
      subjectName: null,
      teacherName: null,
    });
  });
});
