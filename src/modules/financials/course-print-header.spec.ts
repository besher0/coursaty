import { toCoursePrintHeader } from './course-print-header';

describe('toCoursePrintHeader', () => {
  it('reads the names linked to the course', () => {
    expect(
      toCoursePrintHeader({
        teacher: { name: 'أحمد' },
        university: { name: 'جامعة دمشق' },
        college: { name: 'الهندسة المعلوماتية', university: { name: 'جامعة دمشق' } },
        department: { name: 'البرمجيات' },
        subject: { subjectName: 'قواعد المعطيات', department: null, college: null },
      }),
    ).toEqual({
      universityName: 'جامعة دمشق',
      collegeName: 'الهندسة المعلوماتية',
      departmentName: 'البرمجيات',
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
        subject: {
          subjectName: 'تحليل 1',
          department: null,
          college: { name: 'العلوم', university: { name: 'جامعة حلب' } },
        },
      }),
    ).toEqual({
      universityName: 'جامعة حلب',
      collegeName: 'العلوم',
      departmentName: null,
      subjectName: 'تحليل 1',
      teacherName: 'أحمد',
    });
    expect(toCoursePrintHeader(null).universityName).toBeNull();
  });
});
