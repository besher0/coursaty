import { CourseController } from './course.controller';

describe('CourseController revenue query forwarding', () => {
  const result = { invoice: {} };
  const courseService = {
    getAdminCourseRevenue: jest.fn().mockReturnValue(result),
    getCourseStatistics: jest.fn().mockReturnValue(result),
  };
  const controller = new CourseController(courseService as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forwards the complete period query for admin course revenue', async () => {
    const query = { dateFrom: '2026-07-01', dateTo: '2026-07-31' };

    await expect(controller.getAdminCourseRevenue('course-id', query)).resolves.toBe(result);
    expect(courseService.getAdminCourseRevenue).toHaveBeenCalledWith('course-id', query);
  });

  it('forwards the caller and complete period query for course statistics', async () => {
    const user = { userId: 'teacher-id', type: 'TEACHER' };
    const query = { year: 2026, month: 7 };

    await expect(controller.getCourseStatistics('course-id', { user }, query)).resolves.toBe(result);
    expect(courseService.getCourseStatistics).toHaveBeenCalledWith('course-id', user, query);
  });
});
