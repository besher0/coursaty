import { CourseService } from './course.service';
import { DomainException } from '@/common/errors/domain.exception';

describe('CourseService academic identity immutability', () => {
  it('rejects academic identity overrides on create', async () => {
    const prisma = {} as any;
    const bunny = {} as any;
    const service = new CourseService(prisma, bunny);

    const dto = {
      categoryId: 1,
      collegeYearId: 2,
    };

    await expect(service.createCourse(dto as any, { userId: 1, type: 'ADMIN' })).rejects.toThrow(DomainException);
  });

  it('rejects academic identity overrides on update', async () => {
    const prisma = {} as any;
    const bunny = {} as any;
    const service = new CourseService(prisma, bunny);

    await expect(
      service.updateCourse("1", { collegeId: 5 } as any, { userId: 1, type: 'ADMIN' }),
    ).rejects.toThrow(DomainException);
  });
});
