import { UnauthorizedException } from '@nestjs/common';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

describe('OptionalJwtAuthGuard', () => {
  const contextWithHeaders = (headers: Record<string, string>) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
    }) as any;

  it('allows requests without an authorization header as guests', () => {
    const guard = new OptionalJwtAuthGuard();

    expect(guard.canActivate(contextWithHeaders({}))).toBe(true);
  });

  it('rejects an invalid token instead of treating it as a guest', () => {
    const guard = new OptionalJwtAuthGuard();
    const context = contextWithHeaders({ authorization: 'Bearer invalid' });

    expect(() =>
      guard.handleRequest(new UnauthorizedException(), null, null, context),
    ).toThrow(UnauthorizedException);
  });
});
