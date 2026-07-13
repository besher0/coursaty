import { AdminsController } from './admins.controller';

describe('AdminsController revenue query forwarding', () => {
  const result = { invoice: {} };
  const admins = {
    getRevenue: jest.fn().mockReturnValue(result),
  };
  const controller = new AdminsController(admins as any, {} as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forwards all admin revenue filters as one validated DTO', async () => {
    const query = {
      courseId: 'course-id',
      universityId: 'university-id',
      collegeId: 'college-id',
      year: 2026,
      month: 7,
    };

    await expect(controller.getRevenue(query)).resolves.toBe(result);
    expect(admins.getRevenue).toHaveBeenCalledWith(query);
  });
});
