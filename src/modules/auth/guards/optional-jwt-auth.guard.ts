import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    // إذا مافي توكن، خلّيه يعدي بدون ما يرمي خطأ (guest mode)
    if (!authHeader) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest(err: any, user: any) {
    // إذا في user رجعو، إذا لا خلّيه null (ما نرمي error)
    return user ?? null;
  }
}
