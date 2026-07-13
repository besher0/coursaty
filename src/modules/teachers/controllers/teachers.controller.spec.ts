import { TeachersController } from './teachers.controller';

describe('TeachersController revenue query forwarding', () => {
  const result = { invoice: {} };
  const teachers = {
    getMyCoursesRevenue: jest.fn().mockReturnValue(result),
    getTeacherCoursesRevenue: jest.fn().mockReturnValue(result),
    getTeacherRevenueByPeriod: jest.fn().mockReturnValue(result),
  };
  const controller = new TeachersController(teachers as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forwards the complete period query for the current teacher', () => {
    const user = { userId: 'user-id', type: 'TEACHER' };
    const query = { dateFrom: '2026-07-01', dateTo: '2026-07-31' };

    expect(controller.getMyRevenue({ user }, query)).toBe(result);
    expect(teachers.getMyCoursesRevenue).toHaveBeenCalledWith(user, query);
  });

  it('forwards the complete period query for an admin teacher lookup', () => {
    const query = { year: 2026, month: 7 };

    expect(controller.getTeacherRevenue('teacher-id', query)).toBe(result);
    expect(teachers.getTeacherCoursesRevenue).toHaveBeenCalledWith('teacher-id', query);
  });

  it('forwards the complete period query to the legacy grouped endpoint', () => {
    const query = { year: 2026 };

    expect(controller.getTeacherRevenueByPeriod('teacher-id', query)).toBe(result);
    expect(teachers.getTeacherRevenueByPeriod).toHaveBeenCalledWith('teacher-id', query);
  });
});
