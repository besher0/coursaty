import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ROLES_KEY } from '../auth/roles.decorator';
import { PointOfSalesController } from '../point-of-sales/controllers/point-of-sales.controller';
import { CodeGroupsController } from './controllers/code-groups.controller';
import { CodesController } from './controllers/codes.controller';

/**
 * These routes were reachable without a token: the two listings returned every
 * activation code value, and anyone could create, edit or delete sales points.
 */
describe('admin-only routes', () => {
  const cases: Array<[string, Function]> = [
    ['GET /financials/code-groups', CodeGroupsController.prototype.list],
    ['GET /financials/codes', CodesController.prototype.list],
    ['POST /point-of-sales', PointOfSalesController.prototype.create],
    ['PATCH /point-of-sales/:id', PointOfSalesController.prototype.update],
    ['DELETE /point-of-sales/:id', PointOfSalesController.prototype.remove],
  ];

  it.each(cases)('%s requires an admin token', (_route, handler) => {
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
      JwtAuthGuard,
      RolesGuard,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual(['ADMIN']);
  });
});
